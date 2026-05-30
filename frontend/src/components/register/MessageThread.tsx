'use client';

import { useQuery } from '@tanstack/react-query';
import { messagesApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';

interface Props {
  tripId: string | null;
  messageCount: number;
  enabled: boolean;
}

export default function MessageThread({ tripId, messageCount, enabled }: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['register-thread', tripId],
    enabled: enabled && !!tripId,
    queryFn: () =>
      messagesApi.getTripMessages(tripId as string, { limit: 200 }).then(
        (r) => r.data as { messages: Message[]; total: number },
      ),
    staleTime: 60_000,
  });

  if (!tripId) {
    return (
      <p className="text-[13px] text-ink-500 italic">Esta carga no generó conversación.</p>
    );
  }
  if (messageCount === 0) {
    return <p className="text-[13px] text-ink-500 italic">Sin mensajes intercambiados.</p>;
  }
  if (!enabled) return null;
  if (isLoading) return <p className="text-[13px] text-ink-400">Cargando mensajes…</p>;
  if (isError) {
    return (
      <p className="text-[13px] text-danger-600">
        No se pudieron cargar los mensajes: {(error as Error).message}
      </p>
    );
  }

  const messages = data?.messages ?? [];

  return (
    <div className="space-y-2 max-h-64 sm:max-h-96 overflow-y-auto pr-2 scrollbar-thin">
      {messages.map((m) => {
        const isMine = m.senderId === currentUserId;
        return (
          <div key={m.id} className={cn('flex flex-col', isMine ? 'items-end' : 'items-start')}>
            <div
              className={cn(
                'max-w-[85%] sm:max-w-[78%] rounded-2xl px-3.5 py-2 text-[13px] shadow-card',
                isMine
                  ? 'bg-ink-900 text-surface-raised rounded-br-sm'
                  : 'bg-surface-raised border border-ink-200/70 text-ink-800 rounded-bl-sm',
              )}
            >
              <p className={cn('text-[10px] uppercase tracking-[0.14em] font-medium mb-1',
                isMine ? 'text-primary-300' : 'text-ink-500')}>
                {m.sender.firstName} {m.sender.lastName}
              </p>
              <p className="whitespace-pre-wrap break-words">{m.content}</p>
              <p className={cn('text-[10px] mt-1 text-right font-mono', isMine ? 'text-ink-400' : 'text-ink-400')}>
                {new Date(m.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
