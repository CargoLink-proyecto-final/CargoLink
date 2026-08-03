import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { messagesApi } from '../../services/api';
import { getChatSocket } from '../../services/socket';
import { setActiveTripId } from '../../services/activeChat';
import { useAuthStore } from '../../store/auth';
import { Message } from '../../types';

/** Cada cuánto reconsultamos por REST mientras el socket esté caído. */
const POLL_INTERVAL_MS = 3000;

/** Cronológico ascendente, con el id como desempate para que sea estable. */
function sortByCreatedAt(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => {
    const delta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });
}

/**
 * Conversación de un viaje. En condiciones normales es realtime por el gateway
 * `/chat`; si el socket no conecta (backend caído, red del celular sin WS) cae a
 * polling para que el chat siga andando en vez de quedar mudo.
 */
export default function ChatScreen({ route }: any) {
  const { tripId } = route.params;
  const currentUser = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // El mismo id puede llegar por el broadcast del gateway y por un refetch REST;
  // insertar por id evita duplicar la burbuja.
  const upsertMessage = useCallback((incoming: Message) => {
    setMessages((prev) =>
      prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming],
    );
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await messagesApi.getTripMessages(tripId);
      const fetched: Message[] = res.data.messages || [];
      // Merge en vez de reemplazo: si llega un `newMessage` por socket mientras
      // este request está en vuelo, un setMessages(fetched) lo pisaría y con el
      // socket vivo el polling está apagado, así que no se recuperaría.
      //
      // Se reordena por fecha porque el endpoint devuelve sólo la última página
      // (50 por defecto) y el cliente no pagina: concatenar sin ordenar mandaría
      // los mensajes viejos que quedaron fuera de esa página al final de la lista.
      setMessages((prev) => {
        const seen = new Set(fetched.map((m) => m.id));
        return sortByCreatedAt([...fetched, ...prev.filter((m) => !seen.has(m.id))]);
      });
    } catch (err) {
      console.error(err);
    }
  }, [tripId]);

  useEffect(() => {
    fetchMessages();
    messagesApi.markAsRead(tripId).catch(() => {
      // Marcar leído es best-effort: no vale la pena romper la pantalla por esto.
    });
  }, [tripId, fetchMessages]);

  // Mientras esta conversación esté abierta, el listener global no notifica sus
  // mensajes: ya se ven llegar acá.
  useEffect(() => {
    setActiveTripId(tripId);
    return () => setActiveTripId(null);
  }, [tripId]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const socket = getChatSocket(currentUser.id);

    const onNewMessage = (message: Message) => {
      // El gateway emite a la room del viaje; igual filtramos porque el socket
      // está unido a todas las conversaciones del usuario, no sólo a esta.
      if (message.tripId !== tripId) return;
      upsertMessage(message);
      if (message.senderId !== currentUser.id) {
        messagesApi.markAsRead(tripId).catch(() => {});
      }
    };
    const onConnect = () => {
      setIsLive(true);
      // Reconectamos después de una caída: puede haber mensajes que no vimos.
      fetchMessages();
    };
    const onDisconnect = () => setIsLive(false);

    setIsLive(socket.connected);
    socket.on('newMessage', onNewMessage);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('newMessage', onNewMessage);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [currentUser?.id, tripId, upsertMessage, fetchMessages]);

  // Sólo mientras no haya socket vivo. Con WS andando el polling es puro ruido.
  useEffect(() => {
    if (isLive) return;
    const interval = setInterval(fetchMessages, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isLive, fetchMessages]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText('');

    const socket = currentUser?.id ? getChatSocket(currentUser.id) : null;

    // Por socket el gateway hace el broadcast a la otra punta; el POST REST no
    // emite nada, así que sólo lo usamos cuando no hay WS disponible.
    if (socket?.connected && currentUser) {
      socket
        .timeout(5000)
        .emit(
          'sendMessage',
          { senderId: currentUser.id, tripId, content },
          (err: Error | null, message?: Message) => {
            setSending(false);
            if (err) {
              // El ack no llegó: reintentamos por REST para no perder el mensaje.
              messagesApi
                .send(tripId, content)
                .then(fetchMessages)
                .catch((e) => {
                  console.error(e);
                  setText(content);
                });
              return;
            }
            if (message) upsertMessage(message);
          },
        );
      return;
    }

    try {
      const res = await messagesApi.send(tripId, content);
      if (res.data) upsertMessage(res.data);
    } catch (err) {
      console.error(err);
      // Devolvemos el texto al input para que el usuario pueda reintentar.
      setText(content);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {!isLive && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>Sin conexión en vivo — actualizando cada 3s</Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        contentContainerStyle={styles.messagesList}
        renderItem={({ item }) => {
          const isMe = item.senderId === currentUser?.id;
          return (
            <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
              <Text style={[styles.bubbleText, isMe && { color: '#fff' }]}>{item.content}</Text>
              <Text style={[styles.bubbleTime, isMe && { color: '#bfdbfe' }]}>
                {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          );
        }}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Escribe un mensaje..."
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          <Ionicons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  offlineBanner: { backgroundColor: '#fef3c7', paddingVertical: 6, paddingHorizontal: 16 },
  offlineText: { fontSize: 12, color: '#92400e', textAlign: 'center' },
  messagesList: { padding: 16, paddingBottom: 8 },
  bubble: { maxWidth: '75%', padding: 10, paddingHorizontal: 14, borderRadius: 16, marginBottom: 8 },
  bubbleMe: { backgroundColor: '#2563eb', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#fff', alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#e5e7eb' },
  bubbleText: { fontSize: 15, color: '#1f2937' },
  bubbleTime: { fontSize: 10, color: '#9ca3af', marginTop: 4 },
  inputRow: {
    flexDirection: 'row', padding: 12, paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#e5e7eb', gap: 8, alignItems: 'flex-end',
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: '#2563eb', width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
});
