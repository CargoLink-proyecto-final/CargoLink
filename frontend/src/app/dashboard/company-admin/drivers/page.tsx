'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { companiesApi } from '@/lib/api';
import { Users, ArrowRight, Inbox, UserMinus, Mail, Phone } from 'lucide-react';
import type { CompanyDriver } from '@/types';

export default function CompanyDriversPage() {
  const queryClient = useQueryClient();

  const { data: drivers, isLoading } = useQuery({
    queryKey: ['company', 'drivers'],
    queryFn: () => companiesApi.getDrivers().then((r) => r.data as CompanyDriver[]),
  });

  const remove = useMutation({
    mutationFn: (driverId: string) => companiesApi.removeDriver(driverId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company'] }),
  });

  const list = drivers ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <p className="eyebrow">Plantilla</p>
          <h1 className="mt-2 font-display text-[38px] leading-[1.05]">
            Tus <span className="font-semibold text-primary-700">conductores</span>
          </h1>
        </div>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200/70">
            <h2 className="font-display text-[20px] flex items-center gap-2">
              <Users size={18} className="text-primary-600" /> Conductores
            </h2>
            <span className="text-[12px] uppercase tracking-[0.16em] text-ink-500">
              {list.length}
            </span>
          </div>

          {isLoading ? (
            <div className="p-16 text-center text-ink-400 text-sm">Cargando…</div>
          ) : list.length === 0 ? (
            <EmptyState text="Todavía no tenés conductores. Aprobá solicitudes para sumar a tu flota." />
          ) : (
            <div>
              {list.map((driver, i) => (
                <div
                  key={driver.id}
                  className={`flex items-center gap-4 px-5 py-4 ${i !== 0 ? 'border-t border-ink-200/60' : ''}`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary-500/10 text-primary-700 flex items-center justify-center text-[13px] font-semibold font-mono ring-1 ring-primary-500/20 shrink-0">
                    {initials(driver)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900 truncate">
                      {driver.firstName} {driver.lastName}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-0.5 text-[12.5px] text-ink-500">
                      <span className="inline-flex items-center gap-1 truncate">
                        <Mail size={12} /> {driver.email}
                      </span>
                      {driver.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone size={12} /> {driver.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/dashboard/company-admin/drivers/${driver.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium text-primary-700 ring-1 ring-primary-600/20 hover:bg-primary-50 transition"
                    >
                      Rendimiento <ArrowRight size={13} />
                    </Link>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `¿Quitar a ${driver.firstName} ${driver.lastName} de la empresa?`,
                          )
                        ) {
                          remove.mutate(driver.id);
                        }
                      }}
                      disabled={remove.isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium text-danger-700 ring-1 ring-danger-600/20 hover:bg-danger-600/5 transition disabled:opacity-50"
                      title="Quitar de la empresa"
                    >
                      <UserMinus size={13} /> Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

function initials(d: CompanyDriver): string {
  return `${d.firstName?.[0] ?? ''}${d.lastName?.[0] ?? ''}`.toUpperCase() || '·';
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
