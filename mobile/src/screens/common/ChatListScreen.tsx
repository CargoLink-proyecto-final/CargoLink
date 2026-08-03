import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { messagesApi } from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { getChatSocket } from '../../services/socket';
import { Conversation } from '../../types';

export default function ChatListScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await messagesApi.getConversations();
      setConversations(res.data || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Refrescamos la lista al volver a la pestaña: los contadores de no-leídos
  // quedan viejos apenas el usuario abre una conversación y vuelve.
  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', fetchConversations);
    return unsubscribe;
  }, [navigation, fetchConversations]);

  // Un mensaje entrante en cualquier viaje cambia el último mensaje y el badge,
  // así que reconsultamos en vez de intentar parchear la fila en memoria.
  useEffect(() => {
    if (!user?.id) return;
    const socket = getChatSocket(user.id);
    socket.on('newMessage', fetchConversations);
    return () => {
      socket.off('newMessage', fetchConversations);
    };
  }, [user?.id, fetchConversations]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Mensajes</Text>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.tripId}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          const otherUser = item.otherUser;
          if (!otherUser) return null;
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() =>
                navigation.navigate('Chat', {
                  tripId: item.tripId,
                  name: `${otherUser.firstName} ${otherUser.lastName}`,
                  loadTitle: item.loadTitle,
                })
              }
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{otherUser.firstName[0]}</Text>
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.name}>
                  {otherUser.firstName} {otherUser.lastName}
                </Text>
                <Text style={styles.loadTitle} numberOfLines={1}>
                  {item.loadTitle}
                </Text>
                <Text style={styles.lastMsg} numberOfLines={1}>
                  {item.lastMessage?.content ?? 'Sin mensajes todavía'}
                </Text>
              </View>
              {item.unreadCount > 0 && (
                <View style={styles.unread}>
                  <Text style={styles.unreadText}>{item.unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Aún no hay conversaciones</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 8,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#dbeafe',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarText: { fontSize: 18, fontWeight: '600', color: '#2563eb' },
  cardContent: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600' },
  loadTitle: { fontSize: 12, color: '#2563eb', marginTop: 2 },
  lastMsg: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  unread: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6,
    backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center',
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 15 },
});
