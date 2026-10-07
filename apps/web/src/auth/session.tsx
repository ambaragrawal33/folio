import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ProfileResponse } from '@folio/shared';
import { useAccess, api, refreshSession } from './client';
export function SessionBootstrap() {
  const client = useQueryClient();
  useEffect(() => {
    void refreshSession().then((session) => {
      if (session) client.setQueryData(['me'], { user: session.user });
    });
  }, [client]);
  return null;
}
export function useSession() {
  const status = useAccess((s) => s.status);
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api('/me', ProfileResponse),
    enabled: status === 'authenticated',
    retry: false,
  });
}
