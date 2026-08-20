'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatusBadge from '@/components/ui/StatusBadge';
import { postulationsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  awaitsCarrierReply,
  countAwaitingCarrierReply,
  isOpenPostulation,
  OPEN_POSTULATION_STATUSES,
} from '@/lib/postulations';
import { Hand, Inbox, ArrowRight, BellRing } from 'lucide-react';
import type { PostulationWithLoad } from '@/types';

export default function MyPostulationsPage() {
  const user = useAuthStore((s) => s.user);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['my-postulations'],
    queryFn: () => postulationsApi.getMy().then((r) => r.data as PostulationWithLoad[]),
    enabled: !!user,
  });

  // Solo las que siguen sin resolverse: una postulación aceptada ya es un viaje
  // y vive en "Mis Viajes", así que listarla acá duplicaría esa pantalla.
  const postulations = (data ?? []).filter(isOpenPostulation);
  const awaitingReply = countAwaitingCarrierReply(postulations);
  const visible = statusFilter
    ? postulations.filter((p) => p.status === statusFilter)
    : postulations;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="eyebrow">Esperando respuesta</p>
            <h1 className="mt-2 font-display text-3xl sm:text-[38px] leading-[1.05]">
              Mis <span className="font-semibold text-primary-700">postulaciones</span>
            </h1>
            <p className="text-[13.5px] text-ink-500 mt-2">
              Las que ya se resolvieron salen de acá: si te aceptaron, la carga pasa a{' '}
              <Link href="/trips" className="text-primary-700 hover:underline">
                Mis Viajes
              </Link>
              .
            </p>
          </div>
          <Link
            href="/loads"
            className="shrink-0 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary-700 hover:underline"
          >
            Ver cargas disponibles <ArrowRight size={14} />
          </Link>
        </div>

        {awaitingReply > 0 && (
          <div className="card px-5 py-4 flex items-start gap-3 ring-1 ring-primary-600/15">
            <BellRing size={18} className="text-primary-600 shrink-0 mt-0.5" />
            <p className="text-[13.5px] text-ink-700">
              Tenés{' '}
              <span className="font-semibold text-primary-700">
                {awaitingReply} contraoferta{awaitingReply === 1 ? '' : 's'}
              </span>{' '}
              esperando tu respuesta. Abrí la carga para aceptarla o proponer otro precio.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <FilterChip active={statusFilter === ''} onClick={() => setStatusFilter('')}>
            Todas ({postulations.length})
          </FilterChip>
          {OPEN_POSTULATION_STATUSES.map((status) => {
            const count = postulations.filter((p) => p.status === status).length;
            if (count === 0) return null;
            return (
              <FilterChip
                key={status}
                active={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                <StatusBadge status={status} /> {count}
              </FilterChip>
            );
          })}
        </div>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200/70">
            <h2 className="font-display text-[20px] flex items-center gap-2">
              <Hand size={18} className="text-primary-600" />
              {statusFilter ? 'Filtradas' : 'Todas'}
            </h2>
            <span className="text-[12px] uppercase tracking-[0.16em] text-ink-500 tabular-nums">
              {visible.length}
            </span>
          </div>

          {isLoading ? (
            <EmptyState text="Cargando tus postulaciones…" />
          ) : visible.length === 0 ? (
            <EmptyState
              text={
                statusFilter
                  ? 'No hay postulaciones en ese estado.'
                  : 'No tenés postulaciones esperando respuesta.'
              }
            />
          ) : (
            <div>
              {visible.map((p, i) => {
                const needsReply = awaitsCarrierReply(p);
                return (
                  <Link
                    key={p.id}
                    href={`/loads/${p.loadId}`}
                    className={`flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-surface-sunk/60 ${
                      i !== 0 ? 'border-t border-ink-200/60' : ''
                    } ${needsReply ? 'bg-primary-50/40' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink-900 truncate">{p.load.title}</p>
                      <p className="text-[12.5px] text-ink-500 truncate mt-0.5">
                        {p.load.originAddress} <span className="text-ink-400">→</span> {p.load.destAddress}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[12px] text-ink-500">
                        {p.proposedPrice != null && (
                          <span>
                            Propusiste{' '}
                            <span className="font-mono text-primary-700">
                              {formatCurrency(p.proposedPrice)}
                            </span>
                          </span>
                        )}
                        {p.counterOfferPrice != null && (
                          <span>
                            Contraoferta{' '}
                            <span className="font-mono text-primary-700">
                              {formatCurrency(p.counterOfferPrice)}
                            </span>
                          </span>
                        )}
                        <span className="font-mono text-ink-400">{formatDate(p.createdAt)}</span>
                      </div>
                      {needsReply && (
                        <p className="text-[12px] font-medium text-primary-700 mt-1.5">
                          Esperando tu respuesta
                        </p>
                      )}
                    </div>
                    <StatusBadge status={p.status} />
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12.5px] font-medium transition tabular-nums ${
        active
          ? 'border-ink-900 bg-ink-900 text-surface-raised'
          : 'border-ink-200 bg-surface-raised text-ink-600 hover:border-ink-300'
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="px-8 py-12 text-center">
      <div className="inline-flex w-10 h-10 rounded-full bg-ink-100 items-center justify-center mb-3">
        <Inbox size={16} className="text-ink-400" />
      </div>
      <p className="text-[13px] text-ink-500">{text}</p>
    </div>
  );
}
