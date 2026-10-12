import { DocumentStatus, DocumentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeProfileStatus, ProfileStatus } from './profile-completeness';

// Junta las piezas del perfil desde la DB y calcula el estado. Compartido
// entre el guard de postulación y el endpoint de estado para que ambos lean
// exactamente lo mismo. Devuelve null si el usuario no existe.
export async function loadProfileStatus(
  prisma: PrismaService,
  userId: string,
): Promise<ProfileStatus | null> {
  const [user, vehicle, documents] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { cuit: true, licenseCategory: true, licenseExpiresAt: true, termsAcceptedAt: true },
    }),
    prisma.vehicle.findUnique({ where: { userId }, select: { id: true } }),
    prisma.document.findMany({ where: { userId }, select: { type: true, status: true } }),
  ]);
  if (!user) return null;

  return computeProfileStatus({ user, hasVehicle: !!vehicle, documents });
}

// Campos de revisión que se limpian cuando un documento vuelve a PENDING.
export const CLEARED_REVIEW = {
  status: DocumentStatus.PENDING,
  rejectionReason: null,
  reviewedAt: null,
  reviewedById: null,
} satisfies Prisma.DocumentUncheckedUpdateManyInput;

// Vuelve a revisión los documentos APROBADOS que respaldan un dato que el
// transportista acaba de cambiar (ej. el dominio del vehículo): el admin los
// aprobó contra el dato viejo. Los RECHAZADOS quedan como están — el problema
// era el archivo, y cambiar el dato no lo arregla.
export async function sendApprovedDocumentsBackToReview(
  prisma: PrismaService | Prisma.TransactionClient,
  userId: string,
  types: DocumentType[],
): Promise<void> {
  await prisma.document.updateMany({
    where: { userId, type: { in: types }, status: DocumentStatus.APPROVED },
    data: CLEARED_REVIEW,
  });
}
