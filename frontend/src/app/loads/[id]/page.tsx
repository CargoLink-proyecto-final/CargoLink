'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { loadsApi, tripsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useRoute } from '@/lib/useRoute';
import Link from 'next/link';
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils';
import { MapPin, Package, Calendar, DollarSign, User, Truck, MessageSquare } from 'lucide-react';

const MapView = dynamic(() => import('@/components/maps/MapView'), { ssr: false });

export default function LoadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const id = params.id as string;

  const { data: load, isLoading } = useQuery({
    queryKey: ['load', id],
    queryFn: () => loadsApi.getById(id).then((r) => r.data),
  });

  const routes = useRoute(
    load?.originLat,
    load?.originLng,
    load?.destLat,
    load?.destLng,
  );

  const acceptMutation = useMutation({
    mutationFn: () => tripsApi.accept(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['load', id] });
      router.push('/dashboard/carrier');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => loadsApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['load', id] });
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

  if (!load) {
    return (
      <DashboardLayout>
        <div className="text-center py-20 text-gray-400">Carga no encontrada</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{load.title}</h1>
            <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(load.status)}`}>
              {load.status}
            </span>
          </div>
          <div className="flex gap-2">
            {user?.role === 'TRANSPORTER' && load.status === 'PUBLISHED' && (
              <button
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                {acceptMutation.isPending ? 'Aceptando...' : 'Aceptar Carga'}
              </button>
            )}
            {user?.role === 'CARGO_GENERATOR' && load.shipperId === user.id && load.status === 'PUBLISHED' && (
              <>
                <Link
                  href={`/loads/${id}/edit`}
                  className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  Editar
                </Link>
                <button
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  Cancelar Carga
                </button>
              </>
            )}
            {load.trip && (
              <Link
                href={`/messages/trip/${load.trip.id}`}
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1"
              >
                <MessageSquare size={16} /> Mensaje
              </Link>
            )}
          </div>
        </div>

        {load.originLat && load.destLat && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative" style={{ height: '300px', zIndex: 1 }}>
            <MapView
              markers={[
                { id: 'origin', lat: load.originLat, lng: load.originLng, title: `Origen: ${load.originAddress}` },
                { id: 'dest', lat: load.destLat, lng: load.destLng, title: `Destino: ${load.destAddress}` },
              ]}
              routes={routes}
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold flex items-center gap-2"><Package size={18} /> Detalles de la Carga</h2>
            {load.description && <p className="text-sm text-gray-600">{load.description}</p>}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Tipo:</span> <span className="font-medium">{load.cargoType}</span></div>
              <div><span className="text-gray-500">Peso:</span> <span className="font-medium">{load.weight} kg</span></div>
              {load.volume && <div><span className="text-gray-500">Volumen:</span> <span className="font-medium">{load.volume} m3</span></div>}
              <div><span className="text-gray-500">Precio:</span> <span className="font-medium text-primary-600">{formatCurrency(load.price)}</span></div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold flex items-center gap-2"><MapPin size={18} /> Ruta</h2>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500">Origen:</span>
                <p className="font-medium">{load.originAddress}</p>
              </div>
              <div>
                <span className="text-gray-500">Destino:</span>
                <p className="font-medium">{load.destAddress}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold flex items-center gap-2"><Calendar size={18} /> Fechas</h2>
            <div className="space-y-2 text-sm">
              <div><span className="text-gray-500">Recogida:</span> <span className="font-medium">{formatDate(load.pickupDate)}</span></div>
              {load.deliveryDate && <div><span className="text-gray-500">Entrega:</span> <span className="font-medium">{formatDate(load.deliveryDate)}</span></div>}
              <div><span className="text-gray-500">Creado:</span> <span className="font-medium">{formatDate(load.createdAt)}</span></div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold flex items-center gap-2"><User size={18} /> Generador de carga</h2>
            <div className="text-sm">
              <p className="font-medium">{load.shipper?.firstName} {load.shipper?.lastName}</p>
              {load.shipper?.companyName && <p className="text-gray-500">{load.shipper.companyName}</p>}
            </div>
            {load.trip && (
              <>
                <h2 className="font-semibold flex items-center gap-2 pt-2 border-t"><Truck size={18} /> Transportista</h2>
                <div className="text-sm">
                  <p className="font-medium">{load.trip.carrier?.firstName} {load.trip.carrier?.lastName}</p>
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(load.trip.status)}`}>
                    {load.trip.status}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
