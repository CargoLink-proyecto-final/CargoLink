'use client';

import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { tripsApi, loadsApi, postulationsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Truck, Package, Clock, CheckCircle, ArrowRight, Inbox, Hand } from 'lucide-react';
import Link from 'next/link';
import type { PostulationWithLoad } from '@/types';

export default function CarrierDashboard() {
  const { data: tripsData, isLoading: tripsLoading } = useQuery({
    queryKey: ['my-trips'],
    queryFn: () => tripsApi.getMy().then((r) => r.data),
  });

  const { data: loadsData } = useQuery({
    queryKey: ['available-loads'],
    queryFn: () => loadsApi.getAvailable({ limit: 5 }).then((r) => r.data),
  });

  const { data: postulationsData } = useQuery({
    queryKey: ['my-postulations'],
    queryFn: () =>
      postulationsApi.getMy().then((r) => r.data as PostulationWithLoad[]),
  });

  const trips = tripsData?.trips || [];
  const availableLoads = loadsData?.loads || [];
  const myPostulations = postulationsData ?? [];

  const stats = {
    total: trips.length,
    active: trips.filter((t: any) => t.status === 'IN_PROGRESS').length,
    accepted: trips.filter((t: any) => t.status === 'ACCEPTED').length,
    completed: trips.filter((t: any) => t.status === 'COMPLETED').length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <p className="eyebrow">Panel del transportista</p>
          <h1 className="mt-2 font-display text-[38px] leading-[1.05]">
            Tus <span className="font-semibold text-primary-700">viajes</span> y oportunidades
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total de viajes" value={stats.total} icon={Truck} tone="ink" />
          <StatCard label="En camino" value={stats.active} icon={Clock} tone="primary" />
          <StatCard label="Aceptados" value={stats.accepted} icon={Package} tone="warning" />
          <StatCard label="Completados" value={stats.completed} icon={CheckCircle} tone="success" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200/70">
              <div>
                <p className="eyebrow">Para tomar</p>
                <h2 className="font-display text-[20px] mt-1">Cargas disponibles</h2>
              </div>
              <Link href="/loads" className="text-[12px] uppercase tracking-[0.16em] text-ink-500 hover:text-primary-700 inline-flex items-center gap-1">
                Ver todas <ArrowRight size={12} />
              </Link>
            </div>
            {availableLoads.length === 0 ? (
              <EmptyState text="Sin cargas disponibles ahora mismo." />
            ) : (
              <div>
                {availableLoads.map((load: any, i: number) => (
                  <Link
                    key={load.id}
                    href={`/loads/${load.id}`}
                    className={`block px-5 py-4 transition hover:bg-surface-sunk/60 ${i !== 0 ? 'border-t border-ink-200/60' : ''}`}
                  >
                    <p className="font-medium text-ink-900 truncate">{load.title}</p>
                    <p className="text-[12.5px] text-ink-500 truncate mt-0.5">
                      {load.originAddress} <span className="text-ink-400">→</span> {load.destAddress}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="font-mono text-[13px] text-primary-700 tabular-nums">{formatCurrency(load.price)}</span>
                      <span className="font-mono text-[11px] text-ink-500">{load.weight} kg</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200/70">
              <div>
                <p className="eyebrow">Tu agenda</p>
                <h2 className="font-display text-[20px] mt-1">Mis viajes activos</h2>
              </div>
              <Link href="/tracking" className="text-[12px] uppercase tracking-[0.16em] text-ink-500 hover:text-primary-700 inline-flex items-center gap-1">
                Seguimiento <ArrowRight size={12} />
              </Link>
            </div>
            {tripsLoading ? (
              <div className="p-16 text-center text-ink-400 text-sm">Cargando…</div>
            ) : trips.length === 0 ? (
              <EmptyState text="Sin viajes aún. Postulate a una carga para empezar." />
            ) : (
              <div>
                {trips.slice(0, 5).map((trip: any, i: number) => (
                  <Link
                    key={trip.id}
                    href={`/trips/${trip.id}`}
                    className={`flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-surface-sunk/60 ${i !== 0 ? 'border-t border-ink-200/60' : ''}`}
                  >
                    <p className="font-medium text-ink-900 truncate min-w-0 flex-1">{trip.load?.title}</p>
                    <StatusBadge status={trip.status} />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200/70">
            <div>
              <p className="eyebrow">Tus postulaciones</p>
              <h2 className="font-display text-[20px] mt-1 flex items-center gap-2">
                <Hand size={18} className="text-primary-600" /> Mis postulaciones
              </h2>
            </div>
            <span className="text-[12px] uppercase tracking-[0.16em] text-ink-500">
              {myPostulations.length}
            </span>
          </div>
          {myPostulations.length === 0 ? (
            <EmptyState text="No te postulaste a ninguna carga todavía." />
          ) : (
            <div>
              {myPostulations.slice(0, 6).map((p, i) => (
                <Link
                  key={p.id}
                  href={
                    p.status === 'ACCEPTED' && p.load.trip?.id
                      ? `/trips/${p.load.trip.id}`
                      : `/loads/${p.loadId}`
                  }
                  className={`flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-surface-sunk/60 ${i !== 0 ? 'border-t border-ink-200/60' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900 truncate">{p.load.title}</p>
                    <p className="text-[12.5px] text-ink-500 truncate mt-0.5">
                      {p.load.originAddress} <span className="text-ink-400">→</span> {p.load.destAddress}
                    </p>
                    {p.proposedPrice != null && (
                      <p className="text-[12px] text-ink-500 mt-0.5">
                        Propusiste{' '}
                        <span className="font-mono text-primary-700">
                          {formatCurrency(p.proposedPrice)}
                        </span>
                      </p>
                    )}
                  </div>
                  <StatusBadge status={p.status} />
                </Link>
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
