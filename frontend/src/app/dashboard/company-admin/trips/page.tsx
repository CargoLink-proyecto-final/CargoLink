'use client';

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatusBadge from '@/components/ui/StatusBadge';
import { companiesApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Truck, Inbox } from 'lucide-react';
import type { CompanyDriver, CompanyTrip, TripStatus } from '@/types';

const STATUS_OPTIONS: { value: '' | TripStatus; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'ACCEPTED', label: 'Aceptado' },
  { value: 'IN_PROGRESS', label: 'En progreso' },
  { value: 'COMPLETED', label: 'Completado' },
  { value: 'CANCELLED', label: 'Cancelado' },
];

interface Filters {
  status: '' | TripStatus;
  driverId: string;
  from: string;
  to: string;
}

export default function CompanyTripsPage() {
  const [filters, setFilters] = useState<Filters>({
    status: '',
    driverId: '',
    from: '',
    to: '',
  });

  const { data: drivers } = useQuery({
    queryKey: ['company', 'drivers'],
    queryFn: () => companiesApi.getDrivers().then((r) => r.data as CompanyDriver[]),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['company', 'trips', filters],
    queryFn: () =>
      companiesApi
        .getTrips({
          status: filters.status || undefined,
          driverId: filters.driverId || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          limit: 50,
        })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const trips: CompanyTrip[] = data?.trips ?? [];
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  const selectClass =
    'px-3 py-2 rounded-lg border border-ink-200 bg-surface-raised text-[13px] text-ink-800 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none';

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <p className="eyebrow">Operación</p>
          <h1 className="mt-2 font-display text-[38px] leading-[1.05]">
            Viajes de la <span className="font-semibold text-primary-700">flota</span>
          </h1>
        </div>

        {/* Filters */}
        <div className="card p-4 flex flex-wrap items-end gap-3">
          <Field label="Estado">
            <select
              value={filters.status}
              onChange={(e) => set({ status: e.target.value as '' | TripStatus })}
              className={selectClass}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Conductor">
            <select
              value={filters.driverId}
              onChange={(e) => set({ driverId: e.target.value })}
              className={selectClass}
            >
              <option value="">Todos</option>
              {(drivers ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.firstName} {d.lastName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Desde">
            <input
              type="date"
              value={filters.from}
              onChange={(e) => set({ from: e.target.value })}
              className={selectClass}
            />
          </Field>
          <Field label="Hasta">
            <input
              type="date"
              value={filters.to}
              onChange={(e) => set({ to: e.target.value })}
              className={selectClass}
            />
          </Field>
          {(filters.status || filters.driverId || filters.from || filters.to) && (
            <button
              onClick={() => setFilters({ status: '', driverId: '', from: '', to: '' })}
              className="px-3 py-2 text-[12.5px] text-ink-500 hover:text-primary-700 transition"
            >
              Limpiar
            </button>
          )}
        </div>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200/70">
            <h2 className="font-display text-[20px] flex items-center gap-2">
              <Truck size={18} className="text-primary-600" /> Viajes
            </h2>
            <span className="text-[12px] uppercase tracking-[0.16em] text-ink-500">
              {data?.total ?? 0}
              {isFetching && !isLoading ? ' · actualizando…' : ''}
            </span>
          </div>

          {isLoading ? (
            <div className="p-16 text-center text-ink-400 text-sm">Cargando…</div>
          ) : trips.length === 0 ? (
            <EmptyState text="No hay viajes que coincidan con los filtros." />
          ) : (
            <div>
              {trips.map((trip, i) => (
                <div
                  key={trip.id}
                  className={`flex items-center justify-between gap-4 px-5 py-4 ${i !== 0 ? 'border-t border-ink-200/60' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900 truncate">{trip.load?.title}</p>
                    <p className="text-[12.5px] text-ink-500 truncate mt-0.5">
                      {trip.load?.originAddress} <span className="text-ink-400">→</span>{' '}
                      {trip.load?.destAddress}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-[12px] text-ink-500">
                      <span className="text-ink-700">
                        {trip.carrier?.firstName} {trip.carrier?.lastName}
                      </span>
                      {trip.load?.price != null && (
                        <span className="font-mono text-primary-700">
                          {formatCurrency(trip.load.price)}
                        </span>
                      )}
                      <span>{formatDate(trip.createdAt)}</span>
                    </div>
                  </div>
                  <StatusBadge status={trip.status} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="eyebrow">{label}</span>
      {children}
    </label>
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
