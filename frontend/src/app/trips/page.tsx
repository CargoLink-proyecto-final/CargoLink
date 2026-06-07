'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatusBadge from '@/components/ui/StatusBadge';
import { tripsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { formatDate, getStatusLabel } from '@/lib/utils';
import { ArrowRight, Star, Truck } from 'lucide-react';
import type { Trip, TripStatus } from '@/types';

const STATUSES: TripStatus[] = [
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

export default function TripsPage() {
  const user = useAuthStore((s) => s.user);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);

  const isShipper = user?.role === 'CARGO_GENERATOR';

  const { data, isLoading } = useQuery({
    queryKey: ['trips', user?.role, statusFilter, page],
    queryFn: () => {
      const params: Record<string, unknown> = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      const request = isShipper ? tripsApi.getMyLoads(params) : tripsApi.getMy(params);
      return request.then((r) => r.data);
    },
    enabled: !!user,
  });

  const trips: Trip[] = data?.trips || [];
  const totalPages: number = data?.totalPages ?? 1;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="eyebrow">{isShipper ? 'Tus entregas' : 'Tu actividad'}</p>
            <h1 className="mt-2 font-display text-3xl sm:text-[38px] leading-[1.05]">
              Mis <span className="font-semibold text-primary-700">viajes</span>
            </h1>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="w-full sm:w-auto px-3 py-2 border border-ink-200 rounded-lg text-[13.5px] bg-surface-raised focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 outline-none transition"
          >
            <option value="">Todos los estados</option>
            {STATUSES.map((s) => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center text-ink-400 text-sm">Cargando…</div>
          ) : trips.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px] tabular-nums">
                  <thead>
                    <tr className="text-left text-ink-500">
                      <Th>Carga</Th>
                      <Th>{isShipper ? 'Transportista' : 'Dador de carga'}</Th>
                      <Th>Creación</Th>
                      <Th>Estado</Th>
                      <Th>Acción</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {trips.map((trip, i) => {
                      const canRate =
                        isShipper &&
                        trip.status === 'COMPLETED' &&
                        !trip.ratings?.some((r) => r.fromUserId === user?.id);
                      const counterpart = isShipper
                        ? trip.carrier
                        : trip.load?.shipper;
                      return (
                        <tr key={trip.id} className={`group transition border-t border-ink-200/60 hover:bg-surface-sunk/60 ${i % 2 === 1 ? 'bg-surface-sunk/30' : ''}`}>
                          <td className="px-5 py-3.5">
                            <Link href={`/trips/${trip.id}`}
                                  className="font-medium text-ink-900 group-hover:text-primary-700 transition inline-flex items-center gap-1.5">
                              {trip.load?.title || 'Viaje'}
                              <ArrowRight size={13} className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition" />
                            </Link>
                          </td>
                          <td className="px-5 py-3.5 text-ink-600">
                            {counterpart
                              ? `${counterpart.firstName} ${counterpart.lastName}`
                              : <span className="text-ink-300">—</span>}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-[12px] text-ink-700 whitespace-nowrap">{formatDate(trip.createdAt)}</td>
                          <td className="px-5 py-3.5">
                            <StatusBadge status={trip.status} />
                          </td>
                          <td className="px-5 py-3.5">
                            {canRate ? (
                              <Link
                                href={`/trips/${trip.id}`}
                                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100 ring-1 ring-yellow-600/20 rounded-full px-2.5 py-1 transition"
                              >
                                <Star size={13} /> Calificar
                              </Link>
                            ) : (
                              <span className="text-ink-300 text-[12px]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-ink-200/60 bg-surface-sunk/40">
                  <span className="text-[12px] text-ink-500 font-mono">
                    Página {data?.page ?? page} / {totalPages} · {data?.total} en total
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="px-3 py-1.5 text-[12px] border border-ink-200 rounded-md hover:bg-surface-raised disabled:opacity-40"
                    >
                      ← Anterior
                    </button>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page >= totalPages}
                      className="px-3 py-1.5 text-[12px] border border-ink-200 rounded-md hover:bg-surface-raised disabled:opacity-40"
                    >
                      Siguiente →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-3 text-[10px] uppercase tracking-[0.16em] font-medium bg-surface-sunk/60">
      {children}
    </th>
  );
}

function EmptyState() {
  return (
    <div className="px-10 py-20 text-center">
      <div className="inline-flex w-12 h-12 rounded-full bg-ink-100 items-center justify-center mb-4">
        <Truck size={18} className="text-ink-400" />
      </div>
      <p className="font-display text-[20px] text-ink-800">Todavía no tenés viajes</p>
      <p className="mt-1 text-[13px] text-ink-500">Cuando una carga sea asignada y entregada, vas a poder calificar al transportista desde acá.</p>
    </div>
  );
}
