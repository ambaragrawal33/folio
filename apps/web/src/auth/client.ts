import { create } from 'zustand';
import type { z } from 'zod';
import { ErrorEnvelope, SessionResponse } from '@folio/shared';
import { useTheme } from '../state/theme';
export const useAccess = create<{
  token: string | null;
  status: 'loading' | 'anonymous' | 'authenticated' | 'expired';
}>(() => ({ token: null, status: 'loading' }));
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
let refreshing: Promise<z.infer<typeof SessionResponse> | null> | null = null;
let sessionQueue: Promise<void> = Promise.resolve();
function sessionOperation<T>(work: () => Promise<T>): Promise<T> {
  const run = () =>
    'locks' in navigator ? navigator.locks.request('folio-refresh', work) : work();
  const result = sessionQueue.then(run, run);
  sessionQueue = result.then(
    () => {},
    () => {},
  );
  return result;
}
export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  input?: unknown,
  method = input === undefined ? 'GET' : 'POST',
  retry = true,
): Promise<T> {
  return schema.parse(await (await request(path, input, method, retry)).json());
}
export async function request(
  path: string,
  input?: unknown,
  method = input === undefined ? 'GET' : 'POST',
  retry = true,
): Promise<Response> {
  let response: Response;
  try {
    const send = () => {
      const token = useAccess.getState().token;
      return fetch('/api/v1' + path, {
        method,
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Folio-CSRF': '1',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      });
    };
    const cookieMutation =
      ['/auth/login', '/auth/logout', '/auth/reset-password', '/auth/change-password'].includes(
        path,
      ) ||
      (path === '/me' && method === 'DELETE');
    response = await (cookieMutation ? sessionOperation(send) : send());
  } catch {
    throw new ApiError(
      503,
      'SERVER_UNAVAILABLE',
      'Unable to reach Folio. Please try again shortly.',
    );
  }
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return request(path, input, method, false);
    useAccess.setState({ token: null, status: 'expired' });
  }
  if (!response.ok) {
    const data = ErrorEnvelope.safeParse(await response.json().catch(() => null));
    throw new ApiError(
      response.status,
      data.success ? data.data.error.code : 'REQUEST_FAILED',
      data.success ? data.data.error.message : 'The request failed. Please try again.',
    );
  }
  return response;
}
export function acceptSession(session: z.infer<typeof SessionResponse>) {
  useAccess.setState({ token: session.accessToken, status: 'authenticated' });
  if (!new URLSearchParams(window.location.search).has('theme'))
    useTheme.getState().setTheme(session.user.preferences.theme);
}
export async function refreshSession() {
  if (refreshing) return refreshing;
  const run = async () => {
    try {
      const session = await api('/auth/refresh', SessionResponse, {}, 'POST', false);
      acceptSession(session);
      return session;
    } catch {
      useAccess.setState({ token: null, status: 'anonymous' });
      return null;
    }
  };
  refreshing = sessionOperation(run).finally(() => {
    refreshing = null;
  });
  return refreshing;
}
