import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { loadsApi, tripsApi, postulationsApi } from '../../services/api';
import { useAuthStore } from '../../store/auth';
import {
  formatCurrency,
  getSolicitudStageColor,
  getSolicitudStageLabel,
  getStatusLabel,
} from '../../lib/labels';
import PostulationsPanel from '../../components/PostulationsPanel';
import { Load, Postulation } from '../../types';

/**
 * `undefined` en vez de NaN cuando el campo quedó vacío o mal tipeado.
 *
 * Importa porque `NaN` viaja como `null` en JSON y `@IsOptional()` de
 * class-validator deja pasar `null`: la postulación se crearía en silencio al
 * precio publicado en vez de rechazar la entrada.
 */
function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function LoadDetailScreen({ route, navigation }: any) {
  const { id } = route.params;
  const user = useAuthStore((s) => s.user);
  const [load, setLoad] = useState<Load | null>(null);
  const [myPostulation, setMyPostulation] = useState<Postulation | null>(null);
  const [postulating, setPostulating] = useState(false);
  const [proposedPrice, setProposedPrice] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchLoad = useCallback(async () => {
    try {
      const res = await loadsApi.getById(id);
      setLoad(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Sólo el transportista tiene postulaciones propias; el endpoint es TRANSPORTER-only.
  const fetchMyPostulation = useCallback(async () => {
    if (user?.role !== 'TRANSPORTER') return;
    try {
      const res = await postulationsApi.listMine();
      const list: Postulation[] = res.data?.postulations ?? res.data ?? [];
      // Una retirada cuenta como "sin postulación": el backend revive el mismo
      // registro si el transportista se vuelve a postular.
      setMyPostulation(
        list.find((p) => p.loadId === id && p.status !== 'WITHDRAWN') ?? null,
      );
    } catch (err) {
      console.error(err);
    }
  }, [id, user?.role]);

  useEffect(() => { fetchLoad(); }, [fetchLoad]);
  useEffect(() => { fetchMyPostulation(); }, [fetchMyPostulation]);

  // Al volver de calificar, la carga ya tiene el rating nuevo y el botón tiene
  // que desaparecer; RatingScreen sólo hace goBack, no avisa nada.
  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', fetchLoad);
    return unsubscribe;
  }, [navigation, fetchLoad]);

  const handlePostulate = async () => {
    setActionLoading(true);
    try {
      // El backend rechaza un precio menor o igual al listado: vacío significa
      // "acepto el precio publicado".
      await postulationsApi.create(id, {
        message: message.trim() || undefined,
        proposedPrice: optionalNumber(proposedPrice),
      });
      Alert.alert('Postulación enviada', 'El publicador va a revisar tu propuesta.');
      setPostulating(false);
      setProposedPrice('');
      setMessage('');
      fetchMyPostulation();
      fetchLoad();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Error al postularte');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptCounterOffer = async () => {
    if (!myPostulation) return;
    setActionLoading(true);
    try {
      await postulationsApi.acceptOffer(myPostulation.id);
      Alert.alert('Listo', 'Aceptaste la contra-oferta.');
      fetchMyPostulation();
      fetchLoad();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Error al aceptar la oferta');
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!myPostulation) return;
    Alert.alert('Retirar postulación', '¿Estás seguro?', [
      { text: 'No' },
      {
        text: 'Sí', style: 'destructive', onPress: async () => {
          setActionLoading(true);
          try {
            await postulationsApi.withdraw(myPostulation.id);
            fetchMyPostulation();
            fetchLoad();
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.message || 'Error');
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
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

  const stageColor = getSolicitudStageColor(load.status);
  const interestedCount = load.pendingPostulationsCount ?? 0;

  // Mismo criterio que el web: la calificación es unidireccional — sólo el
  // publicador califica al transportista, con el viaje completado y una sola
  // vez. El backend rechaza cualquier otro caso (@Roles CARGO_GENERATOR +
  // chequeo de ownership + unique por viaje/autor).
  const canRateCarrier =
    user?.role === 'CARGO_GENERATOR' &&
    load.shipperId === user.id &&
    load.trip?.status === 'COMPLETED' &&
    !load.trip.ratings?.some((r) => r.fromUserId === user.id);
  const hasDimensions =
    load.heightCm != null || load.widthCm != null || load.lengthCm != null;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{load.title}</Text>
        <View style={[styles.badge, { backgroundColor: stageColor + '20' }]}>
          <Text style={[styles.badgeText, { color: stageColor }]}>
            {getSolicitudStageLabel(load.status)}
          </Text>
        </View>
      </View>

      {load.description && <Text style={styles.desc}>{load.description}</Text>}

      {user?.role === 'TRANSPORTER' && load.status === 'PUBLISHED' && interestedCount > 0 && (
        <View style={styles.interestBanner}>
          <Text style={styles.interestText}>
            {interestedCount === 1
              ? 'Hay 1 transportista interesado en esta carga.'
              : `Hay ${interestedCount} transportistas interesados en esta carga.`}
          </Text>
        </View>
      )}

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
            <Text style={[styles.gridValue, { color: '#2563eb' }]}>{formatCurrency(load.price)}</Text>
          </View>
          {load.maxBudget != null && (
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Presupuesto máx.</Text>
              <Text style={styles.gridValue}>{formatCurrency(load.maxBudget)}</Text>
            </View>
          )}
          {load.volume != null && (
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Volumen</Text>
              <Text style={styles.gridValue}>{load.volume} m3</Text>
            </View>
          )}
          {load.packageCount != null && (
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Bultos</Text>
              <Text style={styles.gridValue}>{load.packageCount}</Text>
            </View>
          )}
          {hasDimensions && (
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Dimensiones</Text>
              <Text style={styles.gridValue}>
                {[load.heightCm, load.widthCm, load.lengthCm]
                  .map((d) => (d != null ? d : '—'))
                  .join(' × ')}{' '}
                cm
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Publicador de carga</Text>
        <Text style={styles.infoValue}>
          {load.shipper?.firstName} {load.shipper?.lastName}
        </Text>
        {load.shipper?.companyName && <Text style={styles.infoLabel}>{load.shipper.companyName}</Text>}
        {load.shipper?.industry && (
          <Text style={styles.infoLabel}>Rubro: {load.shipper.industry}</Text>
        )}
      </View>

      {/* Sólo el dueño ve las postulaciones: el endpoint es shipper-owner/ADMIN. */}
      {user?.role === 'CARGO_GENERATOR' && load.shipperId === user.id && (
        <PostulationsPanel
          loadId={id}
          listedPrice={load.price}
          isOpen={load.status === 'PUBLISHED'}
          onChanged={fetchLoad}
        />
      )}

      <View style={styles.actions}>
        {/* El transportista no toma la carga directo: se postula y el publicador
            decide. `POST /trips/accept/:loadId` quedó como override de ADMIN. */}
        {user?.role === 'TRANSPORTER' && load.status === 'PUBLISHED' && !myPostulation && !postulating && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
            onPress={() => setPostulating(true)}
            disabled={actionLoading}
          >
            <Text style={styles.actionBtnText}>Postularme</Text>
          </TouchableOpacity>
        )}

        {postulating && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tu propuesta</Text>
            <Text style={styles.gridLabel}>Mensaje (opcional)</Text>
            <TextInput
              style={styles.input}
              value={message}
              onChangeText={setMessage}
              placeholder="Ej., tengo camión refrigerado disponible"
              multiline
            />
            <Text style={styles.gridLabel}>Precio propuesto (opcional)</Text>
            <TextInput
              style={styles.input}
              value={proposedPrice}
              onChangeText={setProposedPrice}
              placeholder={`Mayor a ${load.price}`}
              keyboardType="numeric"
            />
            <Text style={styles.helper}>
              Dejalo vacío si aceptás el precio publicado de {formatCurrency(load.price)}.
            </Text>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#22c55e', marginTop: 12 }]}
              onPress={handlePostulate}
              disabled={actionLoading}
            >
              <Text style={styles.actionBtnText}>
                {actionLoading ? 'Enviando...' : 'Enviar postulación'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPostulating(false)} disabled={actionLoading}>
              <Text style={styles.cancelLink}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        )}

        {myPostulation && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tu postulación</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Estado</Text>
            </View>
            <Text style={styles.infoValue}>{getStatusLabel(myPostulation.status)}</Text>
            {myPostulation.proposedPrice != null && (
              <Text style={styles.infoLabel}>
                Propusiste {formatCurrency(myPostulation.proposedPrice)}
              </Text>
            )}

            {myPostulation.counterOfferPrice != null &&
              myPostulation.lastOfferBy === 'SHIPPER' && (
                <>
                  <Text style={styles.counterOffer}>
                    El publicador propuso {formatCurrency(myPostulation.counterOfferPrice)}
                  </Text>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#22c55e', marginTop: 10 }]}
                    onPress={handleAcceptCounterOffer}
                    disabled={actionLoading}
                  >
                    <Text style={styles.actionBtnText}>Aceptar contra-oferta</Text>
                  </TouchableOpacity>
                </>
              )}

            {myPostulation.status !== 'ACCEPTED' && (
              <TouchableOpacity onPress={handleWithdraw} disabled={actionLoading}>
                <Text style={styles.withdrawLink}>Retirar postulación</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {user?.role === 'TRANSPORTER' && load.trip?.status === 'ACCEPTED' && load.trip?.carrierId === user.id && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#f97316' }]}
            onPress={handleStartTrip}
            disabled={actionLoading}
          >
            <Text style={styles.actionBtnText}>Iniciar Viaje</Text>
          </TouchableOpacity>
        )}

        {user?.role === 'TRANSPORTER' && load.trip?.status === 'IN_PROGRESS' && load.trip?.carrierId === user.id && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}
            onPress={handleCompleteTrip}
            disabled={actionLoading}
          >
            <Text style={styles.actionBtnText}>Completar Viaje</Text>
          </TouchableOpacity>
        )}

        {user?.role === 'CARGO_GENERATOR' && load.shipperId === user.id && load.status === 'PUBLISHED' && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
            onPress={handleCancel}
            disabled={actionLoading}
          >
            <Text style={styles.actionBtnText}>Cancelar Carga</Text>
          </TouchableOpacity>
        )}

        {canRateCarrier && load.trip && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#f59e0b' }]}
            onPress={() =>
              navigation.navigate('Rating', {
                tripId: load.trip!.id,
                carrierName: load.trip!.carrier
                  ? `${load.trip!.carrier.firstName} ${load.trip!.carrier.lastName}`
                  : undefined,
              })
            }
            disabled={actionLoading}
          >
            <Text style={styles.actionBtnText}>Calificar al transportista</Text>
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
  interestBanner: {
    backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe',
    borderRadius: 12, padding: 12, marginBottom: 12,
  },
  interestText: { fontSize: 13, fontWeight: '500', color: '#1e40af' },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 10, color: '#374151' },
  infoRow: { marginBottom: 8 },
  infoLabel: { fontSize: 12, color: '#9ca3af' },
  infoValue: { fontSize: 14, fontWeight: '500', color: '#374151' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: { width: '45%' },
  gridLabel: { fontSize: 12, color: '#9ca3af' },
  gridValue: { fontSize: 15, fontWeight: '600', marginTop: 2 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginTop: 4,
  },
  helper: { fontSize: 11, color: '#9ca3af', marginTop: 6 },
  counterOffer: {
    fontSize: 14, fontWeight: '600', color: '#92400e', marginTop: 10,
    backgroundColor: '#fffbeb', borderRadius: 8, padding: 10,
  },
  cancelLink: { textAlign: 'center', color: '#6b7280', fontSize: 14, marginTop: 12 },
  withdrawLink: { textAlign: 'center', color: '#ef4444', fontSize: 14, marginTop: 12 },
  actions: { gap: 10, marginBottom: 40 },
  actionBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
