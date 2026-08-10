'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery, useQueries } from '@tanstack/react-query';
import { tripsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { getStatusColor, getSolicitudStageLabel } from '@/lib/utils';
import { fetchRoute } from '@/lib/routing';

const MapView = dynamic(() => import('@/components/maps/MapView'), { ssr: false });

export default function TripsMapView() {
  const user = useAuthStore((s) => s.user);

  const { data: tripsData } = useQuery({
    queryKey: ['tracking-trips', user?.id, user?.role],
    queryFn: () => {
      if (user?.role === 'CARGO_GENERATOR') return tripsApi.getMyLoads({ status: 'IN_PROGRESS' }).then((r) => r.data);
      if (user?.role === 'TRANSPORTER') return tripsApi.getMy({ status: 'IN_PROGRESS' }).then((r) => r.data);
      return tripsApi.getAll({ status: 'IN_PROGRESS' }).then((r) => r.data);
    },
    enabled: !!user,
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
    <div className="space-y-6">
      <div className="card overflow-hidden relative" style={{ height: 'clamp(280px, 55vh, 500px)', zIndex: 1 }}>
        <MapView markers={markers} routes={routes} />
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-200/70">
          <h2 className="font-display text-[18px]">Viajes en curso ({trips.length})</h2>
        </div>
        {trips.length === 0 ? (
          <div className="px-10 py-16 text-center text-ink-400 text-sm">
            Sin viajes en curso ahora mismo.
          </div>
        ) : (
          <div>
            {trips.map((trip: any, i: number) => (
              <Link
                key={trip.id}
                href={`/trips/${trip.id}`}
                className={`flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-surface-sunk/60 ${i !== 0 ? 'border-t border-ink-200/60' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-900 truncate">{trip.load?.title}</p>
                  <p className="text-[12.5px] text-ink-500 truncate mt-0.5">
                    {trip.carrier?.firstName} {trip.carrier?.lastName}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(trip.status)}`}>
                  {getSolicitudStageLabel(trip.status)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
