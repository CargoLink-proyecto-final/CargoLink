'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { tripsApi, ratingsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Truck, Package, Clock, CheckCircle, ArrowRight, Gauge, Fuel, Timer, AlertTriangle, Star, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import type { CarrierMetrics, Rating } from '@/types';

interface MyRatingSummary {
  ratings: Rating[];
  averageScore: number;
  totalRatings: number;
}

export default function CarrierDashboard() {
  const { data: tripsData, isLoading: tripsLoading } = useQuery({
    queryKey: ['my-trips'],
    queryFn: () => tripsApi.getMy().then((r) => r.data),
  });

  const { data: metrics } = useQuery({
    queryKey: ['my-trip-metrics'],
    queryFn: () => tripsApi.getMetrics().then((r) => r.data as CarrierMetrics),
  });

  const userId = useAuthStore((s) => s.user?.id);
  const [showPerformance, setShowPerformance] = useState(false);

  const { data: myRating } = useQuery({
    queryKey: ['my-rating', userId],
    queryFn: () =>
      ratingsApi.getUserRatings(userId as string).then((r) => r.data as MyRatingSummary),
    enabled: !!userId,
  });

  const trips = tripsData?.trips || [];

  const stats = {
    total: trips.length,
    active: trips.filter((t: any) => t.status === 'IN_PROGRESS').length,
    accepted: trips.filter((t: any) => t.status === 'ACCEPTED').length,
    completed: trips.filter((t: any) => t.status === 'COMPLETED').length,
  };

  // El viaje que más urge resolver: primero uno ya en marcha, si no el
  // próximo aceptado a arrancar. Es lo primero que un transportista necesita
  // encontrar al entrar al panel, así que va destacado arriba de todo.
  const activeTrips = trips
    .filter((t: any) => t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED')
    .sort((a: any, b: any) => {
      if (a.status === b.status) return 0;
      return a.status === 'IN_PROGRESS' ? -1 : 1;
    });
  const [activeTrip, ...otherActiveTrips] = activeTrips;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <p className="eyebrow">Panel del transportista</p>
          <h1 className="mt-2 font-display text-[38px] leading-[1.05]">
            Tus <span className="font-semibold text-primary-700">viajes</span> y oportunidades
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Total de viajes" value={stats.total} icon={Truck} tone="ink" />
          <StatCard label="En camino" value={stats.active} icon={Clock} tone="primary" />
          <StatCard label="Aceptados" value={stats.accepted} icon={Package} tone="warning" />
          <StatCard label="Completados" value={stats.completed} icon={CheckCircle} tone="success" />
          <StatCard
            label="Calificación"
            value={myRating?.totalRatings ? myRating.averageScore.toFixed(1) : '—'}
            icon={Star}
            tone="warning"
            hint={
              myRating?.totalRatings
                ? `${myRating.totalRatings} calificación${myRating.totalRatings === 1 ? '' : 'es'}`
                : 'Sin calificaciones aún'
            }
          />
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowPerformance((v) => !v)}
            aria-expanded={showPerformance}
            className="w-full flex items-center justify-between mb-3 group"
          >
            <p className="eyebrow">Rendimiento</p>
            <span className="flex items-center gap-1.5 text-[12px] uppercase tracking-[0.16em] text-ink-500 group-hover:text-primary-700">
              {showPerformance ? 'Ocultar' : 'Ver métricas'}
              <ChevronDown size={14} className={`transition-transform ${showPerformance ? 'rotate-180' : ''}`} />
            </span>
          </button>
          {showPerformance && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Consumo promedio"
                value={metrics?.avgKmPerLiter != null ? `${metrics.avgKmPerLiter} km/L` : '—'}
                icon={Gauge}
                tone="info"
                hint="Sobre viajes con litros cargados"
              />
              <StatCard
                label="Combustible del mes"
                value={metrics ? `${metrics.litersThisMonth} L` : '—'}
                icon={Fuel}
                tone="primary"
                hint={metrics ? `${metrics.kmThisMonth} km recorridos` : undefined}
              />
              <StatCard
                label="Entregas a tiempo"
                value={metrics?.onTimeDeliveries ?? '—'}
                icon={Timer}
                tone="success"
                hint={
                  metrics?.onTimeRate != null
                    ? `${Math.round(metrics.onTimeRate * 100)}% de las medibles`
                    : 'Sin fechas comprometidas aún'
                }
              />
              <StatCard
                label="Entregas demoradas"
                value={metrics?.lateDeliveries ?? '—'}
                icon={AlertTriangle}
                tone={metrics && metrics.lateDeliveries > 0 ? 'danger' : 'ink'}
                hint="Llegaron después de la fecha comprometida"
              />
            </div>
          )}
        </div>

        {!tripsLoading && (
          activeTrip ? (
            <section className="card overflow-hidden ring-1 ring-primary-600/15">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 py-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="eyebrow text-primary-700">Tu viaje activo</p>
                    <StatusBadge status={activeTrip.status} kind="solicitud" />
                  </div>
                  <h2 className="font-display text-[22px] leading-tight truncate">
                    {activeTrip.load?.title || 'Viaje'}
                  </h2>
                  <p className="text-[13px] text-ink-500 mt-1 truncate">
                    {activeTrip.load?.originAddress} <span className="text-ink-400">→</span> {activeTrip.load?.destAddress}
                  </p>
                </div>
                <Link
                  href={`/trips/${activeTrip.id}`}
                  className="shrink-0 inline-flex items-center gap-1.5 bg-primary-700 hover:bg-primary-800 text-white px-4 py-2.5 rounded-lg text-[13.5px] font-medium transition"
                >
                  {activeTrip.status === 'ACCEPTED' ? 'Iniciar viaje' : 'Ver seguimiento'}
                  <ArrowRight size={14} />
                </Link>
              </div>
              {otherActiveTrips.length > 0 && (
                <Link
                  href="/trips"
                  className="block px-6 py-2.5 border-t border-ink-200/60 bg-surface-sunk/40 text-[12px] text-ink-600 hover:text-primary-700 transition"
                >
                  +{otherActiveTrips.length} viaje{otherActiveTrips.length === 1 ? '' : 's'} más en curso — ver todos
                </Link>
              )}
            </section>
          ) : (
            <section className="card px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="eyebrow">Sin viajes activos</p>
                <p className="text-[13.5px] text-ink-600 mt-1">
                  Postulate a una carga disponible para arrancar un viaje.
                </p>
              </div>
              <Link
                href="/loads"
                className="shrink-0 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary-700 hover:underline"
              >
                Ver cargas disponibles <ArrowRight size={14} />
              </Link>
            </section>
          )
        )}

      </div>
    </DashboardLayout>
  );
}
