import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadsApi } from '../../services/api';
import { Load } from '../../types';

export default function AvailableLoadsScreen({ navigation }: any) {
  const [loads, setLoads] = useState<Load[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLoads = loads.filter((load) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      load.title?.toLowerCase().includes(q) ||
      load.originAddress?.toLowerCase().includes(q) ||
      load.destAddress?.toLowerCase().includes(q)
    );
  });

  const fetchLoads = async () => {
    try {
      const res = await loadsApi.getAvailable();
      setLoads(res.data.loads || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchLoads(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLoads();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Cargas Disponibles</Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Buscar cargas..."
        placeholderTextColor="#9ca3af"
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      <Text style={styles.subtitle}>{filteredLoads.length} cargas disponibles</Text>

      <FlatList
        data={filteredLoads}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('LoadDetail', { id: item.id })}
          >
            <Text style={styles.cardTitle}>{item.title}</Text>
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
            <Text style={styles.cardShipper}>
              {item.shipper?.firstName} {item.shipper?.lastName}
              {item.shipper?.companyName ? ` - ${item.shipper.companyName}` : ''}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No hay cargas disponibles en este momento</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold' },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    marginTop: 12,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 16, marginTop: 4 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardRoute: { fontSize: 13, color: '#6b7280', marginTop: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  cardPrice: { fontSize: 18, fontWeight: '700', color: '#2563eb' },
  cardMeta: { flexDirection: 'row', gap: 8 },
  cardMetaText: { fontSize: 12, color: '#9ca3af', backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  cardShipper: { fontSize: 12, color: '#9ca3af', marginTop: 8 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 15 },
});
