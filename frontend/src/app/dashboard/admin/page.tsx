'use client';

import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import BarChart from '@/components/admin/BarChart';
import MetricList from '@/components/admin/MetricList';
import SystemStatusPill from '@/components/admin/SystemStatusPill';
import { adminMetricsApi, usersApi, loadsApi } from '@/lib/api';
import {
  formatCompactCurrency,
  formatHours,
  formatMonth,
  formatRatio,
} from '@/lib/adminMetrics';
import { cn, formatCurrency } from '@/lib/utils';
import type { PlatformMetrics } from '@/types/adminMetrics';
import {
  ArrowRight,
  Banknote,
  PackageCheck,
  Clock,
  FileClock,
  AlertTriangle,
  CalendarClock,
} from 'lucide-react';
import Link from 'next/link';

const ROLE_BADGE: Record<string, { label: string; tone: string }> = {
  CARGO_GENERATOR: { label: 'Publicador',    tone: 'text-info-700 ring-info-600/20 bg-info-50' },
  TRANSPORTER:     { label: 'Transportista', tone: 'text-primary-700 ring-primary-600/20 bg-primary-50' },
  ADMIN:           { label: 'Admin',         tone: 'text-ink-800 ring-ink-300 bg-ink-100' },
};

const ROLE_PLURAL: Record<string, string> = {
  CARGO_GENERATOR: 'publicadores',
  TRANSPORTER: 'transportistas',
  COMPANY_ADMIN: 'empresas',
};

const EXPIRY_LABEL = { LICENSE: 'Licencia', INSURANCE: 'Seguro', VTV: 'VTV' } as const;

/** Por debajo de esto la puntualidad se marca como advertencia. */
const ON_TIME_TARGET = 0.8;

