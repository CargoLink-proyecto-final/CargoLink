'use client';

import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { loadsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Package, TrendingUp, Clock, CheckCircle, Plus, ArrowRight, Inbox, Hand } from 'lucide-react';
import Link from 'next/link';

export default function ShipperDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-loads'],
    queryFn: () => loadsApi.getMy().then((r) => r.data),
  });

  const loads = data?.loads || [];
  const stats = {
    total: loads.length,
    published: loads.filter((l: any) => l.status === 'PUBLISHED').length,
    inTransit: loads.filter((l: any) => l.status === 'IN_TRANSIT').length,
    delivered: loads.filter((l: any) => l.status === 'DELIVERED').length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="eyebrow">Panel del generador</p>
            <h1 className="mt-2 font-display text-[38px] leading-[1.05]">
              Tu <span className="font-semibold text-primary-700">operación</span> de hoy
            </h1>
          </div>
          <Link
            href="/loads/new"
            className="inline-flex items-center gap-2 bg-ink-900 hover:bg-ink-800 text-surface-raised px-4 py-2.5 rounded-lg text-[13.5px] font-medium transition shadow-card"
          >
            <Plus size={15} /> Nueva carga
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total publicadas" value={stats.total} icon={Package} tone="ink" />
          <StatCard label="Esperando transportista" value={stats.published} icon={TrendingUp} tone="info" />
          <StatCard label="En tránsito" value={stats.inTransit} icon={Clock} tone="primary" />
          <StatCard label="Entregadas" value={stats.delivered} icon={CheckCircle} tone="success" />
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
                    <span className="font-mono text-[13px] tabular-nums text-ink-700">{formatCurrency(load.price)}</span>
                    <StatusBadge status={load.status} />
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
      <p className="mt-1 text-[13px] text-ink-500">Creá tu primera carga para que los transportistas la vean.</p>
      <Link
        href="/loads/new"
        className="inline-flex items-center gap-2 mt-5 bg-primary-600 hover:bg-primary-700 text-surface-raised px-4 py-2 rounded-lg text-[13px] transition"
      >
        <Plus size={14} /> Crear primera carga
      </Link>
    </div>
  );
}
