'use client';

import dynamic from 'next/dynamic';
import { useQuery, useQueries } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { tripsApi } from '@/lib/api';
import { getStatusColor, getStatusLabel } from '@/lib/utils';
import { fetchRoute } from '@/lib/routing';
import Link from 'next/link';

const MapView = dynamic(() => import('@/components/maps/MapView'), { ssr: false });

export default function TrackingPage() {
  const { data: tripsData } = useQuery({
    queryKey: ['tracking-trips'],
    queryFn: () => tripsApi.getAll({ status: 'IN_PROGRESS' }).then((r) => r.data),
    refetchInterval: 10000,
  });

  const trips = tripsData?.trips || [];

  // Fetch routes for all trips using React Query (reliable caching + retries)
  const routeQueries = useQueries({
    queries: trips
      .filter((t: any) => t.load?.originLat != null && t.load?.destLat != null)
      .map((trip: any) => ({
        queryKey: ['osrm-route', trip.load.originLat, trip.load.originLng, trip.load.destLat, trip.load.destLng] as const,
        queryFn: (): Promise<[number, number][]> => fetchRoute(trip.load.originLat, trip.load.originLng, trip.load.destLat, trip.load.destLng),
        staleTime: Infinity,
        retry: 2,
        retryDelay: 1500,
      })),
  });

  const markers = trips
    .filter((t: any) => t.currentLat && t.currentLng)
    .map((t: any) => ({
      id: t.id,
      lat: t.currentLat,
      lng: t.currentLng,
      title: t.load?.title || 'Viaje',
      status: t.status,
    }));

  // Add origin/dest markers for all trips
  trips.forEach((t: any) => {
    if (t.load) {
      markers.push({ id: `${t.id}-origin`, lat: t.load.originLat, lng: t.load.originLng, title: `Origen: ${t.load.originAddress}` });
      markers.push({ id: `${t.id}-dest`, lat: t.load.destLat, lng: t.load.destLng, title: `Destino: ${t.load.destAddress}` });
    }
  });

  const routes = routeQueries
    .filter((q) => {
      const coords = q.data as [number, number][] | undefined;
      return coords && coords.length > 0;
    })
    .map((q) => ({
      coordinates: q.data as [number, number][],
      color: '#3b82f6',
    }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Seguimiento en Tiempo Real</h1>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative" style={{ height: '500px', zIndex: 1 }}>
          <MapView markers={markers} routes={routes} />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <h2 className="font-semibold">Viajes Activos ({trips.length})</h2>
          </div>
          {trips.length === 0 ? (
            <div className="p-10 text-center text-gray-400">Sin viajes activos para seguir</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {trips.map((trip: any) => (
                <Link key={trip.id} href={`/tracking/${trip.id}`} className="p-4 flex items-center justify-between hover:bg-gray-50 transition block">
                  <div>
                    <p className="font-medium">{trip.load?.title}</p>
                    <p className="text-sm text-gray-500">
                      {trip.carrier?.firstName} {trip.carrier?.lastName}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(trip.status)}`}>
                    {getStatusLabel(trip.status)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
