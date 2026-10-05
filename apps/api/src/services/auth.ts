import { createHmac, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { Types } from 'mongoose';
import type { Connection, ClientSession, HydratedDocument } from 'mongoose';
import { PublicUser, AccountExport } from '@folio/shared';
import type { DomainExport } from '@folio/shared';
import { assertLocalFixtureEnv } from '../config/env.ts';
import type { Env } from '../config/env.ts';
import { authModels } from '../models/auth.ts';
import type { UserRecord } from '../models/auth.ts';
import type { PasswordProvider } from '../providers/password-auth.ts';
import type { EmailProvider } from '../providers/email.ts';
import { HttpError } from '../utils/http-error.ts';
export interface RequestMeta {
  ip: string;
  userAgent: string;
}
export interface Identity {
  user: HydratedDocument<UserRecord>;
  familyId: string;
}
export const GENERIC_EMAIL_MESSAGE =
  'If this address is eligible, you will receive an email with the next step.';
const unauthorized = () =>
  new HttpError(401, 'AUTH_REQUIRED', 'Your session has expired. Please sign in again.');
export class AuthService {
  readonly models;
  private readonly signingKey: Uint8Array;
  private dummyHash = '';
  private resources:
    | {
        export: (userId: Types.ObjectId) => Promise<DomainExport>;
        delete: (userId: Types.ObjectId, session: ClientSession) => Promise<void>;
      }
    | undefined;
  registerAccountResources(resources: NonNullable<AuthService['resources']>) {
    this.resources = resources;
  }
  private requireWrites(identity?: Identity) {
    if (this.env.DEMO_MODE || identity?.user.demoReadonly)
      throw new HttpError(403, 'DEMO_READ_ONLY', 'This public demo is read-only.');
  }
  readonly connection: Connection;
  private readonly env: Env;
  private readonly passwords: PasswordProvider;
  private readonly email: EmailProvider;
  private readonly clock: () => Date;
  constructor(
    connection: Connection,
    env: Env,
    passwords: PasswordProvider,
    email: EmailProvider,
    clock: () => Date = () => new Date(),
  ) {
    this.connection = connection;
    this.env = env;
    this.passwords = passwords;
    this.email = email;
    this.clock = clock;
    this.models = authModels(connection);
    this.signingKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  }
  async initialize() {
    if (this.env.LOCAL_FIXTURE_MODE) {
      assertLocalFixtureEnv(this.env);
      if (this.connection.name !== new URL(this.env.MONGODB_URI).pathname.slice(1))
        throw new Error('Local fixture connection does not match its isolated database');
    }
    await Promise.all(Object.values(this.models).map((m) => m.init()));
    this.dummyHash = await this.passwords.hash(randomBytes(32).toString('base64url'));
  }
  digest(value: string, purpose: string) {
    return createHmac('sha256', this.env.REFRESH_TOKEN_SECRET)
      .update(purpose + '\0' + value)
      .digest('hex');
  }
  publicUser(user: HydratedDocument<UserRecord>) {
    const preferences = user.preferences;
    if (!preferences) throw new Error('User preferences are missing');
    return PublicUser.parse({
      id: user._id.toHexString(),
      ...(user.demoReadonly ? { demoReadonly: true } : {}),
      ...(this.env.LOCAL_FIXTURE_MODE ? { localFixture: true } : {}),
      name: user.name,
      email: user.email,
      role: user.role,
      baseCurrency: user.baseCurrency,
      timezone: user.timezone,
      preferences: { theme: preferences.theme, numberFormat: preferences.numberFormat },
      emailVerifiedAt: user.emailVerifiedAt?.toISOString(),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
  }
  async audit(
    action: string,
    userId: Types.ObjectId | null,
    meta: RequestMeta,
    reason?: string,
    subjectHash?: string,
    session?: ClientSession,
  ) {
    const at = this.clock();
    await this.models.Audit.create(
      [
        {
          userId,
          action,
          ip: meta.ip.slice(0, 100),
          userAgent: meta.userAgent.slice(0, 300),
          meta: { ...(reason ? { reason } : {}), ...(subjectHash ? { subjectHash } : {}) },
          at,
          expiresAt: new Date(at.getTime() + 90 * 86400000),
        },
      ],
      session ? { session } : {},
    );
  }
  private async deliver(
    user: HydratedDocument<UserRecord>,
    purpose: 'verify' | 'reset',
    meta: RequestMeta,
  ) {
    const token = randomBytes(32).toString('base64url'),
      now = this.clock();
    await this.connection.transaction(async (session) => {
      await this.models.User.updateOne(
        { _id: user._id },
        { $inc: { actionTokenRevision: 1 } },
        { session },
      );
      await this.models.ActionToken.updateMany(
        { userId: user._id, purpose, usedAt: null },
        { $set: { usedAt: now } },
        { session },
      );
      await this.models.ActionToken.create(
        [
          {
            userId: user._id,
            purpose,
            tokenHash: this.digest(token, purpose),
            expiresAt: new Date(now.getTime() + (purpose === 'reset' ? 30 * 60000 : 86400000)),
          },
        ],
        { session },
      );
    });
    const url = new URL(
      purpose === 'verify' ? '/auth/verify-email' : '/auth/reset-password',
      this.env.WEB_ORIGIN,
    );
    // Fragment keeps bearer action secrets out of HTTP request paths, referrers and server logs.
    url.hash = 'token=' + token;
    try {
      await this.email.send({ to: user.email, purpose, url: url.toString() });
      await this.audit('email.' + purpose + '.delivered', user._id, meta);
    } catch {
      await this.audit(
        'email.' + purpose + '.delivery_failed',
        user._id,
        meta,
        'transport_unavailable',
      );
    }
  }
  async register(input: { name: string; email: string; password: string }, meta: RequestMeta) {
    this.requireWrites();
    const passwordHash = await this.passwords.hash(input.password);
    let user = await this.models.User.findOne({ email: input.email });
    if (!user) {
      try {
        user = await this.models.User.create({
          name: input.name,
          email: input.email,
          passwordHash,
        });
        await this.audit('auth.register', user._id, meta);
      } catch (error) {
        if (!(
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 11000
        ))
          throw error;
        user = await this.models.User.findOne({ email: input.email });
      }
    }
    if (user && !user.emailVerifiedAt) await this.deliver(user, 'verify', meta);
    return { message: GENERIC_EMAIL_MESSAGE };
  }
  async requestEmail(address: string, purpose: 'verify' | 'reset', meta: RequestMeta) {
    this.requireWrites();
    const user = await this.models.User.findOne({ email: address });
    if (user && (purpose === 'reset' || !user.emailVerifiedAt))
      await this.deliver(user, purpose, meta);
    return { message: GENERIC_EMAIL_MESSAGE };
  }
  async verify(token: string, meta: RequestMeta) {
    this.requireWrites();
    const now = this.clock();
    await this.connection.transaction(async (session) => {
      const record = await this.models.ActionToken.findOneAndUpdate(
        {
          tokenHash: this.digest(token, 'verify'),
          purpose: 'verify',
          usedAt: null,
          expiresAt: { $gt: now },
        },
        { $set: { usedAt: now } },
        { session, returnDocument: 'after' },
      );
      if (!record)
        throw new HttpError(
          400,
          'TOKEN_INVALID',
          'This verification link is invalid or expired. Request a new link.',
        );
      const user = await this.models.User.findByIdAndUpdate(
        record.userId,
        { $set: { emailVerifiedAt: now } },
        { session, returnDocument: 'after' },
      );
      if (!user)
        throw new HttpError(400, 'TOKEN_INVALID', 'This verification link is invalid or expired.');
      await this.audit('auth.email_verified', user._id, meta, undefined, undefined, session);
    });
    return { message: 'Email verified. You can now sign in.' };
  }
  private async bundle(
    user: HydratedDocument<UserRecord>,
    familyId: Types.ObjectId,
    refreshToken: string,
  ) {
    const now = Math.floor(this.clock().getTime() / 1000);
    const accessToken = await new SignJWT({ fid: familyId.toHexString(), v: user.authVersion })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user._id.toHexString())
      .setIssuer('folio')
      .setAudience('folio-web')
      .setIssuedAt(now)
      .setExpirationTime(now + 900)
      .sign(this.signingKey);
    return {
      refreshToken,
      response: { accessToken, expiresIn: 900 as const, user: this.publicUser(user) },
    };
  }
  async login(input: { email: string; password: string }, meta: RequestMeta) {
    this.requireWrites();
    let user = await this.models.User.findOne({ email: input.email }).select('+passwordHash');
    const passwordCorrect = await this.passwords.verify(
      user?.passwordHash ?? this.dummyHash,
      input.password,
    );
    const now = this.clock();
    if (!user || !passwordCorrect || (user.lockedUntil && user.lockedUntil > now)) {
      if (user && !passwordCorrect) {
        const failed = await this.models.User.findByIdAndUpdate(
          user._id,
          { $inc: { failedLoginCount: 1 } },
          { returnDocument: 'after' },
        );
        if (failed && failed.failedLoginCount >= 5)
          await this.models.User.updateOne(
            { _id: user._id },
            {
              $max: {
                lockedUntil: new Date(
                  now.getTime() +
                    Math.min(900, 30 * 2 ** Math.min(failed.failedLoginCount - 5, 5)) * 1000,
                ),
              },
            },
          );
      }
      await this.audit(
        'auth.login_failed',
        user ? user._id : null,
        meta,
        'invalid_or_locked',
        this.digest(input.email, 'account'),
      );
      throw new HttpError(
        401,
        'INVALID_CREDENTIALS',
        'Unable to sign in. Check your credentials or try again later.',
      );
    }
    if (!user.emailVerifiedAt)
      throw new HttpError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before signing in.');
    const token = randomBytes(32).toString('base64url');
    const bundle = await this.connection.transaction(async (session) => {
      // Updating the user serializes login with reset/change/delete, so an old password cannot create a session after invalidation.
      user = await this.models.User.findOneAndUpdate(
        { _id: user!._id, authVersion: user!.authVersion },
        { $set: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now } },
        { session, returnDocument: 'after' },
      );
      if (!user) throw unauthorized();
      const expiresAt = new Date(now.getTime() + 30 * 86400000);
      const family = (
        await this.models.Family.create([{ userId: user._id, expiresAt }], { session })
      )[0]!;
      await this.models.Refresh.create(
        [
          {
            userId: user._id,
            familyId: family._id,
            tokenHash: this.digest(token, 'refresh'),
            expiresAt,
            deviceInfo: meta.userAgent.slice(0, 300),
            ip: meta.ip.slice(0, 100),
          },
        ],
        { session },
      );
      await this.audit('auth.login', user._id, meta, undefined, undefined, session);
      return this.bundle(user, family._id, token);
    });
    return bundle;
  }
  async refresh(token: string, meta: RequestMeta) {
    const now = this.clock();
    const result = await this.connection.transaction(async (session) => {
      const record = await this.models.Refresh.findOne({
        tokenHash: this.digest(token, 'refresh'),
      }).session(session);
      if (!record || record.expiresAt <= now) throw unauthorized();
      const family = await this.models.Family.findOneAndUpdate(
        { _id: record.familyId, revokedAt: null, expiresAt: { $gt: now } },
        { $inc: { revision: 1 } },
        { session, returnDocument: 'after' },
      );
      if (!family) throw unauthorized();
      if (record.revokedAt || record.replacedBy) {
        await this.models.Family.updateOne(
          { _id: family._id },
          { $set: { revokedAt: now } },
          { session },
        );
        await this.models.Refresh.updateMany(
          { familyId: family._id },
          { $set: { revokedAt: now } },
          { session },
        );
        await this.audit(
          'auth.refresh_reuse',
          record.userId,
          meta,
          'family_revoked',
          undefined,
          session,
        );
        return { reused: true as const };
      }
      const user = await this.models.User.findById(record.userId).session(session);
      if (!user?.emailVerifiedAt || user.demoReadonly !== this.env.DEMO_MODE) throw unauthorized();
      const replacement = randomBytes(32).toString('base64url'),
        replacementId = new Types.ObjectId();
      await this.models.Refresh.updateOne(
        { _id: record._id },
        { $set: { revokedAt: now, replacedBy: replacementId } },
        { session },
      );
      await this.models.Refresh.create(
        [
          {
            _id: replacementId,
            userId: user._id,
            familyId: family._id,
            tokenHash: this.digest(replacement, 'refresh'),
            expiresAt: family.expiresAt,
            deviceInfo: meta.userAgent.slice(0, 300),
            ip: meta.ip.slice(0, 100),
          },
        ],
        { session },
      );
      await this.audit('auth.refresh', user._id, meta, undefined, undefined, session);
      return { reused: false as const, bundle: await this.bundle(user, family._id, replacement) };
    });
    if (result.reused) throw unauthorized(); // Throw after committing replay revocation.
    return result.bundle;
  }
  async authenticate(accessToken: string): Promise<Identity> {
    try {
      const { payload } = await jwtVerify(accessToken, this.signingKey, {
        algorithms: ['HS256'],
        issuer: 'folio',
        audience: 'folio-web',
        currentDate: this.clock(),
      });
      if (
        !payload.sub ||
        !Types.ObjectId.isValid(payload.sub) ||
        typeof payload.fid !== 'string' ||
        !Types.ObjectId.isValid(payload.fid) ||
        typeof payload.v !== 'number'
      )
        throw unauthorized();
      const [user, family] = await Promise.all([
        this.models.User.findOne({ _id: payload.sub, authVersion: payload.v }),
        this.models.Family.findOne({
          _id: payload.fid,
          userId: payload.sub,
          revokedAt: null,
          expiresAt: { $gt: this.clock() },
        }),
      ]);
      if (!user?.emailVerifiedAt || !family || user.demoReadonly !== this.env.DEMO_MODE)
        throw unauthorized();
      return { user, familyId: payload.fid };
    } catch {
      throw unauthorized();
    }
  }
  async logout(token: string, meta: RequestMeta) {
    const record = await this.models.Refresh.findOne({ tokenHash: this.digest(token, 'refresh') });
    if (record)
      await this.connection.transaction(async (session) => {
        await this.models.Family.updateOne(
          { _id: record.familyId },
          { $set: { revokedAt: this.clock() }, $inc: { revision: 1 } },
          { session },
        );
        await this.models.Refresh.updateMany(
          { familyId: record.familyId },
          { $set: { revokedAt: this.clock() } },
          { session },
        );
        await this.audit('auth.logout', record.userId, meta, undefined, undefined, session);
      });
    return { message: 'Signed out.' };
  }
  demoEnabled() {
    return this.env.DEMO_MODE;
  }
  async demoSession(meta: RequestMeta) {
    if (!this.env.DEMO_MODE)
      throw new HttpError(
        404,
        'DEMO_UNAVAILABLE',
        'The read-only demo is unavailable in this deployment.',
      );
    const token = randomBytes(32).toString('base64url');
    return this.connection.transaction(async (session) => {
      const user = await this.models.User.findOneAndUpdate(
        { demoReadonly: true, email: 'demo@folio.invalid', emailVerifiedAt: { $ne: null } },
        { $set: { lastLoginAt: this.clock() } },
        { session, returnDocument: 'after' },
      );
      if (!user)
        throw new HttpError(503, 'DEMO_UNAVAILABLE', 'The isolated demo has not been initialized.');
      const expiresAt = new Date(this.clock().getTime() + 30 * 86400000);
      const [family] = await this.models.Family.create([{ userId: user._id, expiresAt }], {
        session,
      });
      await this.models.Refresh.create(
        [
          {
            userId: user._id,
            familyId: family!._id,
            tokenHash: this.digest(token, 'refresh'),
            expiresAt,
            deviceInfo: meta.userAgent.slice(0, 300),
            ip: meta.ip.slice(0, 100),
          },
        ],
        { session },
      );
      await this.audit('auth.demo_session', user._id, meta, undefined, undefined, session);
      return this.bundle(user, family!._id, token);
    });
  }
  private async invalidate(userId: Types.ObjectId, session: ClientSession) {
    await this.models.Family.updateMany(
      { userId },
      { $set: { revokedAt: this.clock() }, $inc: { revision: 1 } },
      { session },
    );
    await this.models.Refresh.updateMany(
      { userId },
      { $set: { revokedAt: this.clock() } },
      { session },
    );
    await this.models.ActionToken.updateMany(
      { userId, usedAt: null },
      { $set: { usedAt: this.clock() } },
      { session },
    );
  }
  async reset(token: string, password: string, meta: RequestMeta) {
    this.requireWrites();
    const hash = await this.passwords.hash(password),
      now = this.clock();
    await this.connection.transaction(async (session) => {
      const record = await this.models.ActionToken.findOneAndUpdate(
        {
          tokenHash: this.digest(token, 'reset'),
          purpose: 'reset',
          usedAt: null,
          expiresAt: { $gt: now },
        },
        { $set: { usedAt: now } },
        { session, returnDocument: 'after' },
      );
      if (!record)
        throw new HttpError(
          400,
          'TOKEN_INVALID',
          'This reset link is invalid or expired. Request a new link.',
        );
      const user = await this.models.User.findByIdAndUpdate(
        record.userId,
        {
          $set: {
            passwordHash: hash,
            passwordChangedAt: now,
            failedLoginCount: 0,
            lockedUntil: null,
          },
          $inc: { authVersion: 1 },
        },
        { session, returnDocument: 'after' },
      );
      if (!user)
        throw new HttpError(400, 'TOKEN_INVALID', 'This reset link is invalid or expired.');
      await this.invalidate(user._id, session);
      await this.audit('auth.password_reset', user._id, meta, undefined, undefined, session);
    });
    return { message: 'Password reset. Sign in with your new password.' };
  }
  async changePassword(
    identity: Identity,
    currentPassword: string,
    password: string,
    meta: RequestMeta,
  ) {
    this.requireWrites(identity);
    const user = await this.models.User.findById(identity.user._id).select('+passwordHash');
    if (!user || !(await this.passwords.verify(user.passwordHash, currentPassword)))
      throw new HttpError(400, 'PASSWORD_INVALID', 'The current password is incorrect.');
    const hash = await this.passwords.hash(password);
    await this.connection.transaction(async (session) => {
      const changed = await this.models.User.findOneAndUpdate(
        { _id: user._id, authVersion: user.authVersion },
        { $set: { passwordHash: hash, passwordChangedAt: this.clock() }, $inc: { authVersion: 1 } },
        { session, returnDocument: 'after' },
      );
      if (!changed) throw unauthorized();
      await this.invalidate(user._id, session);
      await this.audit('auth.password_changed', user._id, meta, undefined, undefined, session);
    });
    return { message: 'Password changed. Sign in again.' };
  }
  async updateProfile(
    identity: Identity,
    input: {
      name?: string | undefined;
      timezone?: string | undefined;
      preferences?:
        { theme: 'dark' | 'light'; numberFormat: 'indian' | 'international' } | undefined;
    },
    meta: RequestMeta,
  ) {
    this.requireWrites(identity);
    const user = await this.models.User.findOneAndUpdate(
      { _id: identity.user._id, authVersion: identity.user.authVersion },
      { $set: input },
      { returnDocument: 'after', runValidators: true },
    );
    if (!user) throw unauthorized();
    await this.audit('account.updated', user._id, meta);
    return { user: this.publicUser(user) };
  }
  async exportAccount(identity: Identity) {
    if (identity.user.demoReadonly)
      throw new HttpError(
        403,
        'DEMO_READ_ONLY',
        'Privacy export is unavailable for the shared read-only demo identity.',
      );
    const audit = await this.models.Audit.find({ userId: identity.user._id })
      .sort({ at: 1, _id: 1 })
      .select('action at ip userAgent meta.reason')
      .lean();
    return AccountExport.parse({
      exportedAt: this.clock().toISOString(),
      user: this.publicUser(identity.user),
      audit: audit.map((row) => ({
        action: row.action,
        at: row.at.toISOString(),
        ip: row.ip,
        userAgent: row.userAgent,
        ...(row.meta?.reason ? { reason: row.meta.reason } : {}),
      })),
      scope: this.resources
        ? 'Account, audit and owned portfolio/economic ledger/void data.'
        : 'Phase 2 account and audit data; financial collections are not implemented.',
      ...(this.resources ? { domain: await this.resources.export(identity.user._id) } : {}),
    });
  }
  async deleteAccount(identity: Identity, password: string, _meta: RequestMeta) {
    this.requireWrites(identity);
    const user = await this.models.User.findById(identity.user._id).select('+passwordHash');
    if (!user || !(await this.passwords.verify(user.passwordHash, password)))
      throw new HttpError(400, 'PASSWORD_INVALID', 'The password is incorrect.');
    await this.connection.transaction(async (session) => {
      const deleted = await this.models.User.deleteOne(
        { _id: user._id, authVersion: user.authVersion },
        { session },
      );
      if (deleted.deletedCount !== 1) throw unauthorized();
      await this.models.Family.deleteMany({ userId: user._id }, { session });
      await this.models.Refresh.deleteMany({ userId: user._id }, { session });
      await this.models.ActionToken.deleteMany({ userId: user._id }, { session });
      await this.models.Audit.deleteMany({ userId: user._id }, { session });
      await this.resources?.delete(user._id, session);
      // New resource models must register their ownership-aware cascade/export before they ship (Phase 3+).
      await this.audit(
        'account.deleted',
        null,
        { ip: 'removed', userAgent: 'removed' },
        'account_and_credentials_removed',
        undefined,
        session,
      );
    });
    return {
      message: this.resources
        ? 'Your account and its owned data have been deleted.'
        : 'Your account and its Phase 2 data have been deleted.',
    };
  }
}
