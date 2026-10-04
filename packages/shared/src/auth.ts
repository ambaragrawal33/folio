import { z } from 'zod';
export const Email = z.string().trim().toLowerCase().email().max(254);
export const Password = z.string().min(12).max(128);
export const SecretToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const UserPreferences = z.strictObject({
  theme: z.enum(['dark', 'light']),
  numberFormat: z.enum(['indian', 'international']),
});
export const Timezone = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Use a valid IANA timezone.');
export const PublicUser = z.strictObject({
  id: z.string().regex(/^[a-f0-9]{24}$/),
  name: z.string().min(1).max(100),
  email: Email,
  role: z.enum(['user', 'admin']),
  baseCurrency: z.literal('INR'),
  timezone: Timezone,
  preferences: UserPreferences,
  emailVerifiedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type PublicUser = z.infer<typeof PublicUser>;
export const RegisterRequest = z.strictObject({
  name: z.string().trim().min(1).max(100),
  email: Email,
  password: Password,
});
export const LoginRequest = z.strictObject({ email: Email, password: z.string().min(1).max(128) });
export const EmailRequest = z.strictObject({ email: Email });
export const VerifyRequest = z.strictObject({ token: SecretToken });
export const ResetRequest = z.strictObject({ token: SecretToken, password: Password });
export const ChangePasswordRequest = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  password: Password,
});
export const ProfileRequest = z
  .strictObject({
    name: z.string().trim().min(1).max(100).optional(),
    timezone: Timezone.optional(),
    preferences: UserPreferences.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one preference is required.');
export const DeleteAccountRequest = z.strictObject({
  password: z.string().min(1).max(128),
  confirmation: z.literal('DELETE'),
});
export const EmptyRequest = z.strictObject({});
export const GenericResponse = z.strictObject({ message: z.string() });
export const SessionResponse = z.strictObject({
  accessToken: z.string().min(1),
  expiresIn: z.literal(900),
  user: PublicUser,
});
export const ProfileResponse = z.strictObject({ user: PublicUser });
export const ExportRequest = z.strictObject({ format: z.enum(['json', 'csv']).default('json') });
export const AuditRecord = z.strictObject({
  action: z.string(),
  at: z.iso.datetime(),
  ip: z.string(),
  userAgent: z.string(),
  reason: z.string().optional(),
});
export const AccountExport = z.strictObject({
  exportedAt: z.iso.datetime(),
  user: PublicUser,
  audit: z.array(AuditRecord),
  scope: z.literal('Phase 2 account and audit data; financial collections are not implemented.'),
});
export const authContracts = [
  {
    method: 'post',
    path: '/api/v1/auth/register',
    request: RegisterRequest,
    response: GenericResponse,
    authenticated: false,
  },
  {
    method: 'post',
    path: '/api/v1/auth/verify-email',
    request: VerifyRequest,
    response: GenericResponse,
    authenticated: false,
  },
  {
    method: 'post',
    path: '/api/v1/auth/resend-verification',
    request: EmailRequest,
    response: GenericResponse,
    authenticated: false,
  },
  {
    method: 'post',
    path: '/api/v1/auth/login',
    request: LoginRequest,
    response: SessionResponse,
    authenticated: false,
  },
  {
    method: 'post',
    path: '/api/v1/auth/refresh',
    request: EmptyRequest,
    response: SessionResponse,
    authenticated: false,
  },
  {
    method: 'post',
    path: '/api/v1/auth/logout',
    request: EmptyRequest,
    response: GenericResponse,
    authenticated: false,
  },
  {
    method: 'post',
    path: '/api/v1/auth/forgot-password',
    request: EmailRequest,
    response: GenericResponse,
    authenticated: false,
  },
  {
    method: 'post',
    path: '/api/v1/auth/reset-password',
    request: ResetRequest,
    response: GenericResponse,
    authenticated: false,
  },
  {
    method: 'post',
    path: '/api/v1/auth/change-password',
    request: ChangePasswordRequest,
    response: GenericResponse,
    authenticated: true,
  },
  {
    method: 'get',
    path: '/api/v1/me',
    request: EmptyRequest,
    response: ProfileResponse,
    authenticated: true,
  },
  {
    method: 'patch',
    path: '/api/v1/me',
    request: ProfileRequest,
    response: ProfileResponse,
    authenticated: true,
  },
  {
    method: 'post',
    path: '/api/v1/me/export',
    request: ExportRequest,
    response: AccountExport,
    authenticated: true,
  },
  {
    method: 'delete',
    path: '/api/v1/me',
    request: DeleteAccountRequest,
    response: GenericResponse,
    authenticated: true,
  },
] as const;
