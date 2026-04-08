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
import { loadsApi } from '../../services/api';
import { Load } from '../../types';

export default function ShipperDashboard({ navigation }: any) {
  const [loads, setLoads] = useState<Load[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLoads = async () => {
    try {
      const res = await loadsApi.getMy();
      setLoads(res.data.loads || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchLoads();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLoads();
    setRefreshing(false);
  };

  const stats = {
    total: loads.length,
    published: loads.filter((l) => l.status === 'PUBLISHED').length,
    inTransit: loads.filter((l) => l.status === 'IN_TRANSIT').length,
    delivered: loads.filter((l) => l.status === 'DELIVERED').length,
  };

  const statusColor: Record<string, string> = {
    PUBLISHED: '#3b82f6',
    ASSIGNED: '#f59e0b',
    IN_TRANSIT: '#f97316',
    DELIVERED: '#22c55e',
    CANCELLED: '#ef4444',
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Mis Cargas</Text>

      <View style={styles.statsRow}>
        {[
          { label: 'Total', value: stats.total, color: '#3b82f6' },
          { label: 'Publicadas', value: stats.published, color: '#22c55e' },
          { label: 'En Tránsito', value: stats.inTransit, color: '#f97316' },
          { label: 'Entregadas', value: stats.delivered, color: '#10b981' },
        ].map((s) => (
          <View key={s.label} style={[styles.statCard, { borderTopColor: s.color }]}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <FlatList
        data={loads}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('LoadDetail', { id: item.id })}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <View style={[styles.badge, { backgroundColor: statusColor[item.status] + '20' }]}>
                <Text style={[styles.badgeText, { color: statusColor[item.status] }]}>{item.status}</Text>
              </View>
            </View>
            <Text style={styles.cardRoute} numberOfLines={1}>
              {item.originAddress} → {item.destAddress}
            </Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardPrice}>${item.price.toLocaleString()}</Text>
              <Text style={styles.cardWeight}>{item.weight} kg</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Aún no hay cargas. ¡Crea tu primera carga!</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12,
    borderTopWidth: 3, alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: 'bold' },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  cardRoute: { fontSize: 13, color: '#6b7280', marginTop: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  cardPrice: { fontSize: 15, fontWeight: '700', color: '#2563eb' },
  cardWeight: { fontSize: 13, color: '#9ca3af' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 15 },
});
