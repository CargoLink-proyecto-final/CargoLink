'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import ChartCard from '@/components/charts/ChartCard';
import MonthlyTrendChart from '@/components/charts/MonthlyTrendChart';
import RankingBars from '@/components/charts/RankingBars';
import { companiesApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Users, UserCheck, Truck, CheckCircle, ArrowRight, Inbox, Check, X, Wallet, Coins, Route, Gauge, Timer, Activity } from 'lucide-react';
import type { CompanyOverview, CompanyJoinRequest, CompanyTrip, CompanyMetrics } from '@/types';

const percent = (rate: number | null | undefined) =>
  rate == null ? '—' : `${Math.round(rate * 100)}%`;

export default function CompanyAdminDashboard() {
  const queryClient = useQueryClient();

  const { data: company } = useQuery({
    queryKey: ['company', 'me'],
    queryFn: () => companiesApi.getMyCompany().then((r) => r.data as CompanyOverview),
  });

  const { data: tripsData } = useQuery({
    queryKey: ['company', 'trips', { limit: 100 }],
    queryFn: () => companiesApi.getTrips({ limit: 100 }).then((r) => r.data),
  });

  const { data: metrics } = useQuery({
    queryKey: ['company', 'metrics'],
    queryFn: () =>
      companiesApi.getMyCompanyMetrics().then((r) => r.data as CompanyMetrics),
  });

  const { data: pending } = useQuery({
    queryKey: ['company', 'requests', 'PENDING'],
    queryFn: () =>
      companiesApi
        .getRequests({ status: 'PENDING' })
        .then((r) => r.data as CompanyJoinRequest[]),
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVE' | 'REJECT' }) =>
      companiesApi.decideRequest(id, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company'] });
    },
  });

  const trips: CompanyTrip[] = tripsData?.trips ?? [];
  const activeTrips = trips.filter(
    (t) => t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED',
  ).length;
  const completedTrips = trips.filter((t) => t.status === 'COMPLETED').length;
  const pendingRequests = pending ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <p className="eyebrow">Panel de empresa</p>
          <h1 className="mt-2 font-display text-[38px] leading-[1.05]">
            {company?.name ?? 'Tu'}{' '}
            <span className="font-semibold text-primary-700">flota</span>
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Conductores" value={company?.memberCount ?? 0} icon={Users} tone="ink" />
          <StatCard
            label="Solicitudes pendientes"
            value={company?.pendingRequests ?? 0}
            icon={UserCheck}
            tone="warning"
          />
          <StatCard label="Viajes activos" value={activeTrips} icon={Truck} tone="primary" />
          <StatCard label="Viajes completados" value={completedTrips} icon={CheckCircle} tone="success" />
        </div>

        {/* Facturación de la flota */}
        <section className="space-y-4">
          <p className="eyebrow">Facturación de la flota</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Facturación total"
              value={metrics ? formatCurrency(metrics.totalAmount) : '—'}
              icon={Wallet}
              tone="ink"
              hint="Sobre viajes completados de todos los conductores"
            />
            <StatCard
              label="Facturación del mes"
              value={metrics ? formatCurrency(metrics.amountThisMonth) : '—'}
              icon={Coins}
              tone="success"
            />
            <StatCard
              label="Promedio por viaje"
              value={metrics?.avgAmountPerTrip != null ? formatCurrency(metrics.avgAmountPerTrip) : '—'}
              icon={Truck}
              tone="info"
            />
            <StatCard
              label="Facturación por km"
              value={metrics?.amountPerKm != null ? formatCurrency(metrics.amountPerKm) : '—'}
              icon={Route}
              tone="primary"
            />
          </div>

          <ChartCard
            eyebrow="Últimos 12 meses"
            title="Facturación mensual"
            aside={
              metrics ? (
                <>
                  <p className="eyebrow">Utilización</p>
                  <p className="mt-1 font-mono text-[15px] tabular-nums text-ink-900">
                    {percent(metrics.utilizationRate)}
                  </p>
                  <p className="text-[11.5px] text-ink-500">
                    {metrics.activeDriverCount} de {metrics.driverCount} con viaje en curso
                  </p>
                </>
              ) : undefined
            }
          >
            <MonthlyTrendChart
              data={metrics?.monthly ?? []}
              tone="accent"
              valueLabel="Facturación"
              emptyMessage="Cuando la flota complete viajes vas a ver acá la facturación mes a mes."
            />
          </ChartCard>
        </section>

        {/* Operación de la flota */}
        <section className="space-y-4">
          <p className="eyebrow">Operación de la flota</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Consumo de flota"
              value={metrics?.avgKmPerLiter != null ? `${metrics.avgKmPerLiter} km/L` : '—'}
              icon={Gauge}
              tone="info"
              hint={metrics ? `${metrics.totalDistanceKm} km · ${metrics.totalFuelLiters} L` : undefined}
            />
            <StatCard
              label="Entregas a tiempo"
              value={percent(metrics?.onTimeRate)}
              icon={Timer}
              tone={metrics && metrics.lateDeliveries > 0 ? 'warning' : 'success'}
              hint={
                metrics
                  ? `${metrics.onTimeDeliveries} a tiempo · ${metrics.lateDeliveries} demoradas`
                  : undefined
              }
            />
            <StatCard
              label="Conductores activos"
              value={metrics?.activeDriverCount ?? '—'}
              icon={Activity}
              tone="primary"
              hint="Con un viaje en curso ahora mismo"
            />
            <StatCard
              label="Sin actividad"
              value={metrics?.idleDriverCount ?? '—'}
              icon={Users}
              tone={metrics && metrics.idleDriverCount > 0 ? 'warning' : 'ink'}
              hint="Sin viajes en curso ni entregas en 30 días"
            />
          </div>

          <ChartCard
            eyebrow="Quién factura más"
            title="Ranking de conductores"
            aside={<Users size={18} className="text-ink-400" />}
          >
            <RankingBars
              tone="success"
              items={(metrics?.driverRanking ?? []).map((d) => ({
                id: d.id,
                label: d.name,
                value: d.totalAmount,
                href: `/dashboard/company-admin/drivers/${d.id}`,
                hint: [
                  `${d.completedTrips} viaje${d.completedTrips === 1 ? '' : 's'}`,
                  d.avgKmPerLiter != null ? `${d.avgKmPerLiter} km/L` : null,
                  d.onTimeRate != null ? `${percent(d.onTimeRate)} a tiempo` : null,
                  d.idle ? 'sin actividad hace 30 días' : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
              }))}
              formatValue={formatCurrency}
              emptyMessage="Todavía no hay conductores con viajes en la empresa."
            />
          </ChartCard>
        </section>

        {/* Pending requests inbox */}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200/70">
            <div>
              <p className="eyebrow">Por aprobar</p>
              <h2 className="font-display text-[20px] mt-1">Solicitudes para unirse</h2>
            </div>
            <Link
              href="/dashboard/company-admin/requests"
              className="text-[12px] uppercase tracking-[0.16em] text-ink-500 hover:text-primary-700 inline-flex items-center gap-1"
            >
              Ver todas <ArrowRight size={12} />
            </Link>
          </div>
          {pendingRequests.length === 0 ? (
            <EmptyState text="No hay solicitudes pendientes." />
          ) : (
            <div>
              {pendingRequests.slice(0, 5).map((req, i) => (
                <div
                  key={req.id}
                  className={`flex items-center justify-between gap-3 px-5 py-4 ${i !== 0 ? 'border-t border-ink-200/60' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900 truncate">
                      {req.transporter?.firstName} {req.transporter?.lastName}
                    </p>
                    <p className="text-[12.5px] text-ink-500 truncate mt-0.5">
                      {req.transporter?.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => decide.mutate({ id: req.id, decision: 'APPROVE' })}
                      disabled={decide.isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium bg-success-600 text-white hover:bg-success-700 transition disabled:opacity-50"
                    >
                      <Check size={14} /> Aprobar
                    </button>
                    <button
                      onClick={() => decide.mutate({ id: req.id, decision: 'REJECT' })}
                      disabled={decide.isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium text-danger-700 ring-1 ring-danger-600/20 hover:bg-danger-600/5 transition disabled:opacity-50"
                    >
                      <X size={14} /> Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent company trips */}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200/70">
            <div>
              <p className="eyebrow">Actividad</p>
              <h2 className="font-display text-[20px] mt-1">Viajes recientes de la flota</h2>
            </div>
            <Link
              href="/dashboard/company-admin/trips"
              className="text-[12px] uppercase tracking-[0.16em] text-ink-500 hover:text-primary-700 inline-flex items-center gap-1"
            >
              Ver todos <ArrowRight size={12} />
            </Link>
          </div>
          {trips.length === 0 ? (
            <EmptyState text="La flota no tiene viajes aún." />
          ) : (
            <div>
              {trips.slice(0, 6).map((trip, i) => (
                <div
                  key={trip.id}
                  className={`flex items-center justify-between gap-3 px-5 py-4 ${i !== 0 ? 'border-t border-ink-200/60' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900 truncate">{trip.load?.title}</p>
                    <p className="text-[12.5px] text-ink-500 truncate mt-0.5">
                      {trip.carrier?.firstName} {trip.carrier?.lastName}
                    </p>
                  </div>
                  <StatusBadge status={trip.status} kind="solicitud" />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
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
