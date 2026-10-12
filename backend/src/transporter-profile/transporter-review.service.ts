import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DocumentStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { computeProfileStatus, DOCUMENT_LABELS } from './profile-completeness';
import { loadProfileStatus } from './profile-status';
import { ReviewProfileDto } from './dto/review-profile.dto';

// Datos de verificación del transportista. Nunca incluye password ni tokens.
const PROFILE_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  isActive: true,
  createdAt: true,
  cuit: true,
  licenseCategory: true,
  licenseExpiresAt: true,
  termsAcceptedAt: true,
  termsAcceptedVersion: true,
  company: { select: { id: true, name: true } },
} as const;

// Revisión de la documentación de transportistas por un admin (CU-11).
@Injectable()
export class TransporterReviewService {
  private readonly logger = new Logger(TransporterReviewService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  // Cola de revisión: transportistas con al menos un documento PENDING, el
  // que espera hace más tiempo primero.
  async getQueue() {
    const users = await this.prisma.user.findMany({
      where: {
        role: Role.TRANSPORTER,
        documents: { some: { status: DocumentStatus.PENDING } },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        cuit: true,
        licenseCategory: true,
        licenseExpiresAt: true,
        termsAcceptedAt: true,
        company: { select: { id: true, name: true } },
        vehicle: { select: { plate: true, unit: true, bodyType: true } },
        documents: { select: { type: true, status: true, updatedAt: true } },
      },
    });

    return users
      .map(({ documents, vehicle, cuit, licenseCategory, licenseExpiresAt, termsAcceptedAt, ...user }) => {
        const status = computeProfileStatus({
          user: { cuit, licenseCategory, licenseExpiresAt, termsAcceptedAt },
          hasVehicle: !!vehicle,
          documents,
        });
        const pendingDates = documents
          .filter((d) => d.status === DocumentStatus.PENDING)
          .map((d) => d.updatedAt.getTime());
        return {
          ...user,
          vehicle,
          state: status.state,
          complete: status.complete,
          pendingCount: pendingDates.length,
          waitingSince: new Date(Math.min(...pendingDates)),
        };
      })
      .sort((a, b) => a.waitingSince.getTime() - b.waitingSince.getTime());
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...PROFILE_USER_SELECT, role: true },
    });
    if (!user || user.role !== Role.TRANSPORTER) {
      throw new NotFoundException('Transportista no encontrado');
    }

    const [vehicle, documents, status] = await Promise.all([
      this.prisma.vehicle.findUnique({ where: { userId } }),
      this.prisma.document.findMany({
        where: { userId },
        select: {
          id: true,
          type: true,
          status: true,
          rejectionReason: true,
          reviewedAt: true,
          reviewedBy: { select: { id: true, firstName: true, lastName: true } },
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { type: 'asc' },
      }),
      loadProfileStatus(this.prisma, userId),
    ]);

    return { user, vehicle, documents, status };
  }

  async review(userId: string, adminId: string, dto: ReviewProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, role: true },
    });
    if (!user || user.role !== Role.TRANSPORTER) {
      throw new NotFoundException('Transportista no encontrado');
    }

    const ids = dto.decisions.map((d) => d.documentId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Hay decisiones repetidas para el mismo documento');
    }
    const documents = await this.prisma.document.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true, type: true },
    });
    if (documents.length !== ids.length) {
      throw new BadRequestException('Algún documento no existe o no pertenece a este transportista');
    }

    const wasApproved = (await loadProfileStatus(this.prisma, userId))?.approved ?? false;

    const reviewedAt = new Date();
    await this.prisma.$transaction(
      dto.decisions.map((decision) =>
        this.prisma.document.update({
          where: { id: decision.documentId },
          data: {
            status: decision.status,
            rejectionReason: decision.status === 'REJECTED' ? decision.reason?.trim() : null,
            reviewedAt,
            reviewedById: adminId,
          },
        }),
      ),
    );

    const status = await loadProfileStatus(this.prisma, userId);

    // Un solo mail por revisión. Si falla el envío, la revisión igual queda
    // guardada: el transportista ve el resultado en su perfil.
    const typeById = new Map(documents.map((d) => [d.id, d.type]));
    const rejected = dto.decisions
      .filter((d) => d.status === 'REJECTED')
      .map((d) => ({ label: DOCUMENT_LABELS[typeById.get(d.documentId)!], reason: d.reason!.trim() }));
    try {
      if (rejected.length > 0) {
        await this.mailService.sendDocumentsRejectedEmail(user.email, user.firstName, rejected);
      } else if (status?.approved && !wasApproved) {
        await this.mailService.sendProfileApprovedEmail(user.email, user.firstName);
      }
    } catch (err) {
      this.logger.error(`No se pudo enviar el mail de revisión a ${userId}`, err as Error);
    }

    return status;
  }
}
