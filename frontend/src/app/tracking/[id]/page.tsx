'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { tripsApi } from '@/lib/api';
import { formatDate, getStatusColor, getStatusLabel } from '@/lib/utils';
import { useRoute } from '@/lib/useRoute';
import Link from 'next/link';

const MapView = dynamic(() => import('@/components/maps/MapView'), { ssr: false });

export default function TrackingDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data: trip, isLoading } = useQuery({
    queryKey: ['tracking-trip', id],
    queryFn: () => tripsApi.getById(id).then((r) => r.data),
    refetchInterval: 5000,
  });

  const routes = useRoute(
    trip?.load?.originLat,
    trip?.load?.originLng,
    trip?.load?.destLat,
    trip?.load?.destLng,
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      </DashboardLayout>
    );
  }

  if (!trip) {
    return <DashboardLayout><div className="text-center py-20 text-gray-400">Viaje no encontrado</div></DashboardLayout>;
  }

  const markers = [];
  if (trip.load) {
    markers.push({ id: 'origin', lat: trip.load.originLat, lng: trip.load.originLng, title: `Origen: ${trip.load.originAddress}` });
    markers.push({ id: 'dest', lat: trip.load.destLat, lng: trip.load.destLng, title: `Destino: ${trip.load.destAddress}` });
  }
  if (trip.currentLat && trip.currentLng) {
    markers.push({ id: 'truck', lat: trip.currentLat, lng: trip.currentLng, title: 'Posición Actual', status: trip.status });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{trip.load?.title || 'Seguimiento del Viaje'}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(trip.status)}`}>{getStatusLabel(trip.status)}</span>
              <span className="text-sm text-gray-500">
                {trip.carrier?.firstName} {trip.carrier?.lastName}
              </span>
            </div>
          </div>
          <Link
            href={`/trips/${trip.id}`}
            className="text-primary-600 hover:underline text-sm font-medium"
          >
            Ver detalles completos
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative" style={{ height: 'clamp(280px, 55vh, 500px)', zIndex: 1 }}>
          <MapView markers={markers} routes={routes} zoom={10} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm text-gray-500">Origen</p>
            <p className="font-medium mt-1">{trip.load?.originAddress}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm text-gray-500">Destino</p>
            <p className="font-medium mt-1">{trip.load?.destAddress}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <p className="text-sm text-gray-500">Última Actualización</p>
            <p className="font-medium mt-1">
              {trip.currentLat
                ? `${trip.currentLat.toFixed(4)}, ${trip.currentLng.toFixed(4)}`
                : 'Sin datos de ubicación aún'}
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
