import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { postulationsApi } from '../services/api';
import { formatCurrency, getStatusLabel } from '../lib/labels';
import { Postulation } from '../types';

/**
 * Oferta vigente del transportista, espejo de `transporterCurrentOffer` en
 * frontend/src/components/postulations/PostulationsPanel.tsx: su contra-oferta
 * si fue el último en ofertar, sino el precio que propuso; si no propuso nada,
 * está aceptando el precio listado.
 */
export function transporterCurrentOffer(p: Postulation, listedPrice: number): number {
  if (p.status === 'NEGOTIATING' && p.lastOfferBy === 'TRANSPORTER' && p.counterOfferPrice != null) {
    return p.counterOfferPrice;
  }
  return p.proposedPrice ?? listedPrice;
}

/**
 * El publicador sólo puede aceptar mientras la pelota esté del lado del
 * transportista: con una contra-oferta propia sin responder, el backend
 * devuelve "Esperá la respuesta del transportista antes de aceptar".
 */
export function canAccept(p: Postulation): boolean {
  if (p.status !== 'PENDING' && p.status !== 'NEGOTIATING') return false;
  return !(p.status === 'NEGOTIATING' && p.lastOfferBy === 'SHIPPER');
}

/**
 * Contra-ofertar exige que haya un precio del transportista contra el cual
 * negociar y que no sea su propio turno.
 */
export function canCounterOffer(p: Postulation): boolean {
  if (p.status !== 'PENDING' && p.status !== 'NEGOTIATING') return false;
  if (p.lastOfferBy === 'SHIPPER') return false;
  const transporterOffer =
    p.status === 'NEGOTIATING' && p.lastOfferBy === 'TRANSPORTER' && p.counterOfferPrice != null
      ? p.counterOfferPrice
      : p.proposedPrice;
  return transporterOffer != null;
}

interface Props {
  loadId: string;
  listedPrice: number;
  /** Sólo se puede operar mientras la carga siga publicada. */
  isOpen: boolean;
  onChanged?: () => void;
}

export default function PostulationsPanel({ loadId, listedPrice, isOpen, onChanged }: Props) {
  const [postulations, setPostulations] = useState<Postulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [counteringId, setCounteringId] = useState<string | null>(null);
  const [counterPrice, setCounterPrice] = useState('');

  const fetchPostulations = useCallback(async () => {
    try {
      const res = await postulationsApi.listForLoad(loadId);
      setPostulations(res.data ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [loadId]);

  useEffect(() => {
    fetchPostulations();
  }, [fetchPostulations]);

  const handleAccept = (p: Postulation) => {
    Alert.alert(
      'Aceptar postulación',
      `Se le asigna el viaje a ${p.transporter?.firstName ?? 'este transportista'} y la carga deja de estar publicada.`,
      [
        { text: 'Cancelar' },
        {
          text: 'Aceptar',
          onPress: async () => {
            setActionId(p.id);
            try {
              await postulationsApi.accept(p.id);
              Alert.alert('Listo', 'Aceptaste la postulación.');
              await fetchPostulations();
              onChanged?.();
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.message || 'Error al aceptar');
            } finally {
              setActionId(null);
            }
          },
        },
      ],
    );
  };

  const handleCounterOffer = async (p: Postulation) => {
    const price = Number(counterPrice);
    if (!counterPrice.trim() || !Number.isFinite(price)) {
      Alert.alert('Precio inválido', 'Ingresá un monto.');
      return;
    }
    setActionId(p.id);
    try {
      await postulationsApi.counterOffer(p.id, price);
      setCounteringId(null);
      setCounterPrice('');
      await fetchPostulations();
      onChanged?.();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Error al contra-ofertar');
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.section}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  if (postulations.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Postulaciones</Text>
        <Text style={styles.empty}>Todavía no se postuló ningún transportista.</Text>
      </View>
    );
  }

  const average =
    postulations.reduce((sum, p) => sum + transporterCurrentOffer(p, listedPrice), 0) /
    postulations.length;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        Postulaciones ({postulations.length})
      </Text>
      <Text style={styles.helper}>Oferta promedio: {formatCurrency(average)}</Text>

      {postulations.map((p) => {
        const offer = transporterCurrentOffer(p, listedPrice);
        const busy = actionId === p.id;
        return (
          <View key={p.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.name}>
                {p.transporter?.firstName} {p.transporter?.lastName}
              </Text>
              <Text style={styles.status}>{getStatusLabel(p.status)}</Text>
            </View>
            {p.transporter?.companyName ? (
              <Text style={styles.meta}>{p.transporter.companyName}</Text>
            ) : null}
            {p.message ? <Text style={styles.message}>{p.message}</Text> : null}

            <Text style={styles.offer}>
              Pide {formatCurrency(offer)}
              {p.proposedPrice == null && p.counterOfferPrice == null
                ? ' (acepta el precio publicado)'
                : ''}
            </Text>

            {p.lastOfferBy === 'SHIPPER' && p.counterOfferPrice != null && (
              <Text style={styles.waiting}>
                Ofreciste {formatCurrency(p.counterOfferPrice)} — esperando su respuesta.
              </Text>
            )}

            {isOpen && counteringId === p.id ? (
              <View>
                <TextInput
                  style={styles.input}
                  value={counterPrice}
                  onChangeText={setCounterPrice}
                  placeholder={`Menor a ${offer}`}
                  keyboardType="numeric"
                />
                <Text style={styles.helper}>
                  Tiene que ser menor a lo que pide. Si estás de acuerdo con {formatCurrency(offer)},
                  aceptá la postulación.
                </Text>
                <View style={styles.row}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary]}
                    onPress={() => handleCounterOffer(p)}
                    disabled={busy}
                  >
                    <Text style={styles.btnPrimaryText}>
                      {busy ? 'Enviando...' : 'Enviar contra-oferta'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.btn}
                    onPress={() => {
                      setCounteringId(null);
                      setCounterPrice('');
                    }}
                    disabled={busy}
                  >
                    <Text style={styles.btnText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              isOpen && (
                <View style={styles.row}>
                  {canAccept(p) && (
                    <TouchableOpacity
                      style={[styles.btn, styles.btnAccept]}
                      onPress={() => handleAccept(p)}
                      disabled={busy}
                    >
                      <Text style={styles.btnPrimaryText}>Aceptar</Text>
                    </TouchableOpacity>
                  )}
                  {canCounterOffer(p) && (
                    <TouchableOpacity
                      style={styles.btn}
                      onPress={() => {
                        setCounteringId(p.id);
                        setCounterPrice('');
                      }}
                      disabled={busy}
                    >
                      <Text style={styles.btnText}>Contra-ofertar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#374151' },
  helper: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  empty: { fontSize: 13, color: '#9ca3af', marginTop: 8 },
  card: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    padding: 12, marginTop: 12, gap: 4,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '600', color: '#1f2937', flex: 1 },
  status: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  meta: { fontSize: 12, color: '#9ca3af' },
  message: { fontSize: 13, color: '#4b5563', marginTop: 4 },
  offer: { fontSize: 15, fontWeight: '700', color: '#2563eb', marginTop: 6 },
  waiting: { fontSize: 12, color: '#92400e', marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginTop: 8,
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: {
    flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
    borderWidth: 1, borderColor: '#d1d5db',
  },
  btnPrimary: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  btnAccept: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnText: { color: '#374151', fontSize: 14, fontWeight: '500' },
});
