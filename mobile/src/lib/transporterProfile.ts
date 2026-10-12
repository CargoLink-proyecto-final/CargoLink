// Espejo de frontend/src/lib/transporterProfile.ts. Mobile y web no comparten
// código, así que las etiquetas visibles se duplican acá.

import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { BodyType, DocumentType, VehicleUnit, VerificationState } from '../types';

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
export const LICENSE_CATEGORIES: string[] = ['B1', 'B2', 'C1', 'C2', 'C3', 'E1', 'E2'];

export const VEHICLE_UNITS: { value: VehicleUnit; label: string }[] = [
  { value: 'CAMIONETA', label: 'Camioneta' },
  { value: 'CHASIS', label: 'Chasis' },
  { value: 'BALANCIN', label: 'Balancín' },
  { value: 'SEMIRREMOLQUE', label: 'Semirremolque' },
];

export const BODY_TYPES: { value: BodyType; label: string; hint: string }[] = [
  { value: 'CERRADA', label: 'Cerrada', hint: 'Furgón o sider' },
  { value: 'ABIERTA', label: 'Abierta', hint: 'Playo o plataforma' },
  { value: 'VOLCADORA', label: 'Volcadora', hint: 'Batea o tolva, granel sólido' },
  { value: 'CISTERNA', label: 'Cisterna', hint: 'Líquidos a granel' },
];

export function bodyTypeLabel(bodyType: BodyType): string {
  return BODY_TYPES.find((b) => b.value === bodyType)?.label ?? bodyType;
}

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

// Texto y colores de cada estado de la verificación (mismo texto que la web).
export const VERIFICATION_META: Record<
  VerificationState,
  {
    title: string;
    description: string;
    icon: ComponentProps<typeof Ionicons>['name'];
    color: string;
    background: string;
  }
> = {
  INCOMPLETE: {
    title: 'Completá tu perfil',
    description: 'Documentos, vehículo y declaración jurada — sin esto no podés postularte.',
    icon: 'clipboard-outline',
    color: '#b45309',
    background: '#fef3c7',
  },
  REJECTED: {
    title: 'Hay documentos rechazados',
    description: 'Revisá el motivo y volvé a subirlos para que podamos habilitarte.',
    icon: 'close-circle-outline',
    color: '#b91c1c',
    background: '#fee2e2',
  },
  PENDING_REVIEW: {
    title: 'Documentación en revisión',
    description: 'Un administrador está revisando tus documentos. Te avisamos por mail.',
    icon: 'time-outline',
    color: '#1d4ed8',
    background: '#dbeafe',
  },
  APPROVED: {
    title: 'Perfil aprobado',
    description: 'Tu documentación está verificada. Ya podés postularte a cargas.',
    icon: 'checkmark-circle-outline',
    color: '#15803d',
    background: '#dcfce7',
  },
};

// Fecha de hoy en formato YYYY-MM-DD. Mismo criterio que el backend
// (IsFutureDate): comparamos como string ISO, un vencimiento hoy todavía
// cuenta como vigente.
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isNotExpired(dateStr: string): boolean {
  return !dateStr || dateStr >= todayIsoDate();
}
