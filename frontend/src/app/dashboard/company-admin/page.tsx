'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { companiesApi } from '@/lib/api';
import { Users, UserCheck, Truck, CheckCircle, ArrowRight, Inbox, Check, X } from 'lucide-react';
import type { CompanyOverview, CompanyJoinRequest, CompanyTrip } from '@/types';

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
