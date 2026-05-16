'use client';

import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { usersApi, loadsApi, tripsApi } from '@/lib/api';
import { Users, Package, Truck, Activity, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const ROLE_BADGE: Record<string, { label: string; tone: string }> = {
  CARGO_GENERATOR: { label: 'Generador',     tone: 'text-info-700 ring-info-600/20 bg-info-50' },
  TRANSPORTER:     { label: 'Transportista', tone: 'text-primary-700 ring-primary-600/20 bg-primary-50' },
  ADMIN:           { label: 'Admin',         tone: 'text-ink-800 ring-ink-300 bg-ink-100' },
};

export default function AdminDashboard() {
  const { data: usersData } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => usersApi.getAll({ limit: 100 }).then((r) => r.data),
  });

  const { data: loadsData } = useQuery({
    queryKey: ['admin-loads'],
    queryFn: () => loadsApi.getAll({ limit: 100 }).then((r) => r.data),
  });

  const { data: tripsData } = useQuery({
    queryKey: ['admin-trips'],
    queryFn: () => tripsApi.getAll({ limit: 100 }).then((r) => r.data),
  });

  const users = usersData?.users || [];
  const loads = loadsData?.loads || [];
  const trips = tripsData?.trips || [];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <p className="eyebrow">Vista de administrador</p>
          <h1 className="mt-2 font-display text-[38px] leading-[1.05]">
            Pulso de la <span className="font-semibold text-primary-700">plataforma</span>
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Usuarios" value={usersData?.total || 0} icon={Users} tone="info" />
          <StatCard label="Cargas" value={loadsData?.total || 0} icon={Package} tone="ink" />
          <StatCard label="Viajes" value={tripsData?.total || 0} icon={Truck} tone="primary" />
          <StatCard label="Viajes activos" value={trips.filter((t: any) => t.status === 'IN_PROGRESS').length} icon={Activity} tone="success" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  <div key={user.id} className={`flex items-center justify-between px-5 py-3.5 ${i !== 0 ? 'border-t border-ink-200/60' : ''}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-ink-100 text-ink-700 flex items-center justify-center text-[12px] font-mono shrink-0">
                        {(user.firstName?.[0] ?? '?').toUpperCase()}{(user.lastName?.[0] ?? '').toUpperCase()}
                      </div>
                      <div className="min-w-0">
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
                      className={`flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-surface-sunk/60 ${i !== 0 ? 'border-t border-ink-200/60' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink-900 truncate">{load.title}</p>
                    <p className="text-[12px] text-ink-500 truncate">{load.shipper?.firstName} {load.shipper?.lastName}</p>
                  </div>
                  <StatusBadge status={load.status} />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
