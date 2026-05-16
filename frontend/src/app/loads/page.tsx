'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { loadsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { formatDate, getStatusColor } from '@/lib/utils';
import Link from 'next/link';
import { Search, Filter, X, Calendar, ChevronDown } from 'lucide-react';
import { LoadStatus } from '@/types';

interface DateRange {
  from: string;
  to: string;
}

const EMPTY_RANGE: DateRange = { from: '', to: '' };

export default function LoadsPage() {
  const user = useAuthStore((s) => s.user);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [cargoType, setCargoType] = useState('');
  const [createdRange, setCreatedRange] = useState<DateRange>(EMPTY_RANGE);
  const [pickupRange, setPickupRange] = useState<DateRange>(EMPTY_RANGE);
  const [deliveryRange, setDeliveryRange] = useState<DateRange>(EMPTY_RANGE);
  const [datesOpen, setDatesOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: [
      'loads', statusFilter, cargoType, page,
      createdRange.from, createdRange.to,
      pickupRange.from, pickupRange.to,
      deliveryRange.from, deliveryRange.to,
    ],
    queryFn: () => {
      const params: any = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (cargoType) params.cargoType = cargoType;
      if (createdRange.from) params.createdFrom = createdRange.from;
      if (createdRange.to) params.createdTo = createdRange.to;
      if (pickupRange.from) params.pickupFrom = pickupRange.from;
      if (pickupRange.to) params.pickupTo = pickupRange.to;
      if (deliveryRange.from) params.deliveryFrom = deliveryRange.from;
      if (deliveryRange.to) params.deliveryTo = deliveryRange.to;
      if (user?.role === 'CARGO_GENERATOR') {
        return loadsApi.getMy(params).then((r) => r.data);
      }
      if (user?.role === 'TRANSPORTER') {
        return loadsApi.getAvailable(params).then((r) => r.data);
      }
      return loadsApi.getAll(params).then((r) => r.data);
    },
  });

  const loads = (data?.loads || []).filter((l: any) =>
    !search || l.title.toLowerCase().includes(search.toLowerCase()) ||
    l.originAddress.toLowerCase().includes(search.toLowerCase()) ||
    l.destAddress.toLowerCase().includes(search.toLowerCase())
  );

  const statuses: LoadStatus[] = ['PUBLISHED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];

  const updateRange = (
    setter: (r: DateRange) => void,
    key: 'from' | 'to',
    value: string,
    current: DateRange,
  ) => {
    setter({ ...current, [key]: value });
    setPage(1);
  };

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            {user?.role === 'CARGO_GENERATOR' ? 'Mis Cargas' : user?.role === 'TRANSPORTER' ? 'Cargas Disponibles' : 'Todas las Cargas'}
          </h1>
          {user?.role === 'CARGO_GENERATOR' && (
            <Link
              href="/loads/new"
              className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              + Nueva Carga
            </Link>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cargas..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-gray-400" />
              <input
                value={cargoType}
                onChange={(e) => { setCargoType(e.target.value); setPage(1); }}
                placeholder="Tipo de carga..."
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            {user?.role !== 'TRANSPORTER' && (
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  <option value="">Todos los Estados</option>
                  {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100">
            <button
              type="button"
              onClick={() => setDatesOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition rounded-xl"
              aria-expanded={datesOpen}
            >
              <span className="flex items-center gap-2">
                <Calendar size={16} className="text-gray-400" />
                Filtros por fecha
                {clearDates && (
                  <span className="text-[11px] font-semibold bg-primary-50 text-primary-700 rounded-full px-2 py-0.5">
                    {activeDateCount}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2">
                {clearDates && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); resetDates(); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        resetDates();
                      }
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 cursor-pointer"
                  >
                    <X size={12} /> Limpiar
                  </span>
                )}
                <ChevronDown
                  size={16}
                  className={`text-gray-400 transition-transform ${datesOpen ? 'rotate-180' : ''}`}
                />
              </span>
            </button>
            {datesOpen && (
              <div className="border-t border-gray-100 px-3 py-3 flex flex-col lg:flex-row gap-3 lg:items-end lg:flex-wrap">
                <DateRangeField
                  label="Creación"
                  range={createdRange}
                  onChange={(key, value) => updateRange(setCreatedRange, key, value, createdRange)}
                />
                <DateRangeField
                  label="Recogida"
                  range={pickupRange}
                  onChange={(key, value) => updateRange(setPickupRange, key, value, pickupRange)}
                />
                <DateRangeField
                  label="Entrega"
                  range={deliveryRange}
                  onChange={(key, value) => updateRange(setDeliveryRange, key, value, deliveryRange)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-gray-400">Cargando...</div>
          ) : loads.length === 0 ? (
            <div className="p-10 text-center text-gray-400">No se encontraron cargas</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-left">
                    <tr>
                      <th className="px-4 py-3 font-medium">Titulo</th>
                      <th className="px-4 py-3 font-medium">Origen</th>
                      <th className="px-4 py-3 font-medium">Destino</th>
                      <th className="px-4 py-3 font-medium">Creación</th>
                      <th className="px-4 py-3 font-medium">Recogida</th>
                      <th className="px-4 py-3 font-medium">Entrega</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {loads.map((load: any) => (
                      <tr key={load.id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3">
                          <Link href={`/loads/${load.id}`} className="font-medium text-primary-600 hover:underline">
                            {load.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{load.originAddress}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{load.destAddress}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(load.createdAt)}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(load.pickupDate)}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {load.deliveryDate ? formatDate(load.deliveryDate) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(load.status)}`}>
                            {load.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {data?.totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-gray-100">
                  <span className="text-sm text-gray-500">
                    Pagina {data.page} de {data.totalPages} ({data.total} en total)
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page >= data.totalPages}
                      className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50"
                    >
                      Siguiente
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

interface DateRangeFieldProps {
  label: string;
  range: DateRange;
  onChange: (key: 'from' | 'to', value: string) => void;
}

function DateRangeField({ label, range, onChange }: DateRangeFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={range.from}
          onChange={(e) => onChange('from', e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
        />
        <span className="text-xs text-gray-400">→</span>
        <input
          type="date"
          value={range.to}
          onChange={(e) => onChange('to', e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
    </div>
  );
}
