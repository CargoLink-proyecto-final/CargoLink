'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import DashboardLayout from '@/components/layout/DashboardLayout';
import RatingModal from '@/components/ratings/RatingModal';
import { tripsApi, ratingsApi } from '@/lib/api';
import type { Trip, Rating } from '@/types';
import { useAuthStore } from '@/store/auth';
import { formatCurrency, formatPrice, formatDate, getStatusColor, getSolicitudStageLabel } from '@/lib/utils';
import { useRoute } from '@/lib/useRoute';
import { MapPin, Truck, Calendar, Star, MessageSquare, Fuel, Route, Gauge } from 'lucide-react';
import Link from 'next/link';

const MapView = dynamic(() => import('@/components/maps/MapView'), { ssr: false });

function CompleteTripModal({
  onClose,
  onSubmit,
  isPending,
}: {
  onClose: () => void;
  onSubmit: (fuelLiters?: number) => void;
  isPending: boolean;
}) {
  const [liters, setLiters] = useState('');

  const parsed = liters.trim() === '' ? undefined : Number(liters);
  const invalid = parsed !== undefined && (Number.isNaN(parsed) || parsed <= 0);

  return createPortal(
    <div
      style={{ zIndex: 10000 }}
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Fuel size={20} className="text-green-600" /> Completar viaje
        </h3>
        <p className="text-sm text-gray-500">
          Ingresá los litros de combustible que usaste en este viaje. La
          distancia recorrida se calcula automáticamente desde la ruta.
        </p>
        <div>
          <label className="text-sm font-medium text-gray-700">
            Litros usados <span className="text-gray-400">(opcional)</span>
          </label>
          <div className="relative mt-1">
            <input
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              value={liters}
              onChange={(e) => setLiters(e.target.value)}
              className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              placeholder="Ej. 85.5"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">L</span>
          </div>
          {invalid && (
            <p className="text-xs text-red-600 mt-1">Ingresá un número de litros mayor a 0.</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSubmit(parsed)}
            disabled={isPending || invalid}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {isPending ? 'Completando...' : 'Completar Viaje'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function TripDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const id = params.id as string;

  const [showRating, setShowRating] = useState(false);
  const [showComplete, setShowComplete] = useState(false);

  const { data: trip, isLoading } = useQuery<Trip>({
    queryKey: ['trip', id],
    queryFn: () => tripsApi.getById(id).then((r) => r.data),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'IN_PROGRESS' ? 5000 : false;
    },
  });

  const routes = useRoute(
    trip?.load?.originLat,
    trip?.load?.originLng,
    trip?.load?.destLat,
    trip?.load?.destLng,
  );

  const startMutation = useMutation({
    mutationFn: () => tripsApi.start(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip', id] }),
  });

  const completeMutation = useMutation({
    mutationFn: (fuelLiters?: number) =>
      tripsApi.complete(id, fuelLiters != null ? { fuelLiters } : undefined),
    onSuccess: () => {
      setShowComplete(false);
      queryClient.invalidateQueries({ queryKey: ['trip', id] });
    },
  });

  const rateMutation = useMutation({
    mutationFn: ({ score, comment }: { score: number; comment: string }) =>
      ratingsApi.create({ tripId: id, score, comment }),
    onSuccess: () => {
      setShowRating(false);
      queryClient.invalidateQueries({ queryKey: ['trip', id] });
      // El mismo viaje también se ve desde el detalle de la carga, así que
      // refrescamos esa vista para que el botón de calificar desaparezca ahí.
      if (trip?.loadId) {
        queryClient.invalidateQueries({ queryKey: ['load', trip.loadId] });
      }
    },
  });

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
    markers.push({ id: 'origin', lat: trip.load.originLat, lng: trip.load.originLng, title: 'Origen' });
    markers.push({ id: 'dest', lat: trip.load.destLat, lng: trip.load.destLng, title: 'Destino' });
  }
  if (trip.currentLat && trip.currentLng) {
    markers.push({ id: 'current', lat: trip.currentLat, lng: trip.currentLng, title: 'Ubicación Actual', status: trip.status });
  }

  // Por ahora la calificación es unidireccional: solo el publicador de carga
  // (dueño de la carga) califica al transportista.
  const isShipper = trip.load?.shipperId === user?.id;
  const canRate =
    isShipper &&
    trip.status === 'COMPLETED' &&
    !trip.ratings?.some((r) => r.fromUserId === user?.id);

  const rateeRoleLabel = 'al transportista';
  const rateeName = trip.carrier
    ? `${trip.carrier.firstName} ${trip.carrier.lastName}`
    : '';

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{trip.load?.title || 'Detalles del Viaje'}</h1>
            <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(trip.status)}`}>
              {getSolicitudStageLabel(trip.status)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {user?.role === 'TRANSPORTER' && trip.carrierId === user.id && trip.status === 'ACCEPTED' && (
              <button
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                Marcar como recogida e iniciar
              </button>
            )}
            {user?.role === 'TRANSPORTER' && trip.carrierId === user.id && trip.status === 'IN_PROGRESS' && (
              <button
                onClick={() => setShowComplete(true)}
                disabled={completeMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                Completar Viaje
              </button>
            )}
            {['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(trip.status) && (
              <Link
                href={`/messages/trip/${trip.id}`}
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1"
              >
                <MessageSquare size={16} /> Mensaje
              </Link>
            )}
            {canRate && (
              <button
                onClick={() => setShowRating(true)}
                className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1"
              >
                <Star size={16} /> Calificar {rateeRoleLabel}
              </button>
            )}
          </div>
        </div>

        {(markers.length > 0 || routes.length > 0) && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative" style={{ height: 'clamp(240px, 50vh, 350px)', zIndex: 1 }}>
            <MapView markers={markers} routes={routes} />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold flex items-center gap-2"><MapPin size={18} /> Ruta</h2>
            <div className="space-y-2 text-sm">
              <div><span className="text-gray-500">Origen:</span><p className="font-medium">{trip.load?.originAddress}</p></div>
              <div><span className="text-gray-500">Destino:</span><p className="font-medium">{trip.load?.destAddress}</p></div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold flex items-center gap-2"><Calendar size={18} /> Cronología</h2>
            <div className="space-y-2 text-sm">
              <div><span className="text-gray-500">Creado:</span> <span className="font-medium">{formatDate(trip.createdAt)}</span></div>
              {trip.startedAt && <div><span className="text-gray-500">Iniciado:</span> <span className="font-medium">{formatDate(trip.startedAt)}</span></div>}
              {trip.completedAt && <div><span className="text-gray-500">Completado:</span> <span className="font-medium">{formatDate(trip.completedAt)}</span></div>}
            </div>
          </div>

          {trip.status === 'COMPLETED' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
              <h2 className="font-semibold flex items-center gap-2"><Fuel size={18} /> Combustible y recorrido</h2>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="flex flex-col items-start gap-1">
                  <span className="text-gray-500 flex items-center gap-1"><Route size={14} /> Distancia</span>
                  <span className="font-medium">{trip.distanceKm != null ? `${trip.distanceKm} km` : '—'}</span>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <span className="text-gray-500 flex items-center gap-1"><Fuel size={14} /> Combustible</span>
                  <span className="font-medium">{trip.fuelLiters != null ? `${trip.fuelLiters} L` : '—'}</span>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <span className="text-gray-500 flex items-center gap-1"><Gauge size={14} /> Rendimiento</span>
                  <span className="font-medium">
                    {trip.distanceKm != null && trip.fuelLiters
                      ? `${(trip.distanceKm / trip.fuelLiters).toFixed(1)} km/L`
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
            <h2 className="font-semibold flex items-center gap-2"><Truck size={18} /> Transportista</h2>
            <p className="font-medium text-sm">{trip.carrier?.firstName} {trip.carrier?.lastName}</p>
            {trip.carrier?.companyName && <p className="text-sm text-gray-500">{trip.carrier.companyName}</p>}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-3">
            <h2 className="font-semibold">Carga</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-gray-500">Tipo:</span> <span className="font-medium">{trip.load?.cargoType}</span></div>
              <div><span className="text-gray-500">Peso:</span> <span className="font-medium">{trip.load?.weight} kg</span></div>
              <div><span className="text-gray-500">Precio:</span> <span className="font-medium text-primary-600">{formatPrice(trip.load?.price)}</span></div>
            </div>
          </div>
        </div>

        {(trip.ratings?.length ?? 0) > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold mb-4">Calificaciones</h2>
            <div className="space-y-3">
              {trip.ratings?.map((r: Rating) => (
                <div key={r.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-1 text-yellow-500">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={14} fill={i < r.score ? 'currentColor' : 'none'} />
                    ))}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{r.fromUser?.firstName} {r.fromUser?.lastName}</p>
                    {r.comment && <p className="text-sm text-gray-600 mt-1">{r.comment}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showComplete && (
          <CompleteTripModal
            onClose={() => setShowComplete(false)}
            onSubmit={(fuelLiters) => completeMutation.mutate(fuelLiters)}
            isPending={completeMutation.isPending}
          />
        )}

        {showRating && (
          <RatingModal
            onClose={() => setShowRating(false)}
            onSubmit={(score, comment) => rateMutation.mutate({ score, comment })}
            isPending={rateMutation.isPending}
            rateeRoleLabel={rateeRoleLabel}
            rateeName={rateeName}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
