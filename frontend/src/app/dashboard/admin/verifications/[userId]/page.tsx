'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, CheckCircle2, Clock, Eye, X, XCircle } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import VerificationBanner from '@/components/transporter-profile/VerificationBanner';
import { transporterProfileApi, transporterReviewApi } from '@/lib/api';
import { LICENSE_CATEGORIES, VEHICLE_TYPES, documentLabel } from '@/lib/transporterProfile';
import { cn, formatDate } from '@/lib/utils';
import type {
  DocumentDecision,
  DocumentStatus,
  DocumentType,
  ReviewDocument,
  TransporterReviewProfile,
} from '@/types';

// Cada documento se muestra junto al dato declarado que respalda: el admin
// verifica que el archivo coincida con lo que el transportista cargó.
const SECTIONS: { title: string; types: DocumentType[] }[] = [
  { title: 'Identidad', types: ['DNI_FRONT', 'DNI_BACK'] },
  { title: 'Situación fiscal', types: ['AFIP_CONSTANCIA'] },
  { title: 'Licencia de conducir', types: ['LICENSE_FRONT', 'LICENSE_BACK'] },
  { title: 'Vehículo', types: ['VEHICLE_CARD', 'INSURANCE', 'VTV'] },
];

const STATUS_META: Record<DocumentStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  PENDING: { label: 'Pendiente', className: 'text-warning-700 bg-warning-50', Icon: Clock },
  APPROVED: { label: 'Aprobado', className: 'text-success-700 bg-success-50', Icon: CheckCircle2 },
  REJECTED: { label: 'Rechazado', className: 'text-danger-700 bg-danger-50', Icon: XCircle },
};

type Draft = { status: 'APPROVED' | 'REJECTED'; reason: string };

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-[13px]">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-ink-900 text-right font-medium">{value ?? <span className="text-ink-400">—</span>}</dd>
    </div>
  );
}

function formatOptionalDate(date: string | null | undefined): string | null {
  return date ? formatDate(date) : null;
}

