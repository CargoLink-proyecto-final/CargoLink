'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatusBadge from '@/components/ui/StatusBadge';
import { loadsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { formatDate, getSolicitudStageLabel } from '@/lib/utils';
import Link from 'next/link';
import { Search, Filter, X, MapPin, Flag, ChevronDown, Plus, ArrowRight } from 'lucide-react';
import { LoadStatus } from '@/types';
import CityCombobox, { City } from '@/components/geo/CityCombobox';
import { geoApi } from '@/lib/api';
import { describeRequirements, requirementsOf } from '@/lib/vehicleRequirements';

interface DateRange { from: string; to: string }
const EMPTY_RANGE: DateRange = { from: '', to: '' };

// Cada tramo del viaje agrupa sus propios filtros (fecha + ciudad).
type Leg = 'pickup' | 'delivery';

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
  const [pickupRange, setPickupRange] = useState<DateRange>(EMPTY_RANGE);
  const [deliveryRange, setDeliveryRange] = useState<DateRange>(EMPTY_RANGE);
  // El filtro va por id de ciudad; el nombre se guarda solo para mostrarlo.
  const [pickupCity, setPickupCity] = useState<City | null>(null);
  const [deliveryCity, setDeliveryCity] = useState<City | null>(null);
  // Un solo panel de tramo abierto a la vez: abrir uno cierra el otro.
  const [openLeg, setOpenLeg] = useState<Leg | null>(null);
  const [page, setPage] = useState(1);
  // Solo transportista: oculta las cargas cuyos requisitos no cumple su vehículo.
  const [compatibleOnly, setCompatibleOnly] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // Ciudades realmente presentes en las cargas visibles, por tramo.
  const { data: filterCities } = useQuery<{ origin: City[]; dest: City[] }>({
    queryKey: ['loads', 'filter-cities'],
    queryFn: () => geoApi.getLoadFilterCities().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading } = useQuery({
    queryKey: [
      'loads', statusFilter, cargoType, debouncedSearch, page,
      pickupRange.from, pickupRange.to,
      deliveryRange.from, deliveryRange.to,
      pickupCity?.id, deliveryCity?.id, compatibleOnly,
    ],
    queryFn: () => {
      const params: any = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (cargoType) params.cargoType = cargoType;
      if (debouncedSearch) params.q = debouncedSearch;
      if (pickupRange.from) params.pickupFrom = pickupRange.from;
      if (pickupRange.to) params.pickupTo = pickupRange.to;
      if (deliveryRange.from) params.deliveryFrom = deliveryRange.from;
      if (deliveryRange.to) params.deliveryTo = deliveryRange.to;
      if (pickupCity) params.originCityId = pickupCity.id;
      if (deliveryCity) params.destCityId = deliveryCity.id;
      if (compatibleOnly) params.compatibleOnly = 'true';
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

  const countActive = (range: DateRange, city: City | null) =>
    [range.from || range.to, city].filter(Boolean).length;
  const pickupActive = countActive(pickupRange, pickupCity);
  const deliveryActive = countActive(deliveryRange, deliveryCity);

  const clearPickup = () => {
    setPickupRange(EMPTY_RANGE);
    setPickupCity(null);
    setPage(1);
  };
  const clearDelivery = () => {
    setDeliveryRange(EMPTY_RANGE);
    setDeliveryCity(null);
    setPage(1);
  };
  const selectCity = (setter: (city: City | null) => void) => (_: string, city?: City) => {
    setter(city ?? null);
    setPage(1);
  };
  const toggleLeg = (leg: Leg) => setOpenLeg((current) => (current === leg ? null : leg));

  const heading = ROLE_TITLE[user?.role ?? 'ADMIN'] ?? ROLE_TITLE.ADMIN;
  // El transportista ve una tabla más corta: la fecha de publicación no le
  // ayuda a decidir, y el estado sería siempre el mismo porque solo lista
  // cargas publicadas.
  const isCarrier = user?.role === 'TRANSPORTER';

  return (
    <DashboardLayout>
      {/* pb extra: deja aire para que el botón flotante no tape la paginación */}
      <div className="space-y-8 pb-24">
        {/* Header */}
        <div>
          <p className="eyebrow">{heading.eyebrow}</p>
          <h1 className="mt-2 font-display text-3xl sm:text-[38px] leading-[1.05]">
            {heading.title}{' '}
            <span className="font-semibold text-primary-700">{heading.italic}</span>
          </h1>
        </div>

        {/* Filter bar — búsqueda, categoría, estado y filtros por tramo en una sola card */}
        <div className="card">
          <div className="p-3 flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por título, origen, destino…"
                className="w-full pl-9 pr-4 py-2 bg-transparent border border-ink-200 rounded-lg text-[14px] focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 outline-none transition"
              />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex items-center gap-2">
                <Filter size={15} className="text-ink-400 shrink-0" />
                {/* El ancho de un select nativo lo fija su opción más larga; sin
                    tope, "Muebles y artículos del hogar" estira todo el control. */}
                <select
                  value={cargoType}
                  aria-label="Tipo de carga"
                  onChange={(e) => { setCargoType(e.target.value); setPage(1); }}
                  className="w-full sm:w-[150px] px-3 py-2 border border-ink-200 rounded-lg text-[13.5px] bg-surface-raised focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 outline-none transition"
                >
                  <option value="">Todos</option>
                  {CARGO_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {user?.role !== 'TRANSPORTER' && (
                <select
                  value={statusFilter}
                  aria-label="Estado"
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  className="w-full sm:w-[150px] px-3 py-2 border border-ink-200 rounded-lg text-[13.5px] bg-surface-raised focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 outline-none transition"
                >
                  <option value="">Todos</option>
                  {statuses.map((s) => <option key={s} value={s}>{getSolicitudStageLabel(s)}</option>)}
                </select>
              )}
              {user?.role === 'TRANSPORTER' && (
                <label className="flex items-center gap-2 text-[13px] text-ink-700 whitespace-nowrap px-1">
                  <input
                    type="checkbox"
                    checked={compatibleOnly}
                    onChange={(e) => { setCompatibleOnly(e.target.checked); setPage(1); }}
                  />
                  Solo compatibles con mi vehículo
                </label>
              )}
              {/* Un toggle por tramo: cada panel agrupa fecha + ciudad de ese tramo */}
              <LegToggle
                label="Recogida"
                icon={<MapPin size={15} />}
                open={openLeg === 'pickup'}
                activeCount={pickupActive}
                onClick={() => toggleLeg('pickup')}
              />
              <LegToggle
                label="Entrega"
                icon={<Flag size={15} />}
                open={openLeg === 'delivery'}
                activeCount={deliveryActive}
                onClick={() => toggleLeg('delivery')}
              />
            </div>
          </div>

          {openLeg === 'pickup' && (
            <LegFilters
              range={pickupRange}
              onRangeChange={(k, v) => updateRange(setPickupRange, k, v, pickupRange)}
              city={pickupCity}
              onCityChange={selectCity(setPickupCity)}
              cities={filterCities?.origin ?? []}
              activeCount={pickupActive}
              onClear={clearPickup}
            />
          )}
          {openLeg === 'delivery' && (
            <LegFilters
              range={deliveryRange}
              onRangeChange={(k, v) => updateRange(setDeliveryRange, k, v, deliveryRange)}
              city={deliveryCity}
              onCityChange={selectCity(setDeliveryCity)}
              cities={filterCities?.dest ?? []}
              activeCount={deliveryActive}
              onClear={clearDelivery}
            />
          )}
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
                      {!isCarrier && <Th>Creación</Th>}
                      <Th>Recogida</Th>
                      <Th>Entrega</Th>
                      {!isCarrier && <Th>Estado</Th>}
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
                          {describeRequirements(requirementsOf(load)).length > 0 && (
                            <p className="text-[11.5px] text-ink-500 mt-0.5">
                              Requiere: {describeRequirements(requirementsOf(load)).join(' · ')}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-ink-600 max-w-[120px] sm:max-w-[220px] truncate">{load.originAddress}</td>
                        <td className="px-5 py-3.5 text-ink-600 max-w-[120px] sm:max-w-[220px] truncate">{load.destAddress}</td>
                        {!isCarrier && (
                          <td className="px-5 py-3.5 font-mono text-[12px] text-ink-700 whitespace-nowrap">{formatDate(load.createdAt)}</td>
                        )}
                        <td className="px-5 py-3.5 font-mono text-[12px] text-ink-700 whitespace-nowrap">{formatDate(load.pickupDate)}</td>
                        <td className="px-5 py-3.5 font-mono text-[12px] text-ink-700 whitespace-nowrap">
                          {load.deliveryDate ? formatDate(load.deliveryDate) : <span className="text-ink-300">—</span>}
                        </td>
                        {!isCarrier && (
                          <td className="px-5 py-3.5">
                            <StatusBadge status={load.status} kind="solicitud" />
                          </td>
                        )}
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

      {/* Atajo a "Nueva carga" flotante: siempre alcanzable sin scrollear hasta
          el header. Solo para el dador de carga, que es quien publica.
          z-20 lo deja por debajo del backdrop del menú mobile (z-30). */}
      {user?.role === 'CARGO_GENERATOR' && (
        <Link
          href="/loads/new"
          className="fixed bottom-6 right-5 z-20 inline-flex items-center gap-2 bg-ink-900 hover:bg-ink-800 text-surface-raised pl-4 pr-5 py-3 rounded-full text-[13.5px] font-medium transition shadow-lg shadow-ink-900/25"
        >
          <Plus size={16} />
          Nueva carga
        </Link>
      )}
    </DashboardLayout>
  );
}

interface LegToggleProps {
  label: string;
  icon: React.ReactNode;
  open: boolean;
  activeCount: number;
  onClick: () => void;
}

// Mismo alto, radio y tipografía que los selects de la fila para que la barra
// se lea como un único grupo de controles.
function LegToggle({ label, icon, open, activeCount, onClick }: LegToggleProps) {
  const active = activeCount > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`w-full sm:w-auto shrink-0 inline-flex items-center justify-between sm:justify-start gap-2 px-3 py-2 rounded-lg border text-[13.5px] outline-none transition focus:ring-4 focus:ring-primary-600/15 ${
        active
          ? 'border-primary-600 bg-primary-50/60 text-primary-700'
          : 'border-ink-200 bg-surface-raised text-ink-700 hover:bg-surface-sunk/60'
      }`}
    >
      <span className="flex items-center gap-2">
        <span className={active ? 'text-primary-700' : 'text-ink-400'}>{icon}</span>
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        {active && (
          <span className="text-[10px] font-semibold bg-primary-600 text-white rounded-full min-w-[16px] h-4 px-1 inline-flex items-center justify-center tabular-nums">
            {activeCount}
          </span>
        )}
        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''} ${active ? 'text-primary-700' : 'text-ink-400'}`} />
      </span>
    </button>
  );
}

interface LegFiltersProps {
  range: DateRange;
  onRangeChange: (key: 'from' | 'to', value: string) => void;
  city: City | null;
  onCityChange: (value: string, city?: City) => void;
  cities: City[];
  activeCount: number;
  onClear: () => void;
}

function LegFilters({
  range, onRangeChange, city, onCityChange, cities, activeCount, onClear,
}: LegFiltersProps) {
  return (
    <div className="card-divider px-4 py-4 flex flex-col lg:flex-row gap-5 lg:items-end lg:flex-wrap">
      <DateRangeField label="Fecha" range={range} onChange={onRangeChange} />
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-medium text-ink-500 uppercase tracking-[0.14em]">Ciudad</span>
        <CityCombobox
          aria-label="Ciudad"
          value={city?.name ?? ''}
          selectedId={city?.id}
          onChange={onCityChange}
          cities={cities}
          placeholder={cities.length > 0 ? 'Todas' : 'Sin ciudades'}
          disabled={cities.length === 0}
          inputClassName="w-full lg:w-[240px] px-2.5 py-1.5 border border-ink-200 rounded-md text-[12.5px] outline-none focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 transition disabled:bg-surface-sunk/60 disabled:text-ink-400"
        />
      </div>
      {activeCount > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="self-start lg:self-end lg:ml-auto inline-flex items-center gap-1 px-2 py-1.5 -mx-2 rounded-md text-[11px] uppercase tracking-wider text-ink-500 hover:text-ink-700 hover:bg-surface-sunk/60 transition"
        >
          <X size={12} /> Limpiar
        </button>
      )}
    </div>
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
      <div className="flex flex-wrap items-center gap-1.5">
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
