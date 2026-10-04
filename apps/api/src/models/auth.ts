import { Schema } from 'mongoose';
import type { Connection, InferSchemaType } from 'mongoose';
const userSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 100 },
    email: { type: String, required: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user', required: true },
    baseCurrency: { type: String, enum: ['INR'], default: 'INR', required: true },
    timezone: { type: String, default: 'Asia/Kolkata', required: true },
    preferences: {
      theme: { type: String, enum: ['dark', 'light'], default: 'dark', required: true },
      numberFormat: {
        type: String,
        enum: ['indian', 'international'],
        default: 'indian',
        required: true,
      },
    },
    emailVerifiedAt: { type: Date, default: null },
    failedLoginCount: { type: Number, default: 0, required: true },
    lockedUntil: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    authVersion: { type: Number, default: 0, required: true },
    actionTokenRevision: { type: Number, default: 0, required: true },
    lastLoginAt: { type: Date, default: null },
  },
  { strict: 'throw', timestamps: true },
);
const familySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revision: { type: Number, default: 0, required: true },
  },
  { strict: 'throw', timestamps: true },
);
familySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const refreshSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    familyId: { type: Schema.Types.ObjectId, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: Schema.Types.ObjectId, default: null },
    deviceInfo: { type: String, required: true },
    ip: { type: String, required: true },
  },
  { strict: 'throw', timestamps: true },
);
refreshSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshSchema.index({ userId: 1, familyId: 1, revokedAt: 1 });
const actionTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    purpose: { type: String, enum: ['verify', 'reset'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { strict: 'throw', timestamps: true },
);
actionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
actionTokenSchema.index({ userId: 1, purpose: 1, usedAt: 1 });
const auditSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, default: null, index: true },
    action: { type: String, required: true },
    ip: { type: String, required: true },
    userAgent: { type: String, required: true },
    meta: { reason: { type: String }, subjectHash: { type: String } },
    at: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { strict: 'throw' },
);
auditSchema.index({ userId: 1, at: 1 });
auditSchema.index({ action: 1, at: 1 });
auditSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export type UserRecord = InferSchemaType<typeof userSchema>;
export function authModels(connection: Connection) {
  return {
    User: connection.model('User', userSchema, 'users'),
    Family: connection.model('RefreshFamily', familySchema, 'refresh_families'),
    Refresh: connection.model('RefreshToken', refreshSchema, 'refresh_tokens'),
    ActionToken: connection.model('AuthToken', actionTokenSchema, 'auth_tokens'),
    Audit: connection.model('AuditLog', auditSchema, 'audit_logs'),
  };
}
export type AuthModels = ReturnType<typeof authModels>;
