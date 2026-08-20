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
import {
  formatPrice,
  getSolicitudStageColor,
  getSolicitudStageLabel,
} from '../../lib/labels';
import { Load } from '../../types';

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
          const statusColor = getSolicitudStageColor(item.status);
          const statusLabel = getSolicitudStageLabel(item.status);
          const pending = item.pendingPostulationsCount ?? 0;

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

              {/* Insight de postulaciones: la señal más accionable para el
                  publicador — le dice qué carga tiene ofertas esperando. */}
              {pending > 0 && (
                <TouchableOpacity
                  style={styles.postulationsPill}
                  onPress={() => navigation.navigate('LoadDetail', { id: item.id })}
                >
                  <Ionicons name="people" size={14} color="#1e40af" />
                  <Text style={styles.postulationsText}>
                    {pending === 1
                      ? '1 postulación pendiente'
                      : `${pending} postulaciones pendientes`}
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.cardFooter}>
                <Text style={styles.cardPrice}>{formatPrice(item.price)}</Text>
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
  postulationsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
  },
  postulationsText: { fontSize: 12, fontWeight: '600', color: '#1e40af' },
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
