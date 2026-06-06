'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatusBadge from '@/components/ui/StatusBadge';
import { companiesApi } from '@/lib/api';
import { Building2, Users, Inbox, LogOut, Check } from 'lucide-react';
import type { CompanyDirectoryItem, MyMembership } from '@/types';

export default function MyCompanyPage() {
  const queryClient = useQueryClient();

  const { data: membership, isLoading: membershipLoading } = useQuery({
    queryKey: ['my-membership'],
    queryFn: () => companiesApi.getMyMembership().then((r) => r.data as MyMembership),
  });

  const { data: directory } = useQuery({
    queryKey: ['companies-directory'],
    queryFn: () => companiesApi.list().then((r) => r.data as CompanyDirectoryItem[]),
    enabled: !membership?.company,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['my-membership'] });
    queryClient.invalidateQueries({ queryKey: ['companies-directory'] });
  };

  const join = useMutation({
    mutationFn: (companyId: string) => companiesApi.requestToJoin(companyId),
    onSuccess: invalidate,
  });
  const cancel = useMutation({
    mutationFn: (requestId: string) => companiesApi.cancelJoinRequest(requestId),
    onSuccess: invalidate,
  });
  const leave = useMutation({
    mutationFn: () => companiesApi.leave(),
    onSuccess: invalidate,
  });

  // Pending request per company, for directory row state.
  const pendingByCompany = new Map(
    (membership?.requests ?? [])
      .filter((r) => r.status === 'PENDING' && r.company)
      .map((r) => [r.company!.id, r.id]),
  );

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <p className="eyebrow">Tu empresa</p>
          <h1 className="mt-2 font-display text-[38px] leading-[1.05]">
            Trabajá con una <span className="font-semibold text-primary-700">flota</span>
          </h1>
          <p className="mt-2 text-[13px] text-ink-500 max-w-xl">
            Unirte a una empresa es opcional. Podés seguir operando de forma
            independiente, o pedir el ingreso a una flota para que su
            administrador gestione tus viajes.
          </p>
        </div>

        {membershipLoading ? (
          <div className="p-16 text-center text-ink-400 text-sm">Cargando…</div>
        ) : membership?.company ? (
          // ---- Member of a company ----
          <section className="card p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary-500/10 text-primary-700 flex items-center justify-center ring-1 ring-primary-500/20 shrink-0">
                <Building2 size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="eyebrow">Pertenecés a</p>
                <p className="font-display text-[24px] text-ink-900 mt-0.5">
                  {membership.company.name}
                </p>
              </div>
              <button
                onClick={() => {
                  if (confirm('¿Salir de esta empresa?')) leave.mutate();
                }}
                disabled={leave.isPending}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-medium text-danger-700 ring-1 ring-danger-600/20 hover:bg-danger-600/5 transition disabled:opacity-50"
              >
                <LogOut size={14} /> Salir
              </button>
            </div>
          </section>
        ) : (
          // ---- Not a member: directory to request joining ----
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200/70">
              <h2 className="font-display text-[20px] flex items-center gap-2">
                <Users size={18} className="text-primary-600" /> Empresas disponibles
              </h2>
            </div>
            {!directory ? (
              <div className="p-16 text-center text-ink-400 text-sm">Cargando…</div>
            ) : directory.length === 0 ? (
              <EmptyState text="No hay empresas registradas todavía." />
            ) : (
              <div>
                {directory.map((company, i) => {
                  const pendingId = pendingByCompany.get(company.id);
                  return (
                    <div
                      key={company.id}
                      className={`flex items-center gap-4 px-5 py-4 ${i !== 0 ? 'border-t border-ink-200/60' : ''}`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-ink-100 text-ink-600 flex items-center justify-center shrink-0">
                        <Building2 size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink-900 truncate">{company.name}</p>
                        <p className="text-[12.5px] text-ink-500 mt-0.5">
                          {company._count.members}{' '}
                          {company._count.members === 1 ? 'conductor' : 'conductores'}
                        </p>
                      </div>
                      {pendingId ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge status="PENDING" size="md" />
                          <button
                            onClick={() => cancel.mutate(pendingId)}
                            disabled={cancel.isPending}
                            className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium text-ink-500 ring-1 ring-ink-200 hover:bg-ink-100 transition disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => join.mutate(company.id)}
                          disabled={join.isPending}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-medium bg-primary-600 text-white hover:bg-primary-700 transition disabled:opacity-50 shrink-0"
                        >
                          <Check size={14} /> Solicitar ingreso
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Request history */}
        {membership && membership.requests.length > 0 && (
          <section className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-ink-200/70">
              <h2 className="font-display text-[18px]">Historial de solicitudes</h2>
            </div>
            <div>
              {membership.requests.map((req, i) => (
                <div
                  key={req.id}
                  className={`flex items-center justify-between gap-3 px-5 py-3.5 ${i !== 0 ? 'border-t border-ink-200/60' : ''}`}
                >
                  <p className="font-medium text-ink-800 truncate">{req.company?.name}</p>
                  <StatusBadge status={req.status} />
                </div>
              ))}
            </div>
          </section>
        )}
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
