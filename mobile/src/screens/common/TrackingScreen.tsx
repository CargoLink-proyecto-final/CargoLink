import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { tripsApi } from '../../services/api';
import { fetchRoute } from '../../services/routing';
import { boundsFor, type LatLng } from '../../lib/bounds';
import { MAP_STYLE_URL } from '../../config/env';
import { useAuthStore } from '../../store/auth';
import { Trip } from '../../types';

interface RouteData {
  tripId: string;
  coordinates: LatLng[];
}

/** Centro inicial: Buenos Aires, hasta que haya viajes que encuadrar. */
const INITIAL_CENTER: [number, number] = [-58.3816, -34.6037];

/**
 * Chapita del marcador. MapLibre no trae pines con color como react-native-maps:
 * cada `Marker` renderiza la vista que le pasemos, así que el pin es nuestro.
 */
function MapPin({ color, label }: { color: string; label: string }) {
  return (
    <View style={[styles.pin, { backgroundColor: color }]}>
      <Text style={styles.pinLabel}>{label}</Text>
    </View>
  );
}

export default function TrackingScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const cameraRef = useRef<CameraRef>(null);
  const fetchedRouteIds = useRef<Set<string>>(new Set());

  const fetchTrips = async () => {
    try {
      // `GET /trips/my` es TRANSPORTER-only y `GET /trips/my-loads`
      // CARGO_GENERATOR-only: usar el que no corresponde al rol devuelve 403.
      // El filtro va en ambas ramas: sin él entran viajes COMPLETED/CANCELLED
      // que la pantalla contaría como activos y dibujaría con la última
      // posición conocida del conductor.
      const res = user?.role === 'TRANSPORTER'
        ? await tripsApi.getMy({ status: 'IN_PROGRESS' })
        : await tripsApi.getMyLoads({ status: 'IN_PROGRESS' });
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
    if (!cameraRef.current) return;
    const allCoords: LatLng[] = [];

    trips.forEach((t) => {
      if (t.currentLat && t.currentLng) {
        allCoords.push({ latitude: t.currentLat, longitude: t.currentLng });
      }
      if (t.load) {
        allCoords.push({ latitude: t.load.originLat, longitude: t.load.originLng });
        allCoords.push({ latitude: t.load.destLat, longitude: t.load.destLng });
      }
    });

    const bounds = boundsFor(allCoords);
    if (bounds) {
      cameraRef.current.fitBounds(bounds, {
        padding: { top: 50, right: 50, bottom: 50, left: 50 },
        duration: 500,
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
        <Map style={styles.map} mapStyle={MAP_STYLE_URL} logo={false} attribution>
          <Camera ref={cameraRef} initialViewState={{ center: INITIAL_CENTER, zoom: 3.5 }} />

          {/* Route polylines */}
          {routes.map((route) => (
            <GeoJSONSource
              key={route.tripId}
              id={`route-${route.tripId}`}
              data={{
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: route.coordinates.map((c) => [c.longitude, c.latitude]),
                },
              }}
            >
              <Layer
                id={`route-line-${route.tripId}`}
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{ 'line-color': '#3b82f6', 'line-width': 4 }}
              />
            </GeoJSONSource>
          ))}

          {/* Origin & destination markers */}
          {trips.map((t) =>
            t.load ? (
              <React.Fragment key={`markers-${t.id}`}>
                <Marker lngLat={[t.load.originLng, t.load.originLat]}>
                  <MapPin color="#16a34a" label="A" />
                </Marker>
                <Marker lngLat={[t.load.destLng, t.load.destLat]}>
                  <MapPin color="#dc2626" label="B" />
                </Marker>
              </React.Fragment>
            ) : null,
          )}

          {/* Current position markers (driver location) */}
          {trips
            .filter((t) => t.currentLat && t.currentLng)
            .map((t) => (
              <Marker key={t.id} lngLat={[t.currentLng!, t.currentLat!]}>
                <MapPin color="#2563eb" label="🚚" />
              </Marker>
            ))}
        </Map>
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
  pin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  pinLabel: { color: 'white', fontSize: 12, fontWeight: '700' },
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