export default function TransporterReviewPage() {
  const { userId } = useParams<{ userId: string }>();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [viewError, setViewError] = useState('');

  const { data, isLoading, isError } = useQuery<TransporterReviewProfile>({
    queryKey: ['transporter-review', userId],
    queryFn: () => transporterReviewApi.getProfile(userId).then((r) => r.data),
  });

  const reviewMutation = useMutation({
    mutationFn: (decisions: DocumentDecision[]) => transporterReviewApi.review(userId, decisions),
    onSuccess: () => {
      setDrafts({});
      queryClient.invalidateQueries({ queryKey: ['transporter-review', userId] });
      queryClient.invalidateQueries({ queryKey: ['transporter-review-queue'] });
    },
  });

  // El endpoint exige auth (son DNI y licencias): se trae como blob y se abre
  // con una object URL, igual que en el perfil del transportista.
  const openDocument = async (doc: ReviewDocument) => {
    setViewError('');
    try {
      const res = await transporterProfileApi.getDocumentFile(doc.id);
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setViewError(`No se pudo abrir ${documentLabel(doc.type)}`);
    }
  };

  const setDraft = (docId: string, status: Draft['status']) =>
    setDrafts((prev) => {
      // Volver a tocar la misma decisión la deshace.
      if (prev[docId]?.status === status) {
        const { [docId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [docId]: { status, reason: prev[docId]?.reason ?? '' } };
    });

  const setReason = (docId: string, reason: string) =>
    setDrafts((prev) => ({ ...prev, [docId]: { ...prev[docId], reason } }));

  if (isLoading || isError || !data) {
    return (
      <DashboardLayout>
        <p className={cn('text-sm', isError ? 'text-danger-700' : 'text-ink-500')}>
          {isError ? 'No se pudo cargar el perfil del transportista.' : 'Cargando…'}
        </p>
      </DashboardLayout>
    );
  }

  const { user, vehicle, documents, status } = data;
  const docsByType = new Map(documents.map((d) => [d.type, d]));
  const pendingDocs = documents.filter((d) => d.status === 'PENDING');

  const decisions: DocumentDecision[] = Object.entries(drafts).map(([documentId, d]) => ({
    documentId,
    status: d.status,
    ...(d.status === 'REJECTED' ? { reason: d.reason.trim() } : {}),
  }));
  const missingReason = decisions.some((d) => d.status === 'REJECTED' && !d.reason);
  const rejectedCount = decisions.filter((d) => d.status === 'REJECTED').length;

  const approveAllPending = () =>
    setDrafts((prev) => {
      const next = { ...prev };
      for (const doc of pendingDocs) next[doc.id] = { status: 'APPROVED', reason: '' };
      return next;
    });

  const licenseLabel = LICENSE_CATEGORIES.find((c) => c.value === user.licenseCategory)?.label;
  const vehicleType = VEHICLE_TYPES.find((v) => v.value === vehicle?.type)?.label;
  const specs = vehicle
    ? [
        vehicle.refrigerated && 'Refrigerado',
        vehicle.hazardousMaterials && 'Cargas peligrosas',
        vehicle.bulkLiquid && 'Granel/líquidos',
      ].filter(Boolean)
    : [];
  const dimensions =
    vehicle && (vehicle.lengthCm || vehicle.widthCm || vehicle.heightCm)
      ? `${vehicle.lengthCm ?? '—'} × ${vehicle.widthCm ?? '—'} × ${vehicle.heightCm ?? '—'} cm`
      : null;

  // Datos declarados que respalda cada sección.
  const sectionData: Record<string, React.ReactNode> = {
    Identidad: (
      <>
        <DataRow label="Nombre" value={`${user.firstName} ${user.lastName}`} />
        <DataRow label="Teléfono" value={user.phone} />
      </>
    ),
    'Situación fiscal': <DataRow label="CUIT/CUIL" value={user.cuit && <span className="font-mono">{user.cuit}</span>} />,
    'Licencia de conducir': (
      <>
        <DataRow label="Categoría" value={licenseLabel ?? user.licenseCategory} />
        <DataRow label="Vencimiento" value={formatOptionalDate(user.licenseExpiresAt)} />
      </>
    ),
    Vehículo: vehicle ? (
      <>
        <DataRow label="Dominio" value={<span className="font-mono">{vehicle.plate}</span>} />
        <DataRow label="Vehículo" value={`${vehicleType} · ${vehicle.brand} ${vehicle.model} ${vehicle.year}`} />
        <DataRow label="Capacidad" value={`${vehicle.maxWeightKg.toLocaleString('es-AR')} kg${vehicle.maxVolumeM3 ? ` · ${vehicle.maxVolumeM3} m³` : ''}`} />
        <DataRow label="Medidas (L × A × H)" value={dimensions} />
        <DataRow label="Especificaciones" value={specs.length > 0 ? specs.join(' · ') : 'Carga general'} />
        <DataRow label="Vence el seguro" value={formatOptionalDate(vehicle.insuranceExpiresAt)} />
        <DataRow label="Vence la VTV" value={formatOptionalDate(vehicle.vtvExpiresAt)} />
      </>
    ) : (
      <p className="text-[13px] text-ink-400 py-1.5">Todavía no cargó su vehículo.</p>
    ),
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6 pb-28">
        <Link
          href="/dashboard/admin/verifications"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-500 hover:text-primary-700"
        >
          <ArrowLeft size={14} /> Volver a la cola
        </Link>

        <div>
          <p className="eyebrow">Verificación de transportista</p>
          <h1 className="mt-2 font-display text-[32px] leading-tight">
            {user.firstName} {user.lastName}
          </h1>
          <p className="font-mono text-[12.5px] text-ink-500 mt-1">
            {user.email}
            {user.company && <span className="font-sans"> · {user.company.name}</span>}
          </p>
          <p className="text-[12.5px] text-ink-500 mt-1">
            {user.termsAcceptedAt
              ? `Aceptó la declaración jurada el ${formatDate(user.termsAcceptedAt)} (versión ${user.termsAcceptedVersion}).`
              : 'Todavía no aceptó la declaración jurada.'}
          </p>
        </div>

        <VerificationBanner status={status} />

        {viewError && <p className="text-sm text-danger-700">{viewError}</p>}

        {SECTIONS.map((section) => (
          <section key={section.title} className="card overflow-hidden">
            <div className="grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <div className="px-5 py-4 bg-surface-sunk/40 md:border-r border-b md:border-b-0 border-ink-200/70">
                <h2 className="font-display text-[18px]">{section.title}</h2>
                <p className="text-[11px] uppercase tracking-[0.14em] text-ink-400 mt-1 mb-2">Datos declarados</p>
                <dl>{sectionData[section.title]}</dl>
              </div>

              <div>
                {section.types.map((type, i) => {
                  const doc = docsByType.get(type);
                  const draft = doc ? drafts[doc.id] : undefined;
                  const meta = doc ? STATUS_META[doc.status] : null;
                  return (
                    <div key={type} className={cn('px-5 py-4', i !== 0 && 'border-t border-ink-200/60')}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-medium text-ink-800">{documentLabel(type)}</p>
                          {doc && meta ? (
                            <span className={cn('inline-flex items-center gap-1 mt-1 text-[11px] px-2 py-0.5 rounded-full', meta.className)}>
                              <meta.Icon size={11} /> {meta.label}
                              {doc.reviewedAt && doc.reviewedBy && doc.status !== 'PENDING' && (
                                <span className="opacity-80">
                                  {' '}· {doc.reviewedBy.firstName} {doc.reviewedBy.lastName}, {formatDate(doc.reviewedAt)}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="block mt-1 text-[11px] text-ink-400">No subido</span>
                          )}
                        </div>

                        {doc && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openDocument(doc)}
                              className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-600 hover:text-primary-700 px-2.5 py-1.5 rounded-lg hover:bg-surface-sunk transition"
                            >
                              <Eye size={14} /> Ver
                            </button>
                            <button
                              type="button"
                              onClick={() => setDraft(doc.id, 'APPROVED')}
                              aria-pressed={draft?.status === 'APPROVED'}
                              className={cn(
                                'inline-flex items-center gap-1 text-[12.5px] font-medium px-2.5 py-1.5 rounded-lg border transition',
                                draft?.status === 'APPROVED'
                                  ? 'bg-success-600 border-success-600 text-white'
                                  : 'border-ink-200 text-ink-700 hover:border-success-600 hover:text-success-700',
                              )}
                            >
                              <Check size={14} /> Aprobar
                            </button>
                            <button
                              type="button"
                              onClick={() => setDraft(doc.id, 'REJECTED')}
                              aria-pressed={draft?.status === 'REJECTED'}
                              className={cn(
                                'inline-flex items-center gap-1 text-[12.5px] font-medium px-2.5 py-1.5 rounded-lg border transition',
                                draft?.status === 'REJECTED'
                                  ? 'bg-danger-600 border-danger-600 text-white'
                                  : 'border-ink-200 text-ink-700 hover:border-danger-600 hover:text-danger-700',
                              )}
                            >
                              <X size={14} /> Rechazar
                            </button>
                          </div>
                        )}
                      </div>

                      {doc?.status === 'REJECTED' && doc.rejectionReason && !draft && (
                        <p className="text-[12px] text-danger-700 mt-2">Motivo anterior: {doc.rejectionReason}</p>
                      )}

                      {draft?.status === 'REJECTED' && doc && (
                        <div className="mt-3">
                          <label htmlFor={`reason-${doc.id}`} className="block text-[12px] font-medium text-ink-700 mb-1">
                            Motivo del rechazo (lo ve el transportista)
                          </label>
                          <textarea
                            id={`reason-${doc.id}`}
                            rows={2}
                            maxLength={500}
                            value={draft.reason}
                            onChange={(e) => setReason(doc.id, e.target.value)}
                            placeholder="Ej.: la foto está borrosa y no se lee el número de documento"
                            className="w-full px-3 py-2 bg-surface-raised border border-ink-200 rounded-lg text-[13px] focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 outline-none transition"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* Barra de envío: la revisión se manda junta para que el transportista
          reciba un único mail con todo lo que tiene que corregir. */}
      <div className="fixed bottom-0 inset-x-0 lg:left-64 z-20 border-t border-ink-200 bg-surface-raised/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="text-[12.5px] text-ink-600">
            {reviewMutation.isError ? (
              <span className="text-danger-700">
                {(reviewMutation.error as any)?.response?.data?.message || 'No se pudo guardar la revisión'}
              </span>
            ) : reviewMutation.isSuccess && decisions.length === 0 ? (
              <span className="text-success-700">Revisión enviada. Le avisamos al transportista por mail.</span>
            ) : decisions.length === 0 ? (
              'Marcá cada documento como aprobado o rechazado.'
            ) : missingReason ? (
              <span className="text-danger-700">Escribí el motivo de cada rechazo.</span>
            ) : (
              `${decisions.length} ${decisions.length === 1 ? 'decisión' : 'decisiones'}${
                rejectedCount > 0 ? ` · ${rejectedCount} con rechazo` : ''
              }`
            )}
          </div>
          <div className="flex items-center gap-2">
            {pendingDocs.length > 0 && (
              <button
                type="button"
                onClick={approveAllPending}
                className="text-[13px] font-medium text-ink-700 hover:text-success-700 px-3 py-2 rounded-lg hover:bg-surface-sunk transition"
              >
                Aprobar pendientes ({pendingDocs.length})
              </button>
            )}
            <button
              type="button"
              disabled={decisions.length === 0 || missingReason || reviewMutation.isPending}
              onClick={() => reviewMutation.mutate(decisions)}
              className="bg-ink-900 hover:bg-ink-800 text-surface-raised font-medium px-5 py-2.5 rounded-lg transition disabled:opacity-50 text-[14px]"
            >
              {reviewMutation.isPending ? 'Enviando…' : 'Enviar revisión'}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
