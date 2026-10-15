import { DocumentStatus, DocumentType } from '@prisma/client';

// Documentos obligatorios para considerar completo el perfil de un
// transportista. RUTA/CNRT queda afuera a propósito (ver docs/api.md): no se
// puede validar sin integración con CNRT y no aporta nada real todavía.
export const REQUIRED_DOCUMENT_TYPES: DocumentType[] = [
  DocumentType.DNI_FRONT,
  DocumentType.DNI_BACK,
  DocumentType.LICENSE_FRONT,
  DocumentType.LICENSE_BACK,
  DocumentType.AFIP_CONSTANCIA,
  DocumentType.VEHICLE_CARD,
  DocumentType.INSURANCE,
  DocumentType.VTV,
];

// Nombre legible de cada documento — para los mails al transportista.
export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  DNI_FRONT: 'DNI (frente)',
  DNI_BACK: 'DNI (dorso)',
  LICENSE_FRONT: 'Licencia de conducir (frente)',
  LICENSE_BACK: 'Licencia de conducir (dorso)',
  AFIP_CONSTANCIA: 'Constancia de AFIP',
  VEHICLE_CARD: 'Cédula del vehículo',
  INSURANCE: 'Seguro',
  VTV: 'VTV',
};

// Qué documentos respaldan qué datos declarados: si el transportista cambia
// el dato, el documento vuelve a revisión (el admin aprobó el archivo contra
// el dato viejo).
export const VEHICLE_DOCUMENT_TYPES: DocumentType[] = [
  DocumentType.VEHICLE_CARD,
  DocumentType.INSURANCE,
  DocumentType.VTV,
];
export const CUIT_DOCUMENT_TYPES: DocumentType[] = [DocumentType.AFIP_CONSTANCIA];
export const LICENSE_DOCUMENT_TYPES: DocumentType[] = [
  DocumentType.LICENSE_FRONT,
  DocumentType.LICENSE_BACK,
];

export interface ProfileCompletenessUser {
  cuit: string | null;
  licenseCategory: string | null;
  licenseExpiresAt: Date | null;
  termsAcceptedAt: Date | null;
}

// Estado global de la verificación, en orden de prioridad para el usuario:
// un rechazo trae feedback concreto del admin, así que se muestra antes que
// lo que falta cargar.
export type VerificationState = 'REJECTED' | 'INCOMPLETE' | 'PENDING_REVIEW' | 'APPROVED';

export interface ProfileStatus {
  // Cargó todo lo obligatorio (no implica que el admin lo haya revisado).
  complete: boolean;
  // Completo y con todos los documentos obligatorios aprobados por un admin.
  approved: boolean;
  state: VerificationState;
  missing: string[];
  pendingReview: DocumentType[];
  rejected: DocumentType[];
}

// Única fuente de verdad de "qué le falta a un transportista" — la usan el
// guard que bloquea postularse, el endpoint de estado que consumen los
// frontends y la cola de revisión del admin. Función pura para poder
// testearla sin mockear Prisma.
export function computeProfileStatus(params: {
  user: ProfileCompletenessUser;
  hasVehicle: boolean;
  documents: { type: DocumentType; status: DocumentStatus }[];
}): ProfileStatus {
  const { user, hasVehicle, documents } = params;
  const missing: string[] = [];

  if (!user.cuit) missing.push('cuit');
  if (!user.licenseCategory) missing.push('licenseCategory');
  if (!user.licenseExpiresAt) missing.push('licenseExpiresAt');
  if (!user.termsAcceptedAt) missing.push('termsAccepted');
  if (!hasVehicle) missing.push('vehicle');

  const statusByType = new Map(documents.map((d) => [d.type, d.status]));
  const pendingReview: DocumentType[] = [];
  const rejected: DocumentType[] = [];
  for (const type of REQUIRED_DOCUMENT_TYPES) {
    const status = statusByType.get(type);
    if (!status) missing.push(`document:${type}`);
    else if (status === DocumentStatus.PENDING) pendingReview.push(type);
    else if (status === DocumentStatus.REJECTED) rejected.push(type);
  }

  const complete = missing.length === 0;
  const approved = complete && pendingReview.length === 0 && rejected.length === 0;

  let state: VerificationState;
  if (rejected.length > 0) state = 'REJECTED';
  else if (!complete) state = 'INCOMPLETE';
  else if (pendingReview.length > 0) state = 'PENDING_REVIEW';
  else state = 'APPROVED';

  return { complete, approved, state, missing, pendingReview, rejected };
}
