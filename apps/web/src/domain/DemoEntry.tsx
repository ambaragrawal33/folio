import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { SessionResponse } from '@folio/shared';
import { api, acceptSession } from '../auth/client';
import { Button } from '../design-system/primitives';
export function DemoEntry() {
  const navigate = useNavigate(),
    client = useQueryClient();
  const status = useQuery({
    queryKey: ['demo-enabled'],
    queryFn: () => api('/auth/demo', z.strictObject({ enabled: z.boolean() })),
    retry: false,
    staleTime: Infinity,
  });
  const action = useMutation({
    mutationFn: () => api('/auth/demo', SessionResponse, {}),
    onSuccess: (session) => {
      client.clear();
      acceptSession(session);
      client.setQueryData(['me'], { user: session.user });
      navigate('/dashboard');
    },
  });
  if (!status.data?.enabled) return null;
  return (
    <div className="auth-message">
      <Button disabled={action.isPending} onClick={() => action.mutate()}>
        Explore read-only demo
      </Button>
      <p className="type-caption text-secondary">
        Isolated, labelled financial fixtures. No account or ledger changes.
      </p>
      {action.error && (
        <p role="alert" className="text-negative">
          {action.error.message}
        </p>
      )}
    </div>
  );
}
