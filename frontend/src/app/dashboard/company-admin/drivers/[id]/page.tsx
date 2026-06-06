'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatCard from '@/components/ui/StatCard';
import { companiesApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Truck, CheckCircle, Clock, Timer, Star, DollarSign, ArrowLeft } from 'lucide-react';
import type { DriverStats } from '@/types';

export default function DriverStatsPage() {
  const params = useParams();
  const driverId = params.id as string;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['company', 'driver-stats', driverId],
    queryFn: () =>
      companiesApi.getDriverStats(driverId).then((r) => r.data as DriverStats),
  });

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <Link
            href="/dashboard/company-admin/drivers"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-500 hover:text-primary-700 transition"
          >
            <ArrowLeft size={14} /> Conductores
          </Link>
          <p className="eyebrow mt-4">Rendimiento del conductor</p>
          <h1 className="mt-2 font-display text-[38px] leading-[1.05]">
            {data ? (
              <>
                {data.driver.firstName}{' '}
                <span className="font-semibold text-primary-700">{data.driver.lastName}</span>
              </>
            ) : (
              'Cargando…'
            )}
          </h1>
          {data && <p className="mt-1 text-[13px] text-ink-500">{data.driver.email}</p>}
        </div>

        {isLoading ? (
          <div className="p-16 text-center text-ink-400 text-sm">Cargando rendimiento…</div>
        ) : isError || !data ? (
          <div className="card p-8 text-center text-[13px] text-danger-700">
            No se pudo cargar el rendimiento de este conductor.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard label="Viajes totales" value={data.totalTrips} icon={Truck} tone="ink" />
              <StatCard label="Completados" value={data.completedTrips} icon={CheckCircle} tone="success" />
              <StatCard label="Activos" value={data.activeTrips} icon={Clock} tone="primary" />
              <StatCard
                label="Entregas a tiempo"
                value={
                  data.onTimeRate != null
                    ? `${Math.round(data.onTimeRate * 100)}%`
                    : '—'
                }
                icon={Timer}
                tone="info"
                hint={`${data.onTimeDeliveries} de ${data.completedTrips} a tiempo`}
              />
              <StatCard
                label="Calificación promedio"
                value={data.avgRating != null ? data.avgRating.toFixed(1) : '—'}
                icon={Star}
                tone="warning"
                hint={`${data.ratingsCount} calificaciones`}
              />
              <StatCard
                label="Ingresos generados"
                value={formatCurrency(data.totalRevenue)}
                icon={DollarSign}
                tone="success"
                hint="Viajes completados"
              />
            </div>

            <p className="text-[12px] text-ink-500">
              Métricas calculadas sobre los viajes del conductor. Las entregas a
              tiempo comparan la fecha de finalización contra la fecha de entrega
              comprometida de cada carga.
            </p>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
