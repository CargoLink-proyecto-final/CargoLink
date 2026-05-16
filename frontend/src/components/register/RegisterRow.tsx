'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  MapPin,
  MessageSquare,
  Package,
  Truck,
  User as UserIcon,
} from 'lucide-react';
import { cn, formatCurrency, formatDate, getStatusColor, getStatusLabel } from '@/lib/utils';
import type { RegisterItem, RegisterParticipant } from '@/types/register';
import MessageThread from './MessageThread';

interface Props {
  item: RegisterItem;
}

function participantLabel(p: RegisterParticipant | null | undefined): string {
  if (!p) return '—';
  const name = `${p.firstName} ${p.lastName}`.trim();
  return p.companyName ? `${name} · ${p.companyName}` : name;
}

function formatDateTime(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function RegisterRow({ item }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [thread, setThread] = useState(false);

  const handleToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) setThread(true);
  };

  const trip = item.trip;

  return (
    <div className="border border-gray-100 rounded-xl bg-white shadow-sm overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full flex items-start gap-4 px-4 py-3 text-left hover:bg-gray-50 transition"
      >
        <div className="pt-1 text-gray-400">
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 truncate">{item.title}</span>
            <span className={cn('text-xs px-2 py-0.5 rounded-full', getStatusColor(item.status))}>
              {getStatusLabel(item.status)}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1 truncate">
            <MapPin size={12} className="inline mr-1 -mt-0.5" />
            {item.originAddress} → {item.destAddress}
          </p>
          <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
            <span>
              <Package size={12} className="inline mr-1 -mt-0.5" />
              {item.cargoType} · {item.weight} kg
            </span>
            <span>
              <UserIcon size={12} className="inline mr-1 -mt-0.5" />
              Gen: {participantLabel(item.shipper)}
            </span>
            <span>
              <Truck size={12} className="inline mr-1 -mt-0.5" />
              Trans: {participantLabel(trip?.carrier)}
            </span>
          </div>
        </div>

        <div className="text-right shrink-0">
          <p className="text-sm font-medium">{formatCurrency(item.price)}</p>
          <p className="text-xs text-gray-500">
            Retiro: {formatDate(item.pickupDate)}
          </p>
          <p className="text-xs text-gray-400 mt-1 flex items-center justify-end gap-1">
            <MessageSquare size={12} /> {trip?.messageCount ?? 0}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50/50 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <section>
              <h4 className="font-semibold text-gray-700 mb-2">Carga</h4>
              <dl className="space-y-1 text-gray-600">
                <div className="flex justify-between gap-3">
                  <dt>Tipo</dt><dd className="text-gray-900">{item.cargoType}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Peso</dt><dd className="text-gray-900">{item.weight} kg</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Volumen</dt><dd className="text-gray-900">{item.volume ? `${item.volume} m³` : '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Precio</dt><dd className="text-gray-900">{formatCurrency(item.price)}</dd>
                </div>
                {item.description && (
                  <div className="pt-1">
                    <dt className="text-gray-500">Descripción</dt>
                    <dd className="text-gray-900 mt-0.5 whitespace-pre-wrap">{item.description}</dd>
                  </div>
                )}
              </dl>
            </section>

            <section>
              <h4 className="font-semibold text-gray-700 mb-2">Recorrido</h4>
              <dl className="space-y-1 text-gray-600">
                <div>
                  <dt className="text-gray-500">Origen</dt>
                  <dd className="text-gray-900">{item.originAddress}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Destino</dt>
                  <dd className="text-gray-900">{item.destAddress}</dd>
                </div>
                <div className="flex justify-between gap-3 pt-1">
                  <dt>Retiro programado</dt>
                  <dd className="text-gray-900">{formatDateTime(item.pickupDate)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Entrega esperada</dt>
                  <dd className="text-gray-900">{formatDateTime(item.deliveryDate)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Inicio real</dt>
                  <dd className="text-gray-900">{formatDateTime(trip?.startedAt)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Entrega real</dt>
                  <dd className="text-gray-900">{formatDateTime(trip?.completedAt)}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h4 className="font-semibold text-gray-700 mb-2">Generador de carga</h4>
              <dl className="space-y-1 text-gray-600">
                <div className="flex justify-between gap-3">
                  <dt>Nombre</dt>
                  <dd className="text-gray-900 text-right">{participantLabel(item.shipper)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Email</dt>
                  <dd className="text-gray-900 text-right break-all">{item.shipper.email ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Teléfono</dt>
                  <dd className="text-gray-900 text-right">{item.shipper.phone ?? '—'}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h4 className="font-semibold text-gray-700 mb-2">Transportista</h4>
              {trip ? (
                <dl className="space-y-1 text-gray-600">
                  <div className="flex justify-between gap-3">
                    <dt>Nombre</dt>
                    <dd className="text-gray-900 text-right">{participantLabel(trip.carrier)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Email</dt>
                    <dd className="text-gray-900 text-right break-all">{trip.carrier.email ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Teléfono</dt>
                    <dd className="text-gray-900 text-right">{trip.carrier.phone ?? '—'}</dd>
                  </div>
                  {trip.notes && (
                    <div className="pt-1">
                      <dt className="text-gray-500">Notas del viaje</dt>
                      <dd className="text-gray-900 mt-0.5 whitespace-pre-wrap">{trip.notes}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-sm text-gray-500 italic">Esta carga no fue tomada por ningún transportista.</p>
              )}
            </section>
          </div>

          <section>
            <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <MessageSquare size={16} /> Mensajes
              <span className="text-xs font-normal text-gray-500">
                ({trip?.messageCount ?? 0})
              </span>
            </h4>
            <MessageThread
              tripId={trip?.id ?? null}
              messageCount={trip?.messageCount ?? 0}
              enabled={thread}
            />
          </section>
        </div>
      )}
    </div>
  );
}
