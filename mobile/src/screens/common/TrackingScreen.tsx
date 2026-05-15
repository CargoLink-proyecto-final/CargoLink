import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { tripsApi } from '../../services/api';
import { fetchRoute } from '../../services/routing';
import { useAuthStore } from '../../store/auth';
import { Trip } from '../../types';

interface RouteData {
  tripId: string;
  coordinates: { latitude: number; longitude: number }[];
}

export default function TrackingScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const mapRef = useRef<MapView>(null);
  const fetchedRouteIds = useRef<Set<string>>(new Set());

  const fetchTrips = async () => {
    try {
      const res = user?.role === 'TRANSPORTER'
        ? await tripsApi.getMy({ status: 'IN_PROGRESS' })
        : await tripsApi.getMy();
      setTrips(res.data.trips || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTrips();
    const interval = setInterval(fetchTrips, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch routes for trips
  useEffect(() => {
    trips.forEach(async (trip) => {
      if (!trip.load || fetchedRouteIds.current.has(trip.id)) return;
      fetchedRouteIds.current.add(trip.id);

      const coords = await fetchRoute(
        trip.load.originLat,
        trip.load.originLng,
        trip.load.destLat,
        trip.load.destLng,
      );
      if (coords.length > 0) {
        setRoutes((prev) => [...prev, { tripId: trip.id, coordinates: coords }]);
      }
    });
  }, [trips]);

  // Fit map to show all points
  useEffect(() => {
    if (!mapRef.current) return;
    const allCoords: { latitude: number; longitude: number }[] = [];

    trips.forEach((t) => {
      if (t.currentLat && t.currentLng) {
        allCoords.push({ latitude: t.currentLat, longitude: t.currentLng });
      }
      if (t.load) {
        allCoords.push({ latitude: t.load.originLat, longitude: t.load.originLng });
        allCoords.push({ latitude: t.load.destLat, longitude: t.load.destLng });
      }
    });

    if (allCoords.length >= 2) {
      mapRef.current.fitToCoordinates(allCoords, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  }, [trips, routes]);

  // For carriers: send location updates
  useEffect(() => {
    if (user?.role !== 'TRANSPORTER') return;

    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 100 },
        (location) => {
          const activeTrips = trips.filter((t) => t.status === 'IN_PROGRESS');
          activeTrips.forEach((trip) => {
            tripsApi.updateLocation(trip.id, {
              lat: location.coords.latitude,
              lng: location.coords.longitude,
            });
          });
        },
      );
    })();

    return () => {
      subscription?.remove();
    };
  }, [trips, user?.role]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Seguimiento</Text>

      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={{
            latitude: -34.6037,
            longitude: -58.3816,
            latitudeDelta: 10,
            longitudeDelta: 10,
          }}
        >
          {/* Route polylines */}
          {routes.map((route) => (
            <Polyline
              key={route.tripId}
              coordinates={route.coordinates}
              strokeColor="#3b82f6"
              strokeWidth={4}
            />
          ))}

          {/* Origin & destination markers */}
          {trips.map((t) =>
            t.load ? (
              <React.Fragment key={`markers-${t.id}`}>
                <Marker
                  coordinate={{ latitude: t.load.originLat, longitude: t.load.originLng }}
                  title="Origen"
                  description={t.load.originAddress}
                  pinColor="green"
                />
                <Marker
                  coordinate={{ latitude: t.load.destLat, longitude: t.load.destLng }}
                  title="Destino"
                  description={t.load.destAddress}
                  pinColor="red"
                />
              </React.Fragment>
            ) : null,
          )}

          {/* Current position markers (driver location) */}
          {trips
            .filter((t) => t.currentLat && t.currentLng)
            .map((t) => (
              <Marker
                key={t.id}
                coordinate={{ latitude: t.currentLat!, longitude: t.currentLng! }}
                title={t.load?.title || 'Viaje'}
                description="Posición actual del conductor"
                pinColor="blue"
              />
            ))}
        </MapView>
      </View>

      {/* Trip list */}
      <View style={styles.listContainer}>
        <Text style={styles.listTitle}>
          {trips.length} viaje{trips.length !== 1 ? 's' : ''} activo{trips.length !== 1 ? 's' : ''}
        </Text>
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.tripItem}
              onPress={() => navigation.navigate('LoadDetail', { id: item.loadId || item.load?.id })}
            >
              <View style={styles.tripInfo}>
                <Text style={styles.tripTitle}>{item.load?.title || 'Viaje'}</Text>
                <Text style={styles.tripSubtitle}>
                  {item.load?.originAddress} → {item.load?.destAddress}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: item.status === 'IN_PROGRESS' ? '#dbeafe' : '#f3f4f6' }]}>
                <Text style={[styles.statusText, { color: item.status === 'IN_PROGRESS' ? '#2563eb' : '#6b7280' }]}>
                  {item.status === 'IN_PROGRESS' ? 'En Progreso' : item.status}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Sin viajes activos</Text>
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  title: { fontSize: 24, fontWeight: 'bold', padding: 16, paddingBottom: 8 },
  mapContainer: { height: 300, margin: 16, marginTop: 8, borderRadius: 12, overflow: 'hidden' },
  map: { width: '100%', height: '100%' },
  listContainer: { flex: 1, marginHorizontal: 16 },
  listTitle: { fontSize: 14, color: '#6b7280', marginBottom: 8 },
  tripItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tripInfo: { flex: 1, marginRight: 10 },
  tripTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  tripSubtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '600' },
  emptyText: { textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 14 },
});
