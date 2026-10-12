'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ShieldCheck, Truck } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { transporterReviewApi } from '@/lib/api';
import { bodyTypeLabel, vehicleUnitLabel } from '@/lib/transporterProfile';
import { formatDate } from '@/lib/utils';
import type { ReviewQueueItem } from '@/types';

// Un transportista puede tener documentos pendientes sin haber terminado de
// cargar todo: el admin igual puede ir revisando lo que ya subió.
const QUEUE_STATE_LABEL: Record<ReviewQueueItem['state'], { label: string; className: string }> = {
  PENDING_REVIEW: { label: 'Listo para revisar', className: 'bg-info-50 text-info-700' },
  INCOMPLETE: { label: 'Perfil incompleto', className: 'bg-warning-50 text-warning-700' },
  REJECTED: { label: 'Con rechazos', className: 'bg-danger-50 text-danger-700' },
  APPROVED: { label: 'Aprobado', className: 'bg-success-50 text-success-700' },
};

function daysWaiting(since: string): string {
  const days = Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000);
  if (days <= 0) return 'hoy';
  return days === 1 ? 'hace 1 día' : `hace ${days} días`;
}

export default function VerificationsQueuePage() {
  const { data: queue = [], isLoading, isError } = useQuery<ReviewQueueItem[]>({
    queryKey: ['transporter-review-queue'],
    queryFn: () => transporterReviewApi.getQueue().then((r) => r.data),
  });

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <p className="eyebrow">Administración</p>
          <h1 className="mt-2 font-display text-[38px] leading-[1.05]">
            Verificación de <span className="font-semibold text-primary-700">transportistas</span>
          </h1>
          <p className="text-ink-500 mt-2 text-sm max-w-2xl">
            Revisá DNI, licencia, constancia de AFIP y documentación del vehículo. Un transportista
            puede postularse a cargas recién cuando todos sus documentos están aprobados.
          </p>
        </div>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-ink-200/70">
            <div>
              <p className="eyebrow">Por antigüedad</p>
              <h2 className="font-display text-[20px] mt-1">Pendientes de revisión</h2>
            </div>
            {queue.length > 0 && (
              <span className="text-[12px] tabular-nums text-ink-500">{queue.length} en cola</span>
            )}
          </div>

          {isLoading && <p className="px-5 py-8 text-sm text-ink-500">Cargando…</p>}
          {isError && (
            <p className="px-5 py-8 text-sm text-danger-700">No se pudo cargar la cola de verificación.</p>
          )}
          {!isLoading && !isError && queue.length === 0 && (
            <div className="px-5 py-12 text-center">
              <ShieldCheck size={28} className="mx-auto text-success-600" />
              <p className="mt-3 font-medium text-ink-800">No hay documentación pendiente</p>
              <p className="text-sm text-ink-500 mt-1">
                Cuando un transportista suba o reemplace documentos, va a aparecer acá.
              </p>
            </div>
          )}

          {queue.map((item, i) => {
            const state = QUEUE_STATE_LABEL[item.state];
            const vehicleType = item.vehicle
              ? `${vehicleUnitLabel(item.vehicle.unit)} ${bodyTypeLabel(item.vehicle.bodyType).toLowerCase()}`
              : null;
            return (
              <Link
                key={item.id}
                href={`/dashboard/admin/verifications/${item.id}`}
                className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 px-4 sm:px-5 py-4 transition hover:bg-surface-sunk/60 ${
                  i !== 0 ? 'border-t border-ink-200/60' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-full bg-ink-100 text-ink-700 flex items-center justify-center text-[12px] font-mono shrink-0">
                    {(item.firstName?.[0] ?? '?').toUpperCase()}
                    {(item.lastName?.[0] ?? '').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900 truncate">
                      {item.firstName} {item.lastName}
                      {item.company && <span className="text-ink-500 font-normal"> · {item.company.name}</span>}
                    </p>
                    <p className="font-mono text-[11.5px] text-ink-500 truncate">{item.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[12.5px] text-ink-600 sm:w-48 shrink-0">
                  <Truck size={14} className="text-ink-400 shrink-0" />
                  {item.vehicle ? (
                    <span className="truncate">
                      <span className="font-mono">{item.vehicle.plate}</span> · {vehicleType}
                    </span>
                  ) : (
                    <span className="text-ink-400">Sin vehículo</span>
                  )}
                </div>

                <div className="flex items-center gap-3 sm:w-72 shrink-0 sm:justify-end">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${state.className}`}>{state.label}</span>
                  <span className="text-[12px] text-ink-500 tabular-nums" title={formatDate(item.waitingSince)}>
                    {item.pendingCount} doc. · {daysWaiting(item.waitingSince)}
                  </span>
                  <ArrowRight size={16} className="text-ink-400 hidden sm:block" />
                </div>
              </Link>
            );
          })}
        </section>
      </div>
    </DashboardLayout>
  );
}
