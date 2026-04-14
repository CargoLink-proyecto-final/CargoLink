'use client';

import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { messagesApi } from '@/lib/api';
import Link from 'next/link';
import { MessageSquare, Truck } from 'lucide-react';
import { getStatusColor } from '@/lib/utils';

export default function MessagesPage() {
  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagesApi.getConversations().then((r) => r.data),
    staleTime: 0,
    refetchInterval: 5000,
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
              {conversations.map((conv: any) => (
                <Link
                  key={conv.tripId}
                  href={`/messages/trip/${conv.tripId}`}
                  className={`flex items-center gap-3 p-4 hover:bg-gray-50 transition ${
                    conv.unreadCount > 0 ? 'bg-primary-50/40' : ''
                  }`}
                >
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-medium">
                      {conv.otherUser?.firstName?.[0] || '?'}
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-medium ${conv.unreadCount > 0 ? 'text-gray-900' : ''}`}>
                        {conv.otherUser?.firstName} {conv.otherUser?.lastName}
                      </p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${getStatusColor(conv.tripStatus)}`}>
                        {conv.tripStatus}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Truck size={12} /> {conv.loadTitle}
                    </p>
                    {conv.lastMessage ? (
                      <p className={`text-sm truncate mt-0.5 ${
                        conv.unreadCount > 0 ? 'text-gray-800 font-medium' : 'text-gray-500'
                      }`}>
                        {conv.lastMessage.content}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400 italic mt-0.5">
                        Sin mensajes — iniciar conversación
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
