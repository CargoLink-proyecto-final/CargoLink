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
import { tripsApi } from '../../services/api';
import { Trip } from '../../types';

export default function CarrierDashboard({ navigation }: any) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTrips = async () => {
    try {
      const res = await tripsApi.getMy();
      setTrips(res.data.trips || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchTrips(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTrips();
    setRefreshing(false);
  };

  const statusColor: Record<string, string> = {
    ACCEPTED: '#3b82f6',
    IN_PROGRESS: '#f97316',
    COMPLETED: '#22c55e',
    CANCELLED: '#ef4444',
  };

  const stats = {
    total: trips.length,
    active: trips.filter((t) => t.status === 'IN_PROGRESS').length,
    accepted: trips.filter((t) => t.status === 'ACCEPTED').length,
    completed: trips.filter((t) => t.status === 'COMPLETED').length,
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Mis Viajes</Text>

      <View style={styles.statsRow}>
        {[
          { label: 'Total', value: stats.total, color: '#3b82f6' },
          { label: 'Activos', value: stats.active, color: '#f97316' },
          { label: 'Aceptados', value: stats.accepted, color: '#eab308' },
          { label: 'Completados', value: stats.completed, color: '#22c55e' },
        ].map((s) => (
          <View key={s.label} style={[styles.statCard, { borderTopColor: s.color }]}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('LoadDetail', { id: item.loadId })}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.load?.title}</Text>
              <View style={[styles.badge, { backgroundColor: (statusColor[item.status] || '#6b7280') + '20' }]}>
                <Text style={[styles.badgeText, { color: statusColor[item.status] || '#6b7280' }]}>{item.status}</Text>
              </View>
            </View>
            <Text style={styles.cardRoute} numberOfLines={1}>
              {item.load?.originAddress} → {item.load?.destAddress}
            </Text>
            <Text style={styles.cardShipper}>
              Generador de carga: {item.load?.shipper?.firstName} {item.load?.shipper?.lastName}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Aún no hay viajes. ¡Busca cargas disponibles!</Text>
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
  cardShipper: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 15 },
});
