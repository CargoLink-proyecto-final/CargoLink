'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { messagesApi, tripsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { getStatusColor } from '@/lib/utils';
import { Send, Truck, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function TripConversationPage() {
  const params = useParams();
  const tripId = params.tripId as string;
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: trip } = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => tripsApi.getById(tripId).then((r) => r.data),
  });

  const { data: msgData } = useQuery({
    queryKey: ['tripMessages', tripId],
    queryFn: () => messagesApi.getTripMessages(tripId).then((r) => r.data),
    refetchInterval: 3000,
  });

  const messages = msgData?.messages || [];

  const sendMutation = useMutation({
    mutationFn: (content: string) => messagesApi.send(tripId, content),
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['tripMessages', tripId] });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    messagesApi.markAsRead(tripId).then(() => {
      queryClient.invalidateQueries({ queryKey: ['unreadCount'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
  }, [tripId, queryClient]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    sendMutation.mutate(message.trim());
  };

  const otherUser =
    trip?.carrierId === user?.id
      ? trip?.load?.shipper
      : trip?.carrier;

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
        {/* Header */}
        <div className="bg-white rounded-t-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
          <Link href="/messages" className="text-gray-400 hover:text-gray-600 transition">
            <ArrowLeft size={20} />
          </Link>
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-medium">
            {otherUser?.firstName?.[0] || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium">
              {otherUser?.firstName} {otherUser?.lastName}
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Truck size={12} />
              <span className="truncate">{trip?.load?.title}</span>
              {trip?.status && (
                <span className={`px-1.5 py-0.5 rounded-full ${getStatusColor(trip.status)}`}>
                  {trip.status}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 bg-gray-50 border-x border-gray-100 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">
              No hay mensajes aún. Envía el primero.
            </p>
          )}
          {messages.map((msg: any) => {
            const isMe = msg.senderId === user?.id;
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${
                    isMe
                      ? 'bg-primary-600 text-white rounded-br-sm'
                      : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'
                  }`}
                >
                  {msg.content}
                  <div className={`text-[10px] mt-1 ${isMe ? 'text-primary-200' : 'text-gray-400'}`}>
                    {new Date(msg.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={handleSend}
          className="bg-white rounded-b-xl shadow-sm border border-gray-100 p-4 flex gap-2"
        >
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            placeholder="Escribe un mensaje..."
          />
          <button
            type="submit"
            disabled={!message.trim() || sendMutation.isPending}
            className="bg-primary-600 hover:bg-primary-700 text-white p-2.5 rounded-lg transition disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