export default function AdminDashboard() {
  const metricsQuery = useQuery({
    queryKey: ['admin-platform-metrics'],
    queryFn: () => adminMetricsApi.getPlatform().then((r) => r.data),
  });

  const { data: health } = useQuery({
    queryKey: ['admin-system-health'],
    queryFn: () => adminMetricsApi.getSystemHealth().then((r) => r.data),
    refetchInterval: 60_000,
  });

  const { data: usersData } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => usersApi.getAll({ limit: 8 }).then((r) => r.data),
  });

  const { data: loadsData } = useQuery({
    queryKey: ['admin-loads'],
    queryFn: () => loadsApi.getAll({ limit: 8 }).then((r) => r.data),
  });

  const m = metricsQuery.data;
  const users = usersData?.users || [];
  const loads = loadsData?.loads || [];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="eyebrow">Vista de administrador</p>
            <h1 className="mt-2 font-display text-[38px] leading-[1.05]">
              Pulso de la <span className="font-semibold text-primary-700">plataforma</span>
            </h1>
          </div>
          <Link
            href="/dashboard/admin/system"
            className="inline-flex items-center gap-2 text-[12px] text-ink-500 hover:text-primary-700 self-start sm:self-auto"
          >
            Sistema <SystemStatusPill state={health?.status ?? null} />
            <ArrowRight size={12} />
          </Link>
        </div>

        {metricsQuery.isError ? (
          <div className="card p-5 flex items-center gap-3 text-danger-700">
            <AlertTriangle size={18} />
            <p className="text-[14px]">No se pudieron cargar las métricas de la plataforma.</p>
          </div>
        ) : !m ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card h-[118px] animate-pulse bg-ink-100/60" />
            ))}
          </div>
        ) : (
          <PlatformSections m={m} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200/70">
              <div>
                <p className="eyebrow">Más recientes</p>
                <h2 className="font-display text-[20px] mt-1">Usuarios</h2>
              </div>
              <Link href="/users" className="text-[12px] uppercase tracking-[0.16em] text-ink-500 hover:text-primary-700 inline-flex items-center gap-1">
                Ver todos <ArrowRight size={12} />
              </Link>
            </div>
            <div>
              {users.slice(0, 8).map((user: any, i: number) => {
                const badge = ROLE_BADGE[user.role] ?? ROLE_BADGE.ADMIN;
                return (
                  <div key={user.id} className={`flex items-center justify-between px-4 sm:px-5 py-3.5 ${i !== 0 ? 'border-t border-ink-200/60' : ''}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-ink-100 text-ink-700 flex items-center justify-center text-[12px] font-mono shrink-0">
                        {(user.firstName?.[0] ?? '?').toUpperCase()}{(user.lastName?.[0] ?? '').toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink-900 truncate">{user.firstName} {user.lastName}</p>
                        <p className="font-mono text-[11.5px] text-ink-500 truncate">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn('text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full ring-1', badge.tone)}>
                        {badge.label}
                      </span>
                      <span
                        className={cn('w-2 h-2 rounded-full', user.isActive ? 'bg-success-600' : 'bg-danger-600')}
                        title={user.isActive ? 'Activo' : 'Inactivo'}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200/70">
              <div>
                <p className="eyebrow">Últimas 8</p>
                <h2 className="font-display text-[20px] mt-1">Cargas</h2>
              </div>
              <Link href="/loads" className="text-[12px] uppercase tracking-[0.16em] text-ink-500 hover:text-primary-700 inline-flex items-center gap-1">
                Ver todas <ArrowRight size={12} />
              </Link>
            </div>
            <div>
              {loads.slice(0, 8).map((load: any, i: number) => (
                <Link key={load.id} href={`/loads/${load.id}`}
                      className={`flex items-center justify-between gap-4 px-4 sm:px-5 py-3.5 transition hover:bg-surface-sunk/60 ${i !== 0 ? 'border-t border-ink-200/60' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink-900 truncate">{load.title}</p>
                    <p className="text-[12px] text-ink-500 truncate">{load.shipper?.firstName} {load.shipper?.lastName}</p>
                  </div>
                  <StatusBadge status={load.status} kind="solicitud" />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

interface SectionProps {
  m: PlatformMetrics;
}

function SectionHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="font-display text-[20px] mt-1">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function PlatformSections({ m }: SectionProps) {
  const activeUsers = m.users.activeLast30Days.shippers + m.users.activeLast30Days.transporters;
  const onTimeLow = m.trips.onTimeRate != null && m.trips.onTimeRate < ON_TIME_TARGET;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Movido este mes"
          value={formatCompactCurrency(m.trips.volumeThisMonth)}
          hint={`${m.trips.tripsCompletedThisMonth} viajes completados`}
          icon={Banknote}
          tone="primary"
        />
        <StatCard
          label="Cargas asignadas"
          value={formatRatio(m.marketplace.assignmentRate)}
          hint={`De ${m.marketplace.loadsPublished} publicadas en ${m.windowDays} días`}
          icon={PackageCheck}
          tone="info"
        />
        <StatCard
          label="Entregas a tiempo"
          value={formatRatio(m.trips.onTimeRate)}
          hint={onTimeLow ? `Debajo del objetivo de ${formatRatio(ON_TIME_TARGET)}` : `Últimos ${m.windowDays} días`}
          icon={Clock}
          tone={onTimeLow ? 'warning' : 'success'}
        />
        <Link href="/dashboard/admin/verifications" className="block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
          <StatCard
            label="Documentos por revisar"
            value={m.verification.pendingDocuments}
            hint={
              m.verification.stalePendingDocuments > 0
                ? `${m.verification.stalePendingDocuments} esperan hace más de 48 h`
                : 'Ninguno atrasado'
            }
            icon={FileClock}
            tone={m.verification.stalePendingDocuments > 0 ? 'warning' : 'ink'}
          />
        </Link>
      </div>

      <section className="card px-5 py-4" aria-label="Ahora mismo">
        <MetricList
          columns={4}
          items={[
            { label: 'Cargas esperando transportista', value: String(m.now.loadsOpen) },
            { label: 'Viajes en curso', value: String(m.now.tripsInProgress) },
            {
              label: 'Usuarios activos (30 días)',
              value: String(activeUsers),
              hint: `${m.users.activeLast30Days.shippers} publicadores · ${m.users.activeLast30Days.transporters} transportistas`,
            },
            {
              label: 'Calificación promedio',
              value: m.ratings.average != null ? `${m.ratings.average.toLocaleString('es-AR')} ★` : '—',
              hint: `${m.ratings.count} calificaciones`,
            },
          ]}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        <section className="card p-5">
          <SectionHeader eyebrow="Últimos 6 meses" title="Dinero movido" />
          <BarChart
            ariaLabel="Dinero pactado en viajes completados por mes"
            formatValue={formatCompactCurrency}
            points={m.trips.monthlyVolume.map((p) => ({
              label: formatMonth(p.month),
              value: p.amount,
              title: `${formatMonth(p.month, true)}: ${formatCurrency(p.amount)} en ${p.trips} viajes`,
            }))}
          />
          <div className="mt-5 pt-4 border-t border-ink-200/70">
            <MetricList
              items={[
                {
                  label: 'Precio promedio por km',
                  value: m.trips.avgPricePerKm != null ? formatCurrency(m.trips.avgPricePerKm) : '—',
                },
                { label: 'Duración promedio de viaje', value: formatHours(m.trips.avgTripHours) },
                {
                  label: 'Viajes cancelados',
                  value: formatRatio(m.trips.cancellationRate),
                  tone: (m.trips.cancellationRate ?? 0) > 0.15 ? 'warning' : 'default',
                },
              ]}
            />
          </div>
        </section>

        <section className="card p-5">
          <SectionHeader eyebrow={`Últimos ${m.windowDays} días`} title="Marketplace" />
          <MetricList
            items={[
              { label: 'Postulaciones por carga', value: m.marketplace.avgPostulationsPerLoad?.toLocaleString('es-AR') ?? '—' },
              {
                label: 'Hasta la 1ª postulación',
                value: formatHours(m.marketplace.medianHoursToFirstPostulation),
                hint: 'Mediana',
              },
              { label: 'Con contraoferta', value: formatRatio(m.marketplace.counterOfferRate) },
            ]}
          />
          <div className="mt-5 pt-4 border-t border-ink-200/70">
            <p className="text-[12.5px] font-medium text-ink-800 flex items-center gap-2">
              <AlertTriangle size={14} className={m.marketplace.unansweredLoads.length ? 'text-warning-600' : 'text-ink-400'} />
              Cargas sin postulantes hace más de 48 h
            </p>
            {m.marketplace.unansweredLoads.length === 0 ? (
              <p className="mt-2 text-[12.5px] text-ink-500">Ninguna: todas las cargas recibieron interés.</p>
            ) : (
              <ul className="mt-2 divide-y divide-ink-200/60">
                {m.marketplace.unansweredLoads.slice(0, 5).map((load) => (
                  <li key={load.id}>
                    <Link href={`/loads/${load.id}`} className="flex items-center justify-between gap-3 py-2 hover:text-primary-700">
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-medium text-ink-900 truncate">{load.title}</span>
                        <span className="block text-[11.5px] text-ink-500 truncate">{load.shipperName}</span>
                      </span>
                      <span className="text-[12px] tabular-nums text-warning-700 shrink-0">
                        {formatHours(load.hoursWaiting)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="card p-5">
          <SectionHeader eyebrow="Últimos 6 meses" title="Altas de usuarios" />
          <BarChart
            ariaLabel="Usuarios nuevos por mes"
            tone="info"
            formatValue={(v) => String(v)}
            points={m.users.monthlySignups.map((p) => ({
              label: formatMonth(p.month),
              value: p.total,
              title: `${formatMonth(p.month, true)}: ${p.total} altas (${Object.entries(p.byRole)
                .map(([role, n]) => `${n} ${ROLE_PLURAL[role] ?? role}`)
                .join(', ')})`,
            }))}
          />
          <div className="mt-5 pt-4 border-t border-ink-200/70">
            <MetricList
              items={[
                { label: 'Usuarios totales', value: String(m.users.total) },
                { label: 'Publicadores', value: String(m.users.byRole.CARGO_GENERATOR ?? 0) },
                { label: 'Transportistas', value: String(m.users.byRole.TRANSPORTER ?? 0) },
              ]}
            />
          </div>
        </section>

        <section className="card p-5">
          <SectionHeader
            eyebrow="Confianza"
            title="Verificación y vencimientos"
            action={
              <Link href="/dashboard/admin/verifications" className="text-[12px] uppercase tracking-[0.16em] text-ink-500 hover:text-primary-700 inline-flex items-center gap-1">
                Revisar <ArrowRight size={12} />
              </Link>
            }
          />
          <MetricList
            items={[
              { label: 'Tiempo promedio de revisión', value: formatHours(m.verification.avgReviewHours) },
              { label: 'Documentos rechazados', value: formatRatio(m.verification.rejectionRate) },
              {
                label: 'Pendiente más viejo',
                value: m.verification.oldestPendingAt
                  ? formatHours((Date.now() - new Date(m.verification.oldestPendingAt).getTime()) / 3_600_000)
                  : '—',
                tone: m.verification.stalePendingDocuments > 0 ? 'warning' : 'default',
              },
            ]}
          />
          <div className="mt-5 pt-4 border-t border-ink-200/70">
            <p className="text-[12.5px] font-medium text-ink-800 flex items-center gap-2">
              <CalendarClock size={14} className={m.expiryAlerts.length ? 'text-warning-600' : 'text-ink-400'} />
              Licencias, seguros y VTV vencidos o por vencer (30 días)
            </p>
            {m.expiryAlerts.length === 0 ? (
              <p className="mt-2 text-[12.5px] text-ink-500">Nada por vencer en los próximos 30 días.</p>
            ) : (
              <ul className="mt-2 divide-y divide-ink-200/60">
                {m.expiryAlerts.slice(0, 6).map((alert) => (
                  <li key={`${alert.userId}-${alert.kind}`}>
                    <Link
                      href={`/dashboard/admin/verifications/${alert.userId}`}
                      className="flex items-center justify-between gap-3 py-2 hover:text-primary-700"
                    >
                      <span className="min-w-0 text-[13.5px] text-ink-900 truncate">
                        {alert.userName} <span className="text-ink-500">· {EXPIRY_LABEL[alert.kind]}</span>
                      </span>
                      <span
                        className={cn(
                          'text-[12px] tabular-nums shrink-0',
                          alert.daysLeft < 0 ? 'text-danger-700 font-medium' : 'text-warning-700',
                        )}
                      >
                        {alert.daysLeft < 0
                          ? `Vencido hace ${Math.abs(alert.daysLeft)} d`
                          : alert.daysLeft === 0
                            ? 'Vence hoy'
                            : `Vence en ${alert.daysLeft} d`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
