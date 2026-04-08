'use client';

import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { messagesApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import Link from 'next/link';
import { MessageSquare } from 'lucide-react';

export default function MessagesPage() {
  const user = useAuthStore((s) => s.user);

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagesApi.getConversations().then((r) => r.data),
  });

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Mensajes</h1>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          {isLoading ? (
            <div className="p-10 text-center text-gray-400">Cargando conversaciones...</div>
          ) : !conversations || conversations.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <MessageSquare size={40} className="mx-auto mb-3 opacity-50" />
              <p>Sin conversaciones aún</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {conversations.map((msg: any) => {
                const otherUser =
                  msg.senderId === user?.id ? msg.receiver : msg.sender;
                return (
                  <Link
                    key={msg.id}
                    href={`/messages/${otherUser.id}`}
                    className="flex items-center gap-3 p-4 hover:bg-gray-50 transition"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-medium">
                      {otherUser.firstName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">
                        {otherUser.firstName} {otherUser.lastName}
                      </p>
                      <p className="text-sm text-gray-500 truncate">{msg.content}</p>
                    </div>
                    {!msg.isRead && msg.receiverId === user?.id && (
                      <div className="w-2.5 h-2.5 rounded-full bg-primary-500" />
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
