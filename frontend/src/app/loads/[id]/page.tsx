'use client';

import { useState, FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import DashboardLayout from '@/components/layout/DashboardLayout';
import RatingModal from '@/components/ratings/RatingModal';
import { loadsApi, postulationsApi, ratingsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useRoute } from '@/lib/useRoute';
import { describeMissing } from '@/lib/transporterProfile';
import Link from 'next/link';
import { formatCurrency, formatPrice, formatDate, getStatusColor, getSolicitudStageLabel } from '@/lib/utils';
import {
  MapPin,
  Package,
  Calendar,
  User,
  Truck,
  MessageSquare,
  Hand,
  Star,
} from 'lucide-react';
import PostulationsPanel from '@/components/postulations/PostulationsPanel';
import PostulateModal from '@/components/postulations/PostulateModal';
import StatusBadge from '@/components/ui/StatusBadge';
import type { PostulationWithLoad } from '@/types';

const MapView = dynamic(() => import('@/components/maps/MapView'), { ssr: false });

function NegotiationResponder({
  counterOfferPrice,
  onAccept,
  accepting,
  onCounter,
  countering,
}: {
  counterOfferPrice: number;
  onAccept: () => void;
  accepting: boolean;
  onCounter: (price: number) => void;
  countering: boolean;
}) {
  const [showCounterInput, setShowCounterInput] = useState(false);
  const [counterInput, setCounterInput] = useState('');

  const counterParsed = Number(counterInput);
  const counterError =
    counterInput !== '' && (
      counterParsed <= 0
        ? 'El precio debe ser mayor a 0'
        : counterParsed <= counterOfferPrice
        ? `Debe ser mayor a la contra-oferta del publicador ($${counterOfferPrice}). Si aceptás ese precio, usá "Aceptar".`
        : null
    );

  function handleCounter(e: FormEvent) {
    e.preventDefault();
    if (!counterParsed || counterParsed <= 0) return;
    if (counterParsed <= counterOfferPrice) return;
    onCounter(counterParsed);
    setShowCounterInput(false);
    setCounterInput('');
  }

  return (
    <div className="space-y-2">
      {showCounterInput ? (
        <form onSubmit={handleCounter} className="space-y-1">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step="any"
              value={counterInput}
              onChange={(e) => setCounterInput(e.target.value)}
              placeholder={`Más de $${counterOfferPrice}`}
              className={`flex-1 rounded-card border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${counterError ? 'border-danger-400 focus:border-danger-400' : 'border-ink-200 focus:border-primary-500'}`}
              autoFocus
            />
            <button
              type="submit"
              disabled={countering || !counterInput || !!counterError}
              className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-50"
            >
              {countering ? '...' : 'Enviar'}
            </button>
            <button
              type="button"
              onClick={() => { setShowCounterInput(false); setCounterInput(''); }}
              className="text-sm text-ink-500 hover:text-ink-700 px-2 py-1.5"
            >
              Cancelar
            </button>
          </div>
          {counterError && (
            <p className="text-xs text-danger-600">{counterError}</p>
          )}
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={onAccept}
            disabled={accepting}
            className="bg-success-600 hover:bg-success-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-50"
          >
            {accepting ? 'Aceptando...' : `Aceptar ${formatCurrency(counterOfferPrice)}`}
          </button>
          <button
            onClick={() => setShowCounterInput(true)}
            className="border border-primary-600 text-primary-700 hover:bg-primary-50 text-sm font-medium px-3 py-1.5 rounded-lg transition"
          >
            Contra-ofertar
          </button>
        </div>
      )}
    </div>
  );
}

export default function LoadDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const id = params.id as string;
  const [showPostulateModal, setShowPostulateModal] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [postulateError, setPostulateError] = useState('');

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

  const isTransporter = user?.role === 'TRANSPORTER';
  const isOwner =
    user?.role === 'CARGO_GENERATOR' && load?.shipperId === user.id;

  // El publicador de carga califica al transportista una vez entregada la carga
  // (viaje completado) y mientras no lo haya calificado todavía.
  const canRateCarrier =
    isOwner &&
    load?.trip?.status === 'COMPLETED' &&
    !load.trip.ratings?.some(
      (r: { fromUserId: string }) => r.fromUserId === user?.id,
    );
  const carrierName = load?.trip?.carrier
    ? `${load.trip.carrier.firstName} ${load.trip.carrier.lastName}`
    : '';

  const { data: myPostulation } = useQuery({
    queryKey: ['my-postulation', id, user?.id],
    queryFn: () =>
      postulationsApi
        .getMy()
        .then(
          (r) =>
            (r.data as PostulationWithLoad[]).find((p) => p.loadId === id) ?? null,
        ),
    enabled: !!user && isTransporter,
  });

  const postulateMutation = useMutation({
    mutationFn: (payload: { message?: string; proposedPrice?: number }) =>
      postulationsApi.create(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-postulation', id, user?.id] });
      queryClient.invalidateQueries({ queryKey: ['postulations', id] });
      setShowPostulateModal(false);
      setPostulateError('');
    },
    // 403 con perfil incompleto: el backend manda `missing[]` con lo que falta.
    onError: (err: any) => {
      const missing: string[] | undefined = err?.response?.data?.missing;
      const message =
        missing && missing.length > 0
          ? `Completá tu perfil antes de postularte: ${missing.map(describeMissing).join(', ')}.`
          : err?.response?.data?.message || 'No se pudo enviar la postulación';
      setPostulateError(message);
    },
  });
  const profileIncompleteError = Boolean(
    (postulateMutation.error as any)?.response?.data?.missing?.length,
  );

  const withdrawMutation = useMutation({
    mutationFn: (postulationId: string) =>
      postulationsApi.withdraw(postulationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-postulation', id, user?.id] });
      queryClient.invalidateQueries({ queryKey: ['postulations', id] });
    },
  });

  const acceptOfferMutation = useMutation({
    mutationFn: (postulationId: string) => postulationsApi.acceptOffer(postulationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-postulation', id, user?.id] });
      queryClient.invalidateQueries({ queryKey: ['load', id] });
    },
  });

  const transporterCounterOfferMutation = useMutation({
    mutationFn: ({ postulationId, price }: { postulationId: string; price: number }) =>
      postulationsApi.counterOffer(postulationId, price),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-postulation', id, user?.id] });
    },
  });

  const rateMutation = useMutation({
    mutationFn: ({ score, comment }: { score: number; comment: string }) =>
      ratingsApi.create({ tripId: load.trip.id, score, comment }),
    onSuccess: () => {
      setShowRating(false);
      queryClient.invalidateQueries({ queryKey: ['load', id] });
      // El mismo viaje también tiene su página propia; la refrescamos para que
      // el botón de calificar desaparezca también ahí.
      if (load?.trip?.id) {
        queryClient.invalidateQueries({ queryKey: ['trip', load.trip.id] });
      }
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

  const canPostulate =
    isTransporter &&
    load.status === 'PUBLISHED' &&
    (!myPostulation || myPostulation.status === 'WITHDRAWN');
  const canWithdraw =
    isTransporter &&
    load.status === 'PUBLISHED' &&
    (myPostulation?.status === 'PENDING' || myPostulation?.status === 'NEGOTIATING');

  const hasPendingCounterOffer =
    myPostulation?.status === 'NEGOTIATING' && myPostulation?.lastOfferBy === 'SHIPPER';

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{load.title}</h1>
            <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(load.status)}`}>
              {getSolicitudStageLabel(load.status)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {canPostulate && (
              <button
                onClick={() => setShowPostulateModal(true)}
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                Postularme
              </button>
            )}
            {isTransporter && load.trip && load.trip.carrierId === user?.id && (
              <Link
                href={`/trips/${load.trip.id}`}
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1"
              >
                <Truck size={16} /> Ir al viaje
              </Link>
            )}
            {isOwner && load.trip && (
              <Link
                href={`/trips/${load.trip.id}`}
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1"
              >
                <Truck size={16} /> Ir al viaje
              </Link>
            )}
            {canRateCarrier && (
              <button
                onClick={() => setShowRating(true)}
                className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1"
              >
                <Star size={16} /> Calificar al transportista
              </button>
            )}
            {isOwner && load.status !== 'DELIVERED' && load.status !== 'CANCELLED' && (
              <Link
                href={`/loads/${id}/edit`}
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                Editar
              </Link>
            )}
            {isOwner && load.status === 'PUBLISHED' && (
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                Cancelar Carga
              </button>
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

        {isOwner && (load.pendingPostulationsCount ?? 0) > 0 && load.status === 'PUBLISHED' && (
          <div className="card p-4 flex items-center justify-between bg-primary-50 border-primary-200">
            <div className="flex items-center gap-2 text-primary-800">
              <Hand size={18} />
              <span className="font-medium">
                Tenés {load.pendingPostulationsCount} postulaci
                {load.pendingPostulationsCount === 1 ? 'ón' : 'ones'} pendiente
                {load.pendingPostulationsCount === 1 ? '' : 's'} para revisar.
              </span>
            </div>
            <a href="#postulaciones" className="text-sm font-medium text-primary-700 hover:text-primary-800">
              Ver abajo ↓
            </a>
          </div>
        )}

        {isTransporter && myPostulation?.status === 'ACCEPTED' && load.trip && load.trip.status === 'ACCEPTED' && (
          <div className="card p-4 flex items-center justify-between bg-success-50 border-success-200">
            <div className="flex items-center gap-2 text-success-800">
              <Truck size={18} />
              <span className="font-medium">
                Tu postulación fue aceptada. Marcá la carga como recogida para iniciar el viaje.
              </span>
            </div>
            <Link
              href={`/trips/${load.trip.id}`}
              className="text-sm font-medium text-success-700 hover:text-success-800"
            >
              Ir al viaje →
            </Link>
          </div>
        )}

        {isTransporter && myPostulation && myPostulation.status !== 'WITHDRAWN' && (
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-ink-600">Tu postulación:</span>
                <StatusBadge status={myPostulation.status} />
              </div>
              {canWithdraw && (
                <button
                  onClick={() => withdrawMutation.mutate(myPostulation.id)}
                  disabled={withdrawMutation.isPending}
                  className="text-sm font-medium text-danger-700 hover:text-danger-800 disabled:opacity-50"
                >
                  {withdrawMutation.isPending ? 'Retirando...' : 'Retirar postulación'}
                </button>
              )}
            </div>

            {myPostulation.proposedPrice != null && (
              <p className="text-sm text-ink-600">
                Tu oferta: <span className="font-medium">{formatCurrency(myPostulation.proposedPrice)}</span>
              </p>
            )}

            {hasPendingCounterOffer && myPostulation.counterOfferPrice != null && (
              <div className="rounded-card border border-warning-400/40 bg-warning-50 p-3 space-y-2">
                <p className="text-sm font-medium text-warning-800">
                  El publicador de carga propuso {formatCurrency(myPostulation.counterOfferPrice)}
                </p>
                <NegotiationResponder
                  counterOfferPrice={myPostulation.counterOfferPrice}
                  onAccept={() => acceptOfferMutation.mutate(myPostulation.id)}
                  accepting={acceptOfferMutation.isPending}
                  onCounter={(price) =>
                    transporterCounterOfferMutation.mutate({ postulationId: myPostulation.id, price })
                  }
                  countering={transporterCounterOfferMutation.isPending}
                />
              </div>
            )}

            {myPostulation.status === 'NEGOTIATING' && myPostulation.lastOfferBy === 'TRANSPORTER' && (
              <p className="text-sm text-ink-400 italic">Contra-oferta enviada — esperando respuesta del publicador de carga…</p>
            )}
          </div>
        )}

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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Tipo:</span> <span className="font-medium">{load.cargoType}</span></div>
              <div><span className="text-gray-500">Peso:</span> <span className="font-medium">{load.weight} kg</span></div>
              {load.volume && <div><span className="text-gray-500">Volumen:</span> <span className="font-medium">{load.volume} m3</span></div>}
              {load.packageCount != null && <div><span className="text-gray-500">Bultos:</span> <span className="font-medium">{load.packageCount}</span></div>}
              {(load.heightCm != null || load.widthCm != null || load.lengthCm != null) && (
                <div><span className="text-gray-500">Dimensiones:</span> <span className="font-medium">{[load.heightCm, load.widthCm, load.lengthCm].map((d) => (d != null ? d : '—')).join(' × ')} cm</span></div>
              )}
              <div><span className="text-gray-500">Precio:</span> <span className="font-medium text-primary-600">{formatPrice(load.price)}</span></div>
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
              {load.deliveryDate && <div><span className="text-gray-500">Entrega deseada:</span> <span className="font-medium">{formatDate(load.deliveryDate)}</span></div>}
              <div><span className="text-gray-500">Creado:</span> <span className="font-medium">{formatDate(load.createdAt)}</span></div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold flex items-center gap-2"><User size={18} /> Publicador de carga</h2>
            <div className="text-sm">
              <p className="font-medium">{load.shipper?.firstName} {load.shipper?.lastName}</p>
              {load.shipper?.companyName && <p className="text-gray-500">{load.shipper.companyName}</p>}
              {load.shipper?.industry && <p className="text-gray-500">Rubro: {load.shipper.industry}</p>}
            </div>
            {load.trip && (
              <>
                <h2 className="font-semibold flex items-center gap-2 pt-2 border-t"><Truck size={18} /> Transportista</h2>
                <div className="text-sm">
                  <p className="font-medium">{load.trip.carrier?.firstName} {load.trip.carrier?.lastName}</p>
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(load.trip.status)}`}>
                    {getSolicitudStageLabel(load.trip.status)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {isOwner && (
          <div id="postulaciones">
            <PostulationsPanel
              loadId={id}
              listedPrice={load.price}
              canAccept={load.status === 'PUBLISHED'}
            />
          </div>
        )}
      </div>

      {showPostulateModal && (
        <PostulateModal
          listedPrice={load.price}
          submitting={postulateMutation.isPending}
          error={postulateError}
          showCompleteProfileLink={profileIncompleteError}
          onClose={() => {
            setShowPostulateModal(false);
            setPostulateError('');
          }}
          onSubmit={(payload) => {
            setPostulateError('');
            postulateMutation.mutate(payload);
          }}
        />
      )}

      {showRating && (
        <RatingModal
          onClose={() => setShowRating(false)}
          onSubmit={(score, comment) => rateMutation.mutate({ score, comment })}
          isPending={rateMutation.isPending}
          rateeRoleLabel="al transportista"
          rateeName={carrierName}
        />
      )}
    </DashboardLayout>
  );
}
