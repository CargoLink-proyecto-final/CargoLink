// Espejo de frontend/src/lib/transporterProfile.ts. Mobile y web no comparten
// código, así que las etiquetas visibles se duplican acá.

import { DocumentType, VehicleType } from '../types';

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

// Fecha de hoy en formato YYYY-MM-DD. Mismo criterio que el backend
// (IsFutureDate): comparamos como string ISO, un vencimiento hoy todavía
// cuenta como vigente.
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isNotExpired(dateStr: string): boolean {
  return !dateStr || dateStr >= todayIsoDate();
}
