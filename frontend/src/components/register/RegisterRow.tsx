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
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import StatusBadge from '@/components/ui/StatusBadge';
import type { RegisterItem, RegisterParticipant } from '@/types/register';
import MessageThread from './MessageThread';

interface Props { item: RegisterItem }

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
  const trip = item.trip;

  const handleToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) setThread(true);
  };

  return (
    <div className={cn('card overflow-hidden transition', expanded && 'shadow-raised')}>
      <button
        onClick={handleToggle}
        className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-surface-sunk/50 transition"
      >
        <div className="pt-1 text-ink-400">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-display text-[18px] text-ink-900 truncate">{item.title}</span>
            <StatusBadge status={item.status} />
          </div>
          <p className="text-[12px] text-ink-500 mt-1.5 truncate flex items-center gap-1.5">
            <MapPin size={12} className="text-ink-400" />
            <span className="font-medium text-ink-700">{item.originAddress}</span>
            <span className="text-ink-400">→</span>
            <span className="font-medium text-ink-700">{item.destAddress}</span>
          </p>
          <div className="text-[12px] text-ink-600 mt-2 flex flex-wrap gap-x-5 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Package size={12} className="text-ink-400" />
              {item.cargoType} · <span className="font-mono">{item.weight} kg</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UserIcon size={12} className="text-ink-400" />
              Gen: <span className="text-ink-800">{participantLabel(item.shipper)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Truck size={12} className="text-ink-400" />
              Trans: <span className="text-ink-800">{participantLabel(trip?.carrier)}</span>
            </span>
          </div>
        </div>

        <div className="text-right shrink-0">
          <p className="font-display text-[18px] text-ink-900 tabular-nums">{formatCurrency(item.price)}</p>
          <p className="text-[11px] text-ink-500 font-mono">Retiro {formatDate(item.pickupDate)}</p>
          <p className="text-[11px] text-ink-400 mt-1.5 inline-flex items-center justify-end gap-1">
            <MessageSquare size={11} /> {trip?.messageCount ?? 0}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="card-divider px-5 py-5 bg-surface-sunk/30 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-[13px]">
            <Section title="Carga">
              <Row label="Tipo" value={item.cargoType} />
              <Row label="Peso" value={<span className="font-mono">{item.weight} kg</span>} />
              <Row label="Volumen" value={item.volume ? <span className="font-mono">{item.volume} m³</span> : '—'} />
              <Row label="Precio" value={<span className="font-mono">{formatCurrency(item.price)}</span>} />
              {item.description && (
                <div className="pt-2">
                  <p className="eyebrow mb-1">Descripción</p>
                  <p className="text-ink-800 whitespace-pre-wrap">{item.description}</p>
                </div>
              )}
            </Section>

            <Section title="Recorrido">
              <div>
                <p className="eyebrow mb-1">Origen</p>
                <p className="text-ink-800">{item.originAddress}</p>
              </div>
              <div className="pt-2">
                <p className="eyebrow mb-1">Destino</p>
                <p className="text-ink-800">{item.destAddress}</p>
              </div>
              <div className="pt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                <Row label="Retiro program." value={<span className="font-mono">{formatDateTime(item.pickupDate)}</span>} compact />
                <Row label="Entrega esperada" value={<span className="font-mono">{formatDateTime(item.deliveryDate)}</span>} compact />
                <Row label="Inicio real" value={<span className="font-mono">{formatDateTime(trip?.startedAt)}</span>} compact />
                <Row label="Entrega real" value={<span className="font-mono">{formatDateTime(trip?.completedAt)}</span>} compact />
              </div>
            </Section>

            <Section title="Generador de carga">
              <Row label="Nombre" value={participantLabel(item.shipper)} />
              <Row label="Email" value={<span className="font-mono text-[12px] break-all">{item.shipper.email ?? '—'}</span>} />
              <Row label="Teléfono" value={<span className="font-mono">{item.shipper.phone ?? '—'}</span>} />
            </Section>

            <Section title="Transportista">
              {trip ? (
                <>
                  <Row label="Nombre" value={participantLabel(trip.carrier)} />
                  <Row label="Email" value={<span className="font-mono text-[12px] break-all">{trip.carrier.email ?? '—'}</span>} />
                  <Row label="Teléfono" value={<span className="font-mono">{trip.carrier.phone ?? '—'}</span>} />
                  {trip.notes && (
                    <div className="pt-2">
                      <p className="eyebrow mb-1">Notas del viaje</p>
                      <p className="text-ink-800 whitespace-pre-wrap">{trip.notes}</p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[13px] text-ink-500 italic">Esta carga no fue tomada por ningún transportista.</p>
              )}
            </Section>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2.5">
              <p className="eyebrow inline-flex items-center gap-2">
                <MessageSquare size={11} /> Mensajes
                <span className="font-mono text-ink-400 normal-case tracking-normal text-[11px]">
                  · {trip?.messageCount ?? 0}
                </span>
              </p>
            </div>
            <MessageThread
              tripId={trip?.id ?? null}
              messageCount={trip?.messageCount ?? 0}
              enabled={thread}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="eyebrow mb-2">{title}</h4>
      {children}
    </section>
  );
}

function Row({ label, value, compact }: { label: string; value: React.ReactNode; compact?: boolean }) {
  return (
    <div className={cn('flex items-baseline gap-2', compact ? 'flex-col items-start gap-0.5' : 'justify-between')}>
      <span className="text-[11px] uppercase tracking-[0.12em] text-ink-500">{label}</span>
      <span className="text-ink-900 text-right">{value}</span>
    </div>
  );
}
