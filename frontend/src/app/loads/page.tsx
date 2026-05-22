'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatusBadge from '@/components/ui/StatusBadge';
import { loadsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { formatDate, getStatusLabel } from '@/lib/utils';
import Link from 'next/link';
import { Search, Filter, X, Calendar, ChevronDown, Plus, ArrowRight } from 'lucide-react';
import { LoadStatus } from '@/types';

interface DateRange { from: string; to: string }
const EMPTY_RANGE: DateRange = { from: '', to: '' };

const DATE_MIN = '2020-01-01';
const DATE_MAX = `${new Date().getFullYear() + 5}-12-31`;

const CARGO_TYPES = [
  'Electrónica y tecnología',
  'Alimentos y bebidas',
  'Materiales de construcción',
  'Muebles y artículos del hogar',
  'Ropa y textiles',
  'Maquinaria e industria',
  'Mercadería general',
  'Otro',
] as const;

const ROLE_TITLE: Record<string, { eyebrow: string; title: string; italic: string }> = {
  CARGO_GENERATOR: { eyebrow: 'Tu inventario',           title: 'Mis',     italic: 'cargas' },
  TRANSPORTER:     { eyebrow: 'Para tomar',              title: 'Cargas',  italic: 'disponibles' },
  ADMIN:           { eyebrow: 'Vista de administrador',  title: 'Todas las', italic: 'cargas' },
};

export default function LoadsPage() {
  const user = useAuthStore((s) => s.user);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cargoType, setCargoType] = useState('');
  const [createdRange, setCreatedRange] = useState<DateRange>(EMPTY_RANGE);
  const [pickupRange, setPickupRange] = useState<DateRange>(EMPTY_RANGE);
  const [deliveryRange, setDeliveryRange] = useState<DateRange>(EMPTY_RANGE);
  const [datesOpen, setDatesOpen] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: [
      'loads', statusFilter, cargoType, debouncedSearch, page,
      createdRange.from, createdRange.to,
      pickupRange.from, pickupRange.to,
      deliveryRange.from, deliveryRange.to,
    ],
    queryFn: () => {
      const params: any = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (cargoType) params.cargoType = cargoType;
      if (debouncedSearch) params.q = debouncedSearch;
      if (createdRange.from) params.createdFrom = createdRange.from;
      if (createdRange.to) params.createdTo = createdRange.to;
      if (pickupRange.from) params.pickupFrom = pickupRange.from;
      if (pickupRange.to) params.pickupTo = pickupRange.to;
      if (deliveryRange.from) params.deliveryFrom = deliveryRange.from;
      if (deliveryRange.to) params.deliveryTo = deliveryRange.to;
      if (user?.role === 'CARGO_GENERATOR') return loadsApi.getMy(params).then((r) => r.data);
      if (user?.role === 'TRANSPORTER')     return loadsApi.getAvailable(params).then((r) => r.data);
      return loadsApi.getAll(params).then((r) => r.data);
    },
  });

  const loads = data?.loads || [];

  const statuses: LoadStatus[] = ['PUBLISHED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];

  const updateRange = (
    setter: (r: DateRange) => void,
    key: 'from' | 'to', value: string, current: DateRange,
  ) => { setter({ ...current, [key]: value }); setPage(1); };

  const activeDateCount =
    [
      createdRange.from || createdRange.to,
      pickupRange.from || pickupRange.to,
      deliveryRange.from || deliveryRange.to,
    ].filter(Boolean).length;
  const clearDates = activeDateCount > 0;
  const resetDates = () => {
    setCreatedRange(EMPTY_RANGE);
    setPickupRange(EMPTY_RANGE);
    setDeliveryRange(EMPTY_RANGE);
    setPage(1);
  };

  const heading = ROLE_TITLE[user?.role ?? 'ADMIN'] ?? ROLE_TITLE.ADMIN;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="eyebrow">{heading.eyebrow}</p>
            <h1 className="mt-2 font-display text-[38px] leading-[1.05]">
              {heading.title}{' '}
              <span className="font-semibold text-primary-700">{heading.italic}</span>
            </h1>
          </div>
          {user?.role === 'CARGO_GENERATOR' && (
            <Link
              href="/loads/new"
              className="inline-flex items-center gap-2 bg-ink-900 hover:bg-ink-800 text-surface-raised px-4 py-2.5 rounded-lg text-[13.5px] font-medium transition shadow-card"
            >
              <Plus size={15} />
              Nueva carga
            </Link>
          )}
        </div>

        {/* Filter bar */}
        <div className="space-y-3">
          <div className="card p-3 flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por título, origen, destino…"
                className="w-full pl-9 pr-4 py-2 bg-transparent border border-ink-200 rounded-lg text-[14px] focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 outline-none transition"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={15} className="text-ink-400" />
              <select
                value={cargoType}
                onChange={(e) => { setCargoType(e.target.value); setPage(1); }}
                className="px-3 py-2 border border-ink-200 rounded-lg text-[13.5px] bg-surface-raised focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 outline-none transition"
              >
                <option value="">Todos los tipos</option>
                {CARGO_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {user?.role !== 'TRANSPORTER' && (
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 border border-ink-200 rounded-lg text-[13.5px] bg-surface-raised focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 outline-none transition"
              >
                <option value="">Todos los estados</option>
                {statuses.map((s) => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
              </select>
            )}
          </div>

          {/* Collapsible date filters */}
          <div className="card">
            <button
              type="button"
              onClick={() => setDatesOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px] text-ink-700 hover:bg-surface-sunk/60 transition rounded-card"
              aria-expanded={datesOpen}
            >
              <span className="flex items-center gap-2.5">
                <Calendar size={15} className="text-ink-400" />
                <span className="font-medium">Filtros por fecha</span>
                {clearDates && (
                  <span className="text-[10px] font-semibold bg-primary-50 text-primary-700 rounded-full px-2 py-0.5 tracking-wide uppercase">
                    {activeDateCount} activo{activeDateCount > 1 ? 's' : ''}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3">
                {clearDates && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); resetDates(); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault(); e.stopPropagation(); resetDates();
                      }
                    }}
                    className="text-[11px] uppercase tracking-wider text-ink-500 hover:text-ink-700 flex items-center gap-1 cursor-pointer"
                  >
                    <X size={12} /> Limpiar
                  </span>
                )}
                <ChevronDown size={16} className={`text-ink-400 transition-transform ${datesOpen ? 'rotate-180' : ''}`} />
              </span>
            </button>
            {datesOpen && (
              <div className="card-divider px-4 py-4 flex flex-col lg:flex-row gap-5 lg:items-end lg:flex-wrap">
                <DateRangeField label="Creación" range={createdRange}
                  onChange={(k, v) => updateRange(setCreatedRange, k, v, createdRange)} />
                <DateRangeField label="Recogida" range={pickupRange}
                  onChange={(k, v) => updateRange(setPickupRange, k, v, pickupRange)} />
                <DateRangeField label="Entrega" range={deliveryRange}
                  onChange={(k, v) => updateRange(setDeliveryRange, k, v, deliveryRange)} />
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center text-ink-400 text-sm">Cargando…</div>
          ) : loads.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px] tabular-nums">
                  <thead>
                    <tr className="text-left text-ink-500">
                      <Th>Título</Th>
                      <Th>Origen</Th>
                      <Th>Destino</Th>
                      <Th>Creación</Th>
                      <Th>Recogida</Th>
                      <Th>Entrega</Th>
                      <Th>Estado</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {loads.map((load: any, i: number) => (
                      <tr key={load.id} className={`group transition border-t border-ink-200/60 hover:bg-surface-sunk/60 ${i % 2 === 1 ? 'bg-surface-sunk/30' : ''}`}>
                        <td className="px-5 py-3.5">
                          <Link href={`/loads/${load.id}`}
                                className="font-medium text-ink-900 group-hover:text-primary-700 transition inline-flex items-center gap-1.5">
                            {load.title}
                            <ArrowRight size={13} className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition" />
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 text-ink-600 max-w-[220px] truncate">{load.originAddress}</td>
                        <td className="px-5 py-3.5 text-ink-600 max-w-[220px] truncate">{load.destAddress}</td>
                        <td className="px-5 py-3.5 font-mono text-[12px] text-ink-700 whitespace-nowrap">{formatDate(load.createdAt)}</td>
                        <td className="px-5 py-3.5 font-mono text-[12px] text-ink-700 whitespace-nowrap">{formatDate(load.pickupDate)}</td>
                        <td className="px-5 py-3.5 font-mono text-[12px] text-ink-700 whitespace-nowrap">
                          {load.deliveryDate ? formatDate(load.deliveryDate) : <span className="text-ink-300">—</span>}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={load.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {data?.totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-ink-200/60 bg-surface-sunk/40">
                  <span className="text-[12px] text-ink-500 font-mono">
                    Página {data.page} / {data.totalPages} · {data.total} en total
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
                      disabled={page >= data.totalPages}
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
        <Search size={18} className="text-ink-400" />
      </div>
      <p className="font-display text-[20px] text-ink-800">Sin cargas con esos filtros</p>
      <p className="mt-1 text-[13px] text-ink-500">Probá ampliando los criterios o limpiando los filtros activos.</p>
    </div>
  );
}

interface DateRangeFieldProps {
  label: string;
  range: DateRange;
  onChange: (key: 'from' | 'to', value: string) => void;
}

function DateRangeField({ label, range, onChange }: DateRangeFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium text-ink-500 uppercase tracking-[0.14em]">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={range.from}
          min={DATE_MIN}
          max={range.to || DATE_MAX}
          onChange={(e) => onChange('from', e.target.value)}
          className="px-2.5 py-1.5 border border-ink-200 rounded-md text-[12.5px] font-mono outline-none focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 transition"
        />
        <span className="text-ink-400 text-xs">→</span>
        <input
          type="date"
          value={range.to}
          min={range.from || DATE_MIN}
          max={DATE_MAX}
          onChange={(e) => onChange('to', e.target.value)}
          className="px-2.5 py-1.5 border border-ink-200 rounded-md text-[12.5px] font-mono outline-none focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 transition"
        />
      </div>
    </div>
  );
}
