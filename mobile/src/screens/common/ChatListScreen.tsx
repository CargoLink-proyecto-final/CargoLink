import React, { useEffect, useState } from 'react';
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
import { Message } from '../../types';

export default function ChatListScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [conversations, setConversations] = useState<Message[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConversations = async () => {
    try {
      const res = await messagesApi.getConversations();
      setConversations(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchConversations(); }, []);

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
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          const otherUser = item.senderId === user?.id ? item.receiver : item.sender;
          if (!otherUser) return null;
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('Chat', {
                userId: otherUser.id,
                name: `${otherUser.firstName} ${otherUser.lastName}`,
              })}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{otherUser.firstName[0]}</Text>
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.name}>{otherUser.firstName} {otherUser.lastName}</Text>
                <Text style={styles.lastMsg} numberOfLines={1}>{item.content}</Text>
              </View>
              {!item.isRead && item.receiverId === user?.id && (
                <View style={styles.unread} />
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>Aún no hay conversaciones</Text>
        }
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
  lastMsg: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  unread: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563eb' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 15 },
});
