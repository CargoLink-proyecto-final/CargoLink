import { DocumentType } from '@prisma/client';

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

export interface ProfileCompletenessUser {
  cuit: string | null;
  licenseCategory: string | null;
  licenseExpiresAt: Date | null;
  termsAcceptedAt: Date | null;
}

export interface ProfileStatus {
  complete: boolean;
  missing: string[];
}

// Única fuente de verdad de "qué le falta a un transportista" — la usan tanto
// el guard que bloquea postularse como el endpoint de estado que consumen los
// frontends para el checklist. Función pura para poder testearla sin mockear
// Prisma.
export function computeProfileStatus(params: {
  user: ProfileCompletenessUser;
  hasVehicle: boolean;
  documentTypes: DocumentType[];
}): ProfileStatus {
  const { user, hasVehicle, documentTypes } = params;
  const missing: string[] = [];

  if (!user.cuit) missing.push('cuit');
  if (!user.licenseCategory) missing.push('licenseCategory');
  if (!user.licenseExpiresAt) missing.push('licenseExpiresAt');
  if (!user.termsAcceptedAt) missing.push('termsAccepted');
  if (!hasVehicle) missing.push('vehicle');

  const present = new Set(documentTypes);
  for (const type of REQUIRED_DOCUMENT_TYPES) {
    if (!present.has(type)) missing.push(`document:${type}`);
  }

  return { complete: missing.length === 0, missing };
}
