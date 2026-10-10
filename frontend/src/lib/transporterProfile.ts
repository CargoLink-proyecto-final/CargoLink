import { useQuery } from '@tanstack/react-query';
import { transporterProfileApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { DocumentType, ProfileStatus, VehicleType, VerificationState } from '@/types';

export const DOCUMENT_TYPES: { type: DocumentType; label: string }[] = [
  { type: 'DNI_FRONT', label: 'DNI (frente)' },
  { type: 'DNI_BACK', label: 'DNI (dorso)' },
  { type: 'LICENSE_FRONT', label: 'Licencia de conducir (frente)' },
  { type: 'LICENSE_BACK', label: 'Licencia de conducir (dorso)' },
  { type: 'AFIP_CONSTANCIA', label: 'Constancia de inscripción AFIP' },
  { type: 'VEHICLE_CARD', label: 'Cédula verde o azul del vehículo' },
  { type: 'INSURANCE', label: 'Seguro vigente' },
  { type: 'VTV', label: 'VTV vigente' },
];

// Categorías de licencia de conducir en Argentina (Ley 24.449), acotadas a las
// que habilitan a manejar un vehículo de carga — quedan afuera las de motos
// (A*, no cargan) y las de transporte de pasajeros (D*, no aplican a CargoLink).
export const LICENSE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'B1', label: 'B1 — Camionetas particulares' },
  { value: 'B2', label: 'B2 — B1 + remolque o casa rodante' },
  { value: 'C1', label: 'C1 — Camiones sin acoplado' },
  { value: 'C2', label: 'C2 — Camiones con acoplado' },
  { value: 'C3', label: 'C3 — Transporte de sustancias peligrosas' },
  { value: 'E1', label: 'E1 — Camiones articulados o con semirremolque' },
  { value: 'E2', label: 'E2 — Maquinaria especial no agrícola' },
];

export const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: 'CAMION', label: 'Camión' },
  { value: 'CAMIONETA', label: 'Camioneta' },
  { value: 'FURGON', label: 'Furgón' },
  { value: 'SEMIRREMOLQUE', label: 'Semirremolque' },
  { value: 'BATEA', label: 'Batea' },
  { value: 'OTRO', label: 'Otro' },
];

const MISSING_LABELS: Record<string, string> = {
  cuit: 'CUIT/CUIL',
  licenseCategory: 'Categoría de licencia',
  licenseExpiresAt: 'Vencimiento de la licencia',
  termsAccepted: 'Declaración jurada',
  vehicle: 'Datos del vehículo',
  ...Object.fromEntries(DOCUMENT_TYPES.map((d) => [`document:${d.type}`, d.label])),
};

export function describeMissing(code: string): string {
  return MISSING_LABELS[code] ?? code;
}

export function documentLabel(type: DocumentType): string {
  return DOCUMENT_TYPES.find((d) => d.type === type)?.label ?? type;
}

// Texto y tono de cada estado de la verificación — compartido por el banner
// del panel, la tarjeta de "Mi perfil" y la página de completar perfil, para
// que el transportista lea lo mismo en todos lados.
export const VERIFICATION_META: Record<
  VerificationState,
  { title: string; description: string; tone: 'warning' | 'danger' | 'info' | 'success' }
> = {
  INCOMPLETE: {
    title: 'Completá tu perfil',
    description: 'Documentos, vehículo y declaración jurada — sin esto no podés postularte a cargas.',
    tone: 'warning',
  },
  REJECTED: {
    title: 'Hay documentos rechazados',
    description: 'Revisá el motivo y volvé a subirlos para que podamos habilitarte.',
    tone: 'danger',
  },
  PENDING_REVIEW: {
    title: 'Documentación en revisión',
    description: 'Un administrador está revisando tus documentos. Te avisamos por mail cuando estés habilitado.',
    tone: 'info',
  },
  APPROVED: {
    title: 'Perfil aprobado',
    description: 'Tu documentación está verificada. Ya podés postularte a cargas.',
    tone: 'success',
  },
};

export const VERIFICATION_TONE_CLASSES: Record<
  'warning' | 'danger' | 'info' | 'success',
  { box: string; text: string }
> = {
  warning: { box: 'bg-warning-50 border-warning-600/20', text: 'text-warning-700' },
  danger: { box: 'bg-danger-50 border-danger-600/20', text: 'text-danger-700' },
  info: { box: 'bg-info-50 border-info-600/20', text: 'text-info-700' },
  success: { box: 'bg-success-50 border-success-600/20', text: 'text-success-700' },
};

// Fecha de hoy en formato YYYY-MM-DD — sirve tanto de `min` para un <input
// type="date"> como de piso para validar que un vencimiento no sea pasado.
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// Mismo criterio que el backend (IsFutureDate): un vencimiento hoy todavía
// cuenta como vigente. Comparar como string ISO (YYYY-MM-DD) alcanza porque
// ambos lados son fechas sin hora.
export function isNotExpired(dateStr: string): boolean {
  return !dateStr || dateStr >= todayIsoDate();
}

// Estado de completitud del perfil de transportista — lo consumen el sidebar
// (badge), el panel del carrier (banner) y el flujo de postulación. Solo
// aplica a TRANSPORTER: para el resto de los roles ni se consulta.
export function useProfileStatus() {
  const role = useAuthStore((s) => s.user?.role);
  return useQuery<ProfileStatus>({
    queryKey: ['transporter-profile-status'],
    queryFn: () => transporterProfileApi.getStatus().then((r) => r.data),
    enabled: role === 'TRANSPORTER',
    staleTime: 15000,
  });
}
