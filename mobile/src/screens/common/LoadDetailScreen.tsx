import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { loadsApi, tripsApi } from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { Load } from '../../types';

export default function LoadDetailScreen({ route, navigation }: any) {
  const { id } = route.params;
  const user = useAuthStore((s) => s.user);
  const [load, setLoad] = useState<Load | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchLoad = async () => {
    try {
      const res = await loadsApi.getById(id);
      setLoad(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLoad(); }, [id]);

  const handleAccept = async () => {
    setActionLoading(true);
    try {
      await tripsApi.accept(id);
      Alert.alert('Éxito', '¡Carga aceptada!');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Error al aceptar');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    Alert.alert('Cancelar Carga', '¿Estás seguro?', [
      { text: 'No' },
      {
        text: 'Sí', style: 'destructive', onPress: async () => {
          setActionLoading(true);
          try {
            await loadsApi.cancel(id);
            Alert.alert('Cancelada');
            navigation.goBack();
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.message || 'Error');
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleStartTrip = async () => {
    if (!load?.trip) return;
    setActionLoading(true);
    try {
      await tripsApi.start(load.trip.id);
      Alert.alert('¡Viaje iniciado!');
      fetchLoad();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteTrip = async () => {
    if (!load?.trip) return;
    setActionLoading(true);
    try {
      await tripsApi.complete(load.trip.id);
      Alert.alert('¡Viaje completado!');
      fetchLoad();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  if (!load) {
    return <View style={styles.center}><Text>Carga no encontrada</Text></View>;
  }

  const statusColor: Record<string, string> = {
    PUBLISHED: '#3b82f6', ASSIGNED: '#f59e0b', IN_TRANSIT: '#f97316',
    DELIVERED: '#22c55e', CANCELLED: '#ef4444',
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{load.title}</Text>
        <View style={[styles.badge, { backgroundColor: (statusColor[load.status] || '#6b7280') + '20' }]}>
          <Text style={[styles.badgeText, { color: statusColor[load.status] }]}>{load.status}</Text>
        </View>
      </View>

      {load.description && <Text style={styles.desc}>{load.description}</Text>}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ruta</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Origen</Text>
          <Text style={styles.infoValue}>{load.originAddress}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Destino</Text>
          <Text style={styles.infoValue}>{load.destAddress}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Detalles de la Carga</Text>
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <Text style={styles.gridLabel}>Tipo</Text>
            <Text style={styles.gridValue}>{load.cargoType}</Text>
          </View>
          <View style={styles.gridItem}>
            <Text style={styles.gridLabel}>Peso</Text>
            <Text style={styles.gridValue}>{load.weight} kg</Text>
          </View>
          <View style={styles.gridItem}>
            <Text style={styles.gridLabel}>Precio</Text>
            <Text style={[styles.gridValue, { color: '#2563eb' }]}>${load.price.toLocaleString()}</Text>
          </View>
          {load.volume && (
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Volumen</Text>
              <Text style={styles.gridValue}>{load.volume} m3</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Remitente</Text>
        <Text style={styles.infoValue}>
          {load.shipper?.firstName} {load.shipper?.lastName}
        </Text>
        {load.shipper?.companyName && <Text style={styles.infoLabel}>{load.shipper.companyName}</Text>}
      </View>

      <View style={styles.actions}>
        {user?.role === 'CARRIER' && load.status === 'PUBLISHED' && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
            onPress={handleAccept}
            disabled={actionLoading}
          >
            <Text style={styles.actionBtnText}>Aceptar Carga</Text>
          </TouchableOpacity>
        )}

        {user?.role === 'CARRIER' && load.trip?.status === 'ACCEPTED' && load.trip?.carrierId === user.id && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#f97316' }]}
            onPress={handleStartTrip}
            disabled={actionLoading}
          >
            <Text style={styles.actionBtnText}>Iniciar Viaje</Text>
          </TouchableOpacity>
        )}

        {user?.role === 'CARRIER' && load.trip?.status === 'IN_PROGRESS' && load.trip?.carrierId === user.id && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
            onPress={handleCompleteTrip}
            disabled={actionLoading}
          >
            <Text style={styles.actionBtnText}>Completar Viaje</Text>
          </TouchableOpacity>
        )}

        {user?.role === 'SHIPPER' && load.shipperId === user.id && load.status === 'PUBLISHED' && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
            onPress={handleCancel}
            disabled={actionLoading}
          >
            <Text style={styles.actionBtnText}>Cancelar Carga</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: 'bold', flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  desc: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 10, color: '#374151' },
  infoRow: { marginBottom: 8 },
  infoLabel: { fontSize: 12, color: '#9ca3af' },
  infoValue: { fontSize: 14, fontWeight: '500', color: '#374151' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: { width: '45%' },
  gridLabel: { fontSize: 12, color: '#9ca3af' },
  gridValue: { fontSize: 15, fontWeight: '600', marginTop: 2 },
  actions: { gap: 10, marginBottom: 40 },
  actionBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
