import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ProfileRequest,
  ProfileResponse,
  GenericResponse,
  ChangePasswordRequest,
  DeleteAccountRequest,
} from '@folio/shared';
import { Button, FormField, ContentState } from '../design-system/primitives';
import { api, request, useAccess } from './client';
import { useSession } from './session';
import { useTheme } from '../state/theme';
export function Account() {
  const session = useSession();
  if (session.isPending) return <ContentState loading />;
  if (session.error) return <ContentState>{session.error.message}</ContentState>;
  return <AccountForms user={session.data.user} />;
}
function AccountForms({ user }: { user: z.infer<typeof ProfileResponse>['user'] }) {
  const active = useLocation().hash.slice(1) || 'profile';
  const navigate = useNavigate(),
    client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const profile = useForm<z.infer<typeof ProfileRequest>>({
    resolver: zodResolver(ProfileRequest),
    defaultValues: { name: user.name, timezone: user.timezone, preferences: user.preferences },
  });
  const password = useForm<z.infer<typeof ChangePasswordRequest>>({
    resolver: zodResolver(ChangePasswordRequest),
  });
  const removal = useForm<z.infer<typeof DeleteAccountRequest>>({
    resolver: zodResolver(DeleteAccountRequest),
  });
  const clear = () => {
    useAccess.setState({ token: null, status: 'anonymous' });
    client.clear();
    navigate('/auth/login');
  };
  const save = useMutation({
    mutationFn: (data: z.infer<typeof ProfileRequest>) =>
      api('/me', ProfileResponse, data, 'PATCH'),
    onSuccess: (data) => {
      client.setQueryData(['me'], data);
      useTheme.getState().setTheme(data.user.preferences.theme);
    },
  });
  const change = useMutation({
    mutationFn: (data: z.infer<typeof ChangePasswordRequest>) =>
      api('/auth/change-password', GenericResponse, data),
    onSuccess: clear,
  });
  const deletion = useMutation({
    mutationFn: (data: z.infer<typeof DeleteAccountRequest>) =>
      api('/me', GenericResponse, data, 'DELETE'),
    onSuccess: clear,
  });
  const logout = useMutation({
    mutationFn: () => api('/auth/logout', GenericResponse, {}),
    onSuccess: clear,
  });
  const download = useMutation({
    mutationFn: async (format: 'json' | 'csv') => {
      const response = await request('/me/export', { format });
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'folio-account.' + format;
      link.click();
      URL.revokeObjectURL(url);
      return 'Account data exported.';
    },
  });
  return (
    <>
      <h1 className="settings-title" data-figma="54:517">
        Settings
      </h1>
      <p className="type-caption text-secondary">
        Manage your workspace, portfolio preferences and account security.
      </p>
      <div className="settings-layout">
        <nav className="settings-menu" aria-label="Account sections">
          <p className="type-caption text-secondary">PREFERENCES</p>
          <a href="#profile" aria-current={active === 'profile' ? 'location' : undefined}>
            Profile &amp; Account
          </a>
          <span className="type-caption text-secondary">Portfolio Defaults — unavailable</span>
          <a href="#appearance" aria-current={active === 'appearance' ? 'location' : undefined}>
            Appearance
          </a>
          <span className="type-caption text-secondary">Notifications — unavailable</span>
          <a href="#security" aria-current={active === 'security' ? 'location' : undefined}>
            Security
          </a>
          <a href="#data" aria-current={active === 'data' ? 'location' : undefined}>
            Data &amp; Export
          </a>
        </nav>
        <div className="settings-content">
          <section id="profile" className="settings-section">
            <h2 className="type-section">Profile &amp; Account</h2>
            <div className="settings-profile" data-figma="54:535">
              <div className="settings-profile-header">
                <span className="settings-avatar type-section" aria-hidden="true">
                  {user.name
                    .trim()
                    .split(/\s+/)
                    .map((name) => name[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </span>
                <div>
                  <p className="type-body settings-profile-name" title={user.name}>
                    {user.name}
                  </p>
                  <p className="type-caption text-secondary">Personal investment workspace</p>
                </div>
                <Button onClick={() => profile.setFocus('name')}>Edit profile</Button>
              </div>
              <div className="settings-fields">
                <div>
                  <p className="type-caption text-secondary">EMAIL ADDRESS</p>
                  <p className="type-caption">{user.email}</p>
                </div>
                <div>
                  <p className="type-caption text-secondary">ACCOUNT TYPE</p>
                  <p className="type-caption">Verified personal account · INR default</p>
                </div>
              </div>
            </div>
            <form
              onSubmit={profile.handleSubmit((data) => save.mutate(data))}
              className="settings-form"
            >
              <div className="settings-fields">
                <FormField
                  label="Name"
                  autoComplete="name"
                  {...profile.register('name')}
                  error={profile.formState.errors.name?.message}
                />
                <FormField
                  label="Timezone"
                  {...profile.register('timezone')}
                  error={profile.formState.errors.timezone?.message}
                />
              </div>
              <h2 id="appearance" className="type-section">
                Appearance
              </h2>
              <div className="settings-fields">
                <label className="form-field type-caption text-secondary">
                  Interface theme
                  <select {...profile.register('preferences.theme')}>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </label>
                <label className="form-field type-caption text-secondary">
                  Number format
                  <select {...profile.register('preferences.numberFormat')}>
                    <option value="indian">Indian</option>
                    <option value="international">International</option>
                  </select>
                </label>
              </div>
              <Button
                kind="Primary"
                type="submit"
                className="settings-save"
                disabled={save.isPending}
              >
                Save changes
              </Button>
              {save.data && (
                <p role="status" className="type-caption text-secondary">
                  Preferences saved.
                </p>
              )}
              {save.error && (
                <p role="alert" className="type-caption text-negative">
                  {save.error.message}
                </p>
              )}
            </form>
          </section>
          <section id="security" className="settings-section">
            <h2 className="type-section">Security</h2>
            <form
              className="settings-form"
              onSubmit={password.handleSubmit((data) => change.mutate(data))}
            >
              <FormField
                label="Current password"
                type="password"
                autoComplete="current-password"
                {...password.register('currentPassword')}
                error={password.formState.errors.currentPassword?.message}
              />
              <FormField
                label="New password"
                type="password"
                autoComplete="new-password"
                {...password.register('password')}
                error={password.formState.errors.password?.message}
              />
              <Button type="submit" disabled={change.isPending}>
                Change password
              </Button>
              {change.error && (
                <p role="alert" className="type-caption text-negative">
                  {change.error.message}
                </p>
              )}
            </form>
            <p className="type-caption text-secondary">
              Two-factor authentication and session management are not available in this release.
            </p>
            <Button onClick={() => logout.mutate()} disabled={logout.isPending}>
              Sign out
            </Button>
            {logout.error && (
              <p role="alert" className="type-caption text-negative">
                {logout.error.message}
              </p>
            )}
          </section>
          <section id="data" className="settings-section">
            <h2 className="type-section">Data &amp; Export</h2>
            <p className="type-caption text-secondary">
              Export your account and audit data. Portfolio data is not implemented yet.
            </p>
            <Button onClick={() => download.mutate('json')} disabled={download.isPending}>
              Export JSON
            </Button>
            <Button onClick={() => download.mutate('csv')} disabled={download.isPending}>
              Export CSV
            </Button>
            {download.data && (
              <p className="type-caption text-secondary" role="status">
                {download.data}
              </p>
            )}
            {download.error && (
              <p role="alert" className="type-caption text-negative">
                {download.error.message}
              </p>
            )}
            <Button kind="Destructive" onClick={() => setConfirm(!confirm)}>
              Delete account
            </Button>
            {confirm && (
              <form
                className="settings-form"
                onSubmit={removal.handleSubmit((data) => deletion.mutate(data))}
              >
                <p className="type-body text-secondary">
                  This permanently removes your account, tokens and account data. Enter your
                  password and type DELETE to confirm.
                </p>
                <FormField
                  label="Confirm password"
                  type="password"
                  autoComplete="current-password"
                  {...removal.register('password')}
                  error={
                    removal.formState.errors.password
                      ? 'Enter your current password to delete your account.'
                      : undefined
                  }
                />
                <FormField
                  label="Type DELETE"
                  {...removal.register('confirmation')}
                  error={
                    removal.formState.errors.confirmation
                      ? 'Type DELETE exactly to confirm account deletion.'
                      : undefined
                  }
                />
                <Button kind="Destructive" type="submit" disabled={deletion.isPending}>
                  Permanently delete account
                </Button>
                <Button onClick={() => setConfirm(false)}>Cancel deletion</Button>
                {deletion.error && (
                  <p role="alert" className="type-caption text-negative">
                    {deletion.error.message}
                  </p>
                )}
              </form>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
