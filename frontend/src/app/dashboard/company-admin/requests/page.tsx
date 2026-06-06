'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatusBadge from '@/components/ui/StatusBadge';
import { companiesApi } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import { UserCheck, Inbox, Check, X, Mail, Phone } from 'lucide-react';
import type { CompanyJoinRequest, JoinRequestStatus } from '@/types';

const TABS: { value: '' | JoinRequestStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'APPROVED', label: 'Aprobadas' },
  { value: 'REJECTED', label: 'Rechazadas' },
  { value: '', label: 'Todas' },
];

export default function CompanyRequestsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'' | JoinRequestStatus>('PENDING');

  const { data, isLoading } = useQuery({
    queryKey: ['company', 'requests', tab || 'ALL'],
    queryFn: () =>
      companiesApi
        .getRequests({ status: tab || undefined })
        .then((r) => r.data as CompanyJoinRequest[]),
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVE' | 'REJECT' }) =>
      companiesApi.decideRequest(id, decision),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company'] }),
  });

  const requests = data ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <p className="eyebrow">Altas</p>
          <h1 className="mt-2 font-display text-[38px] leading-[1.05]">
            Solicitudes de <span className="font-semibold text-primary-700">ingreso</span>
          </h1>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.value || 'ALL'}
              onClick={() => setTab(t.value)}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition',
                tab === t.value
                  ? 'bg-ink-900 text-surface-raised'
                  : 'text-ink-600 ring-1 ring-ink-200 hover:bg-ink-100',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200/70">
            <h2 className="font-display text-[20px] flex items-center gap-2">
              <UserCheck size={18} className="text-primary-600" /> Solicitudes
            </h2>
            <span className="text-[12px] uppercase tracking-[0.16em] text-ink-500">
              {requests.length}
            </span>
          </div>

          {isLoading ? (
            <div className="p-16 text-center text-ink-400 text-sm">Cargando…</div>
          ) : requests.length === 0 ? (
            <EmptyState text="No hay solicitudes en esta vista." />
          ) : (
            <div>
              {requests.map((req, i) => (
                <div
                  key={req.id}
                  className={`flex items-center gap-4 px-5 py-4 ${i !== 0 ? 'border-t border-ink-200/60' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900 truncate">
                      {req.transporter?.firstName} {req.transporter?.lastName}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-0.5 text-[12.5px] text-ink-500">
                      <span className="inline-flex items-center gap-1 truncate">
                        <Mail size={12} /> {req.transporter?.email}
                      </span>
                      {req.transporter?.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone size={12} /> {req.transporter.phone}
                        </span>
                      )}
                      <span>Solicitó {formatDate(req.createdAt)}</span>
                    </div>
                  </div>
                  {req.status === 'PENDING' ? (
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
                  ) : (
                    <StatusBadge status={req.status} size="md" />
                  )}
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
