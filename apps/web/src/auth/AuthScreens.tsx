import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GenericResponse, SessionResponse, Email, Password } from '@folio/shared';
import { Button, FormField } from '../design-system/primitives';
import { api, acceptSession } from './client';
const Fields = z.strictObject({
  name: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),
});
type Fields = z.infer<typeof Fields>;
const titles: Record<string, string> = {
  login: 'Sign in to your account',
  register: 'Create your account',
  'verify-email': 'Verify your email',
  'forgot-password': 'Reset your password',
  'reset-password': 'Choose a new password',
  'session-expired': 'Your session has expired',
};
export function AuthScreens() {
  const location = useLocation(),
    navigate = useNavigate(),
    client = useQueryClient();
  const mode = location.pathname.split('/').at(-1) ?? 'login';
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') ?? '');
  useEffect(() => {
    if (location.hash) window.history.replaceState(null, '', location.pathname + location.search);
  }, [location.hash, location.pathname, location.search]);
  const schema = Fields.superRefine((input, ctx) => {
    if (
      ['login', 'register', 'forgot-password'].includes(mode) &&
      !Email.safeParse(input.email).success
    )
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'Enter a valid email address.' });
    if (
      ['register', 'reset-password'].includes(mode) &&
      !Password.safeParse(input.password).success
    )
      ctx.addIssue({ code: 'custom', path: ['password'], message: 'Use 12–128 characters.' });
    if (mode === 'login' && !input.password)
      ctx.addIssue({ code: 'custom', path: ['password'], message: 'Enter your password.' });
    if (mode === 'register' && (!input.name?.trim() || input.name.trim().length > 100))
      ctx.addIssue({
        code: 'custom',
        path: ['name'],
        message: 'Enter your name (up to 100 characters).',
      });
  });
  const form = useForm<Fields>({ resolver: zodResolver(schema) });
  const action = useMutation({
    mutationFn: async (input: Fields) => {
      if (mode === 'login') {
        const session = await api('/auth/login', SessionResponse, {
          email: input.email,
          password: input.password,
        });
        acceptSession(session);
        client.setQueryData(['me'], { user: session.user });
        navigate('/dashboard');
        return 'Signed in.';
      }
      if (mode === 'register')
        return (
          await api('/auth/register', GenericResponse, {
            name: input.name,
            email: input.email,
            password: input.password,
          })
        ).message;
      if (mode === 'forgot-password')
        return (await api('/auth/forgot-password', GenericResponse, { email: input.email }))
          .message;
      if (mode === 'verify-email')
        return (await api('/auth/verify-email', GenericResponse, { token })).message;
      if (mode === 'reset-password')
        return (
          await api('/auth/reset-password', GenericResponse, { token, password: input.password })
        ).message;
      return '';
    },
  });
  const resend = useMutation({
    mutationFn: async () =>
      api('/auth/resend-verification', GenericResponse, { email: form.getValues('email') }),
  });
  return (
    <div className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title" data-figma="57:283">
        <p className="auth-brand">Folio</p>
        <h1 id="auth-title" className="auth-title">
          {titles[mode] ?? 'Sign in to your account'}
        </h1>
        <p className="auth-description">
          {mode === 'login'
            ? 'Access portfolio valuation, analytics, news and the read-only AI assistant.'
            : mode === 'register'
              ? 'Create an account, then verify your email before signing in.'
              : mode === 'verify-email'
                ? 'Confirm your email address using the link delivered to your inbox.'
                : mode === 'session-expired'
                  ? 'Sign in again to continue securely.'
                  : 'Use the email link to securely reset your password.'}
        </p>
        {mode !== 'session-expired' && (
          <form className="auth-form" onSubmit={form.handleSubmit((input) => action.mutate(input))}>
            {mode === 'register' && (
              <FormField
                presentation="auth"
                label="Name"
                autoComplete="name"
                {...form.register('name')}
                error={form.formState.errors.name?.message}
              />
            )}
            {['login', 'register', 'forgot-password'].includes(mode) && (
              <FormField
                presentation="auth"
                label="Email address"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                {...form.register('email')}
                error={form.formState.errors.email?.message}
              />
            )}
            {['login', 'register', 'reset-password'].includes(mode) && (
              <FormField
                presentation="auth"
                label="Password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                {...form.register('password')}
                error={form.formState.errors.password?.message}
              />
            )}
            {mode === 'login' && (
              <Link className="auth-link" to="/auth/forgot-password">
                Forgot password?
              </Link>
            )}
            <Button
              kind="Primary"
              type="submit"
              className="auth-submit"
              disabled={action.isPending}
              state={action.isPending ? 'Disabled' : 'Default'}
              aria-busy={action.isPending}
            >
              {action.isPending
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign in'
                  : mode === 'register'
                    ? 'Create account'
                    : mode === 'verify-email'
                      ? 'Verify email'
                      : mode === 'reset-password'
                        ? 'Save password'
                        : 'Send reset link'}
            </Button>
          </form>
        )}
        {action.error && (
          <p className="auth-message" role="alert">
            {action.error.message}
          </p>
        )}
        {action.data && (
          <p className="auth-message" role="status">
            {action.data}
          </p>
        )}
        {resend.error && (
          <p className="auth-message" role="alert">
            {resend.error.message}
          </p>
        )}
        {resend.data && (
          <p className="auth-message" role="status">
            {resend.data.message}
          </p>
        )}
        <div className="auth-links">
          <Link className="auth-link" to={mode === 'login' ? '/auth/register' : '/auth/login'}>
            {mode === 'login' ? 'Create an account' : 'Back to sign in'}
          </Link>
          <Link className="auth-link" to="/privacy">
            Privacy
          </Link>
        </div>
        {mode === 'login' && (
          <Button
            kind="Tertiary"
            className="auth-message"
            disabled={resend.isPending}
            onClick={() => resend.mutate()}
          >
            Resend verification email
          </Button>
        )}
        <p className="auth-security">
          Argon2id passwords · email verification · short-lived access tokens · rotated httpOnly
          refresh cookies.
        </p>
        <p className="auth-footer">
          No brokerage, custody or trade execution. Demo portfolios arrive in a future release.
        </p>
      </section>
    </div>
  );
}
export function PrivacyPage() {
  return (
    <div className="auth-page">
      <section className="auth-card">
        <p className="auth-brand">Folio</p>
        <h1 className="auth-title">Your privacy</h1>
        <p className="auth-description">
          Folio stores your name, email, password hash and preferences to operate your account.
          Verification and session tokens are stored as hashes. Passwords and tokens are excluded
          from application logs and account exports.
        </p>
        <p className="auth-message">
          Security audit records include your IP address, browser information, action and time,
          retained for 90 days. Local development email goes to MailHog. No production email
          provider or external analytics is configured.
        </p>
        <p className="auth-message">
          Export your account data or delete your account in Settings. Deletion removes your
          account, credentials, tokens and associated audit records. An anonymous deletion event is
          retained without your identity. Financial services and AI data processing are not
          implemented in this phase.
        </p>
        <Link className="auth-link" to="/auth/login">
          Back to sign in
        </Link>
      </section>
    </div>
  );
}
