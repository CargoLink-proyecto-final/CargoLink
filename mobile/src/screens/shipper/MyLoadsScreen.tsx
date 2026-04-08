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
import { Ionicons } from '@expo/vector-icons';
import { loadsApi } from '../../services/api';
import { Load, LoadStatus } from '../../types';

const STATUS_COLORS: Record<LoadStatus, string> = {
  PUBLISHED: '#2563eb',
  ASSIGNED: '#eab308',
  IN_TRANSIT: '#f97316',
  DELIVERED: '#16a34a',
  CANCELLED: '#dc2626',
};

const STATUS_LABELS: Record<LoadStatus, string> = {
  PUBLISHED: 'Publicada',
  ASSIGNED: 'Asignada',
  IN_TRANSIT: 'En tránsito',
  DELIVERED: 'Entregada',
  CANCELLED: 'Cancelada',
};

export default function MyLoadsScreen({ navigation }: any) {
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

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Mis Cargas</Text>
      <Text style={styles.subtitle}>{loads.length} carga{loads.length !== 1 ? 's' : ''}</Text>

      <FlatList
        data={loads}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          const statusColor = STATUS_COLORS[item.status] || '#6b7280';
          const statusLabel = STATUS_LABELS[item.status] || item.status;

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('LoadDetail', { id: item.id })}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                  <Text style={styles.statusText}>{statusLabel}</Text>
                </View>
              </View>

              <Text style={styles.cardRoute}>
                {item.originAddress} → {item.destAddress}
              </Text>

              <View style={styles.cardFooter}>
                <Text style={styles.cardPrice}>${item.price.toLocaleString()}</Text>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardMetaText}>{item.weight} kg</Text>
                  <Text style={styles.cardMetaText}>{item.cargoType}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cube-outline" size={48} color="#9ca3af" />
            <Text style={styles.empty}>
              Aún no tienes cargas.{'\n'}¡Crea tu primera carga!
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateLoad')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 16, marginTop: 4 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  cardRoute: { fontSize: 13, color: '#6b7280', marginTop: 6 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  cardPrice: { fontSize: 18, fontWeight: '700', color: '#2563eb' },
  cardMeta: { flexDirection: 'row', gap: 8 },
  cardMetaText: {
    fontSize: 12,
    color: '#9ca3af',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  empty: {
    textAlign: 'center',
    color: '#9ca3af',
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#2563eb',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
});
