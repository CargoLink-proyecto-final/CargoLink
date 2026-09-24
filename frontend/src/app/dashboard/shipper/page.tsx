'use client';

import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import ChartCard from '@/components/charts/ChartCard';
import MonthlyTrendChart from '@/components/charts/MonthlyTrendChart';
import RankingBars from '@/components/charts/RankingBars';
import { loadsApi } from '@/lib/api';
import { formatCurrency, formatPrice } from '@/lib/utils';
import {
  Package, TrendingUp, Clock, CheckCircle, ArrowRight, Inbox, Hand,
  Wallet, Coins, Route, Timer, Target, Users, Boxes,
} from 'lucide-react';
import Link from 'next/link';
import type { ShipperMetrics } from '@/types';

const percent = (rate: number | null | undefined) =>
  rate == null ? '—' : `${Math.round(rate * 100)}%`;

export default function ShipperDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-loads'],
    queryFn: () => loadsApi.getMy().then((r) => r.data),
  });

  const { data: metrics } = useQuery({
    queryKey: ['my-load-metrics'],
    queryFn: () => loadsApi.getMetrics().then((r) => r.data as ShipperMetrics),
  });

  const loads = data?.loads || [];
  const stats = {
    total: loads.length,
    published: loads.filter((l: any) => l.status === 'PUBLISHED').length,
    inTransit: loads.filter((l: any) => l.status === 'IN_TRANSIT').length,
    delivered: loads.filter((l: any) => l.status === 'DELIVERED').length,
  };

  // Pagar por encima del precio publicado no es malo en sí mismo, pero es el
  // dato con el que el publicador calibra cómo precifica.
  const negotiation = metrics?.avgNegotiationDelta;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <p className="eyebrow">Panel del publicador</p>
          <h1 className="mt-2 font-display text-[38px] leading-[1.05]">
            Tu <span className="font-semibold text-primary-700">operación</span> de hoy
          </h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total publicadas" value={stats.total} icon={Package} tone="ink" />
          <StatCard label="Esperando transportista" value={stats.published} icon={TrendingUp} tone="info" />
          <StatCard label="En tránsito" value={stats.inTransit} icon={Clock} tone="primary" />
          <StatCard label="Entregadas" value={stats.delivered} icon={CheckCircle} tone="success" />
        </div>

        {/* Desempeño de las cargas */}
        <section className="space-y-4">
          <p className="eyebrow">Desempeño de tus cargas</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Tasa de asignación"
              value={percent(metrics?.assignmentRate)}
              icon={Target}
              tone="info"
              hint="Cargas que consiguieron transportista, sin contar canceladas"
            />
            <StatCard
              label="Hasta conseguir flete"
              value={metrics?.avgHoursToAssignment != null ? `${metrics.avgHoursToAssignment} h` : '—'}
              icon={Timer}
              tone="primary"
              hint="Promedio desde que publicás hasta que se asigna"
            />
            <StatCard
              label="Postulaciones por carga"
              value={metrics?.avgPostulationsPerLoad ?? '—'}
              icon={Hand}
              tone="ink"
              hint="Termómetro del interés que despiertan tus cargas"
            />
            <StatCard
              label="Entregas a tiempo"
              value={metrics?.onTimeDeliveries ?? '—'}
              icon={CheckCircle}
              tone={metrics && metrics.lateDeliveries > 0 ? 'warning' : 'success'}
              hint={
                metrics?.onTimeRate != null
                  ? `${percent(metrics.onTimeRate)} de las medibles · ${metrics.lateDeliveries} demorada${metrics.lateDeliveries === 1 ? '' : 's'}`
                  : 'Sin fechas comprometidas aún'
              }
            />
          </div>
        </section>

        {/* Dinero */}
        <section className="space-y-4">
          <p className="eyebrow">Gasto en fletes</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Gasto total"
              value={metrics ? formatCurrency(metrics.totalAmount) : '—'}
              icon={Wallet}
              tone="ink"
              hint="Sobre viajes completados"
            />
            <StatCard
              label="Gasto del mes"
              value={metrics ? formatCurrency(metrics.amountThisMonth) : '—'}
              icon={Coins}
              tone="primary"
            />
            <StatCard
              label="Costo promedio por viaje"
              value={metrics?.avgAmountPerTrip != null ? formatCurrency(metrics.avgAmountPerTrip) : '—'}
              icon={Package}
              tone="info"
            />
            <StatCard
              label="Costo por km"
              value={metrics?.amountPerKm != null ? formatCurrency(metrics.amountPerKm) : '—'}
              icon={Route}
              tone="success"
              hint="Lo único comparable entre rutas distintas"
            />
          </div>

          <ChartCard
            eyebrow="Últimos 12 meses"
            title="Gasto mensual en fletes"
            aside={
              negotiation != null ? (
                <>
                  <p className="eyebrow">Vs. precio publicado</p>
                  <p
                    className={
                      negotiation > 0
                        ? 'mt-1 font-mono text-[15px] tabular-nums text-danger-600'
                        : 'mt-1 font-mono text-[15px] tabular-nums text-success-600'
                    }
                  >
                    {negotiation > 0 ? '+' : ''}
                    {percent(negotiation)}
                  </p>
                  <p className="text-[11.5px] text-ink-500">
                    en {metrics?.negotiatedLoads} carga{metrics?.negotiatedLoads === 1 ? '' : 's'} con precio
                  </p>
                </>
              ) : undefined
            }
          >
            <MonthlyTrendChart
              data={metrics?.monthly ?? []}
              valueLabel="Gasto"
              emptyMessage="Todavía no cerraste viajes: cuando se completen vas a ver acá el gasto mes a mes."
            />
          </ChartCard>
        </section>

        {/* Rankings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard
            eyebrow="Con quién trabajás"
            title="Transportistas recurrentes"
            aside={<Users size={18} className="text-ink-400" />}
          >
            <RankingBars
              items={(metrics?.topCarriers ?? []).map((c) => ({
                id: c.id,
                label: c.name,
                value: c.totalSpend,
                hint: `${c.completedTrips} viaje${c.completedTrips === 1 ? '' : 's'}${
                  c.avgRating != null ? ` · ${c.avgRating.toFixed(1)} ★ que le diste` : ''
                }`,
              }))}
              formatValue={formatCurrency}
              emptyMessage="Sin viajes completados todavía."
            />
          </ChartCard>

          <ChartCard
            eyebrow="Dónde se va el presupuesto"
            title="Gasto por tipo de carga"
            aside={<Boxes size={18} className="text-ink-400" />}
          >
            <RankingBars
              tone="accent"
              items={(metrics?.spendByCargoType ?? []).map((c) => ({
                id: c.cargoType,
                label: c.cargoType,
                value: c.amount,
                hint: `${c.trips} viaje${c.trips === 1 ? '' : 's'}`,
              }))}
              formatValue={formatCurrency}
              emptyMessage="Sin viajes completados todavía."
            />
          </ChartCard>
        </div>

        {/* Recent loads */}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200/70">
            <div>
              <p className="eyebrow">Últimas 10</p>
              <h2 className="font-display text-[20px] mt-1">Cargas recientes</h2>
            </div>
            <Link href="/loads" className="text-[12px] uppercase tracking-[0.16em] text-ink-500 hover:text-primary-700 transition inline-flex items-center gap-1">
              Ver todas <ArrowRight size={12} />
            </Link>
          </div>
          {isLoading ? (
            <div className="p-16 text-center text-ink-400 text-sm">Cargando…</div>
          ) : loads.length === 0 ? (
            <EmptyShipper />
          ) : (
            <div>
              {loads.slice(0, 10).map((load: any, i: number) => (
                <Link
                  key={load.id}
                  href={`/loads/${load.id}`}
                  className={`group flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-surface-sunk/60 ${i !== 0 ? 'border-t border-ink-200/60' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink-900 group-hover:text-primary-700 transition truncate">{load.title}</p>
                    <p className="text-[12.5px] text-ink-500 truncate mt-0.5">
                      {load.originAddress} <span className="text-ink-400">→</span> {load.destAddress}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {load.pendingPostulationsCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-primary-700 bg-primary-100 px-2 py-0.5 rounded-full">
                        <Hand size={12} /> {load.pendingPostulationsCount} postulaci{load.pendingPostulationsCount === 1 ? 'ón' : 'ones'}
                      </span>
                    )}
                    <span className="font-mono text-[13px] tabular-nums text-ink-700">{formatPrice(load.price)}</span>
                    <StatusBadge status={load.status} kind="solicitud" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

function EmptyShipper() {
  return (
    <div className="px-10 py-16 text-center">
      <div className="inline-flex w-12 h-12 rounded-full bg-ink-100 items-center justify-center mb-4">
        <Inbox size={18} className="text-ink-400" />
      </div>
      <p className="font-display text-[20px] text-ink-800">Aún no publicaste cargas</p>
      {/* Publicar es una acción de "Mis Cargas": el panel solo señala el camino,
          no duplica el acceso al formulario. */}
      <p className="mt-1 text-[13px] text-ink-500">
        Publicá tu primera carga desde{' '}
        <Link href="/loads" className="text-primary-700 hover:underline">
          Mis Cargas
        </Link>{' '}
        para que los transportistas la vean.
      </p>
    </div>
  );
}
