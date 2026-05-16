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
      <p className="text-sm text-gray-500 italic">
        Esta carga no generó conversación.
      </p>
    );
  }

  if (messageCount === 0) {
    return (
      <p className="text-sm text-gray-500 italic">Sin mensajes intercambiados.</p>
    );
  }

  if (!enabled) return null;

  if (isLoading) {
    return <p className="text-sm text-gray-400">Cargando mensajes…</p>;
  }

  if (isError) {
    return (
      <p className="text-sm text-red-500">
        No se pudieron cargar los mensajes: {(error as Error).message}
      </p>
    );
  }

  const messages = data?.messages ?? [];

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
      {messages.map((m) => {
        const isMine = m.senderId === currentUserId;
        return (
          <div
            key={m.id}
            className={cn('flex flex-col', isMine ? 'items-end' : 'items-start')}
          >
            <div
              className={cn(
                'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                isMine
                  ? 'bg-primary-600 text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-800 rounded-bl-sm',
              )}
            >
              <p className="text-[11px] opacity-80 mb-0.5">
                {m.sender.firstName} {m.sender.lastName}
              </p>
              <p className="whitespace-pre-wrap break-words">{m.content}</p>
              <p className="text-[10px] opacity-70 mt-1 text-right">
                {new Date(m.createdAt).toLocaleString('es-AR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
