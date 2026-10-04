// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { z } from 'zod';
import { SessionResponse } from '@folio/shared';
import { AuthScreens, PrivacyPage } from './AuthScreens';
import { Account } from './Account';
import { SessionBootstrap } from './session';
import { api, request, refreshSession, useAccess, acceptSession, ApiError } from './client';
import { useTheme } from '../state/theme';
const user = {
  id: '000000000000000000000001',
  name: 'Actual Account',
  email: 'account@example.test',
  role: 'user',
  baseCurrency: 'INR',
  timezone: 'Asia/Kolkata',
  preferences: { theme: 'dark', numberFormat: 'indian' },
  emailVerifiedAt: '2026-10-04T00:00:00.000Z',
  createdAt: '2026-10-04T00:00:00.000Z',
  updatedAt: '2026-10-04T00:00:00.000Z',
} as const;
const session = { accessToken: 'opaque-test-value', expiresIn: 900 as const, user };
const password = 'A strong test passphrase!';
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const error = (status: number, message = 'Rejected') =>
  response(
    { error: { code: 'TEST_ERROR', message, requestId: 'b0d97882-3785-421d-833d-d389cfb81b78' } },
    status,
  );
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  useAccess.setState({ token: null, status: 'anonymous' });
  fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ message: 'Email next step' }));
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function show(path: string, node = <AuthScreens />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(['me'], { user });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/dashboard" element={<h1>Protected landing</h1>} />
          <Route path="*" element={node} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
describe('auth client security boundaries', () => {
  it('waits for initial refresh before login, preventing a late refresh from clearing the new session', async () => {
    let complete: (value: Response) => void = () => {};
    fetcher
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            complete = resolve;
          }),
      )
      .mockResolvedValueOnce(response(session));
    const boot = refreshSession();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const login = api('/auth/login', SessionResponse, { email: user.email, password });
    expect(fetcher).toHaveBeenCalledTimes(1);
    complete(error(401));
    await boot;
    acceptSession(await login);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(useAccess.getState().status).toBe('authenticated');
  });
  it('keeps credentials in memory and sends the required mutation headers', async () => {
    acceptSession(session);
    await api('/auth/logout', z.object({ message: z.string() }), {});
    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.credentials).toBe('same-origin');
    expect(init?.headers).toMatchObject({
      'X-Folio-CSRF': '1',
      Authorization: 'Bearer opaque-test-value',
    });
    expect(localStorage.getItem('accessToken')).toBeNull();
  });
  it('deduplicates concurrent refresh requests', async () => {
    fetcher.mockResolvedValue(response(session));
    await Promise.all([refreshSession(), refreshSession()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(useAccess.getState().status).toBe('authenticated');
  });
  it('refreshes once and retries a protected request with the replacement access token', async () => {
    fetcher
      .mockResolvedValueOnce(error(401))
      .mockResolvedValueOnce(response(session))
      .mockResolvedValueOnce(response({ ok: true }));
    expect(await api('/me', z.object({ ok: z.boolean() }))).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('marks failed refresh as expired and reports the server response safely', async () => {
    fetcher.mockImplementation(async () => error(401, 'Expired'));
    await expect(api('/me', z.object({ ok: z.boolean() }))).rejects.toThrow('Expired');
    expect(useAccess.getState().status).toBe('expired');
  });
  it('turns network errors and malformed error envelopes into safe messages', async () => {
    fetcher.mockRejectedValueOnce(new Error('private transport detail'));
    await expect(request('/me')).rejects.toMatchObject({ status: 503, code: 'SERVER_UNAVAILABLE' });
    fetcher.mockResolvedValueOnce(response({ stack: 'private' }, 500));
    await expect(request('/me')).rejects.toThrow('The request failed');
  });
  it('bootstrap populates the account query from the real session response', async () => {
    fetcher.mockResolvedValue(response(session));
    const client = show('/', <SessionBootstrap />);
    await waitFor(() => expect(useAccess.getState().status).toBe('authenticated'));
    expect(client.getQueryData(['me'])).toEqual({ user });
  });
});
describe('auth forms and explicit states', () => {
  it('uses the existing disabled variant while a login request is pending', async () => {
    let complete: (value: Response) => void = () => {};
    fetcher.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    );
    show('/auth/login');
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: user.email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: /^Sign in$/ }));
    const pending = await screen.findByRole('button', { name: 'Please wait…' });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    expect(pending.getAttribute('data-state')).toBe('Disabled');
    expect(pending.getAttribute('data-figma')).toBe('2:4804');
    expect(pending.getAttribute('aria-busy')).toBe('true');
    complete(error(401, 'Unable to sign in'));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: /^Sign in$/ }).getAttribute('data-state')).toBe(
      'Default',
    );
  });
  it('rejects invalid registration fields before calling the API', async () => {
    show('/auth/register');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(3));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('registers with real submitted values and renders the generic response', async () => {
    show('/auth/register');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Account' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: user.email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('status');
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      name: 'New Account',
      email: user.email,
      password,
    });
  });
  it('signs in, stores the session and navigates to the protected route', async () => {
    fetcher.mockResolvedValue(response(session));
    show('/auth/login');
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: user.email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Protected landing' });
    expect(useAccess.getState().status).toBe('authenticated');
  });
  it('shows unverified/invalid/server errors without substituting a successful session', async () => {
    fetcher.mockResolvedValue(error(403, 'Verify your email'));
    show('/auth/login');
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: user.email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Verify your email');
    expect(useAccess.getState().status).toBe('anonymous');
  });
  it('resends a verification email using the entered address', async () => {
    show('/auth/login');
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: user.email } });
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));
    await screen.findByRole('status');
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/auth/resend-verification');
  });
  it('requests password reset with an account-neutral response', async () => {
    show('/auth/forgot-password');
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: user.email } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    await screen.findByRole('status');
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/auth/forgot-password');
  });
  it.each(['verify-email', 'reset-password'])(
    'submits %s only after explicit user action',
    async (mode) => {
      show('/auth/' + mode + '#token=' + 'a'.repeat(43));
      expect(fetcher).not.toHaveBeenCalled();
      if (mode === 'reset-password')
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
      fireEvent.click(
        screen.getByRole('button', {
          name: mode === 'verify-email' ? 'Verify email' : 'Save password',
        }),
      );
      await screen.findByRole('status');
      expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).token).toBe('a'.repeat(43));
    },
  );
  it('exposes explicit session-expired and privacy states', () => {
    show('/auth/session-expired');
    expect(screen.getByRole('heading', { name: 'Your session has expired' })).toBeTruthy();
    cleanup();
    show('/privacy', <PrivacyPage />);
    expect(screen.getByText(/retained for 90 days/)).toBeTruthy();
  });
});
describe('owned settings forms', () => {
  beforeEach(() => {
    useAccess.setState({ token: session.accessToken, status: 'authenticated' });
    fetcher.mockImplementation(async (_url, init) =>
      init?.method === 'PATCH'
        ? response({
            user: {
              ...user,
              name: 'Changed',
              preferences: { theme: 'light', numberFormat: 'international' },
            },
          })
        : response({ user }),
    );
  });
  it('saves preferences from the real server response and keeps later-tier settings unavailable', async () => {
    show('/settings', <Account />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Name')));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Preferences saved.');
    expect(useTheme.getState().theme).toBe('light');
    expect(screen.getByText(/Portfolio Defaults — unavailable/)).toBeTruthy();
  });
  it('shows an operational profile error and keeps the form available', async () => {
    fetcher.mockImplementation(async (_url, init) =>
      init?.method === 'PATCH' ? error(503, 'Security services unavailable') : response({ user }),
    );
    show('/settings', <Account />);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Security services unavailable',
    );
  });
  it('requires current-password credentials for change and signs out after success', async () => {
    fetcher.mockImplementation(async (url) =>
      String(url).endsWith('/change-password')
        ? response({ message: 'Changed' })
        : response({ user }),
    );
    show('/settings', <Account />);
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: password } });
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: password + 'New' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(useAccess.getState().status).toBe('anonymous'));
  });
  it('deletion requires explicit confirmation and offers cancellation', async () => {
    show('/settings', <Account />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Permanently delete account' }));
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
    expect(screen.getByText('Enter your current password to delete your account.')).toBeTruthy();
    expect(screen.getByText('Type DELETE exactly to confirm account deletion.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: password } });
    fireEvent.change(screen.getByLabelText('Type DELETE'), { target: { value: 'delete' } });
    fireEvent.click(screen.getByRole('button', { name: 'Permanently delete account' }));
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
    expect(screen.getByRole('alert').textContent).toBe(
      'Type DELETE exactly to confirm account deletion.',
    );
    expect(fetcher.mock.calls.filter((call) => call[1]?.method === 'DELETE')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel deletion' }));
    expect(screen.queryByLabelText('Type DELETE')).toBeNull();
  });
  it('revokes the current session on logout', async () => {
    fetcher.mockImplementation(async (url) =>
      String(url).endsWith('/logout') ? response({ message: 'Signed out' }) : response({ user }),
    );
    show('/settings', <Account />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(useAccess.getState().status).toBe('anonymous'));
  });
  it('uses safe API errors as typed operational failures', () => {
    const err = new ApiError(429, 'RATE_LIMITED', 'Try later');
    expect(err.status).toBe(429);
    expect(err.code).toBe('RATE_LIMITED');
  });
});
