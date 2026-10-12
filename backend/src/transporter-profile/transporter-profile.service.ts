import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { DocumentType, Vehicle } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertVehicleDto } from './dto/upsert-vehicle.dto';
import { VEHICLE_DOCUMENT_TYPES } from './profile-completeness';
import {
  CLEARED_REVIEW,
  loadProfileStatus,
  sendApprovedDocumentsBackToReview,
} from './profile-status';
import { resolveUploadDir } from './upload-dir';

// Únicos formatos que aceptamos para documentos: fotos y PDF (la constancia
// de AFIP suele descargarse como PDF, no se fotografía).
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

@Injectable()
export class TransporterProfileService {
  private readonly uploadDir: string;

  constructor(
    private prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.uploadDir = resolveUploadDir(configService);
  }

  async uploadDocument(userId: string, type: DocumentType, file: Express.Multer.File) {
    const extension = EXTENSION_BY_MIME[file.mimetype];
    if (!extension) {
      throw new BadRequestException('Formato de archivo no permitido (solo JPG, PNG o PDF)');
    }

    const userDir = join(this.uploadDir, userId);
    await mkdir(userDir, { recursive: true });
    // Un solo archivo vigente por tipo: reemplaza al anterior en disco y en
    // la fila (misma ruta, upsert por @@unique([userId, type])).
    const relativePath = join(userId, `${type}.${extension}`);
    await writeFile(join(this.uploadDir, relativePath), file.buffer);

    return this.prisma.document.upsert({
      where: { userId_type: { userId, type } },
      create: { userId, type, fileUrl: relativePath },
      // Archivo nuevo = revisión nueva: se descarta el veredicto (y el motivo
      // de rechazo) del archivo anterior.
      update: { fileUrl: relativePath, ...CLEARED_REVIEW },
    });
  }

  async listDocuments(userId: string) {
    return this.prisma.document.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        status: true,
        rejectionReason: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { type: 'asc' },
    });
  }

  // Devuelve la ruta absoluta y el content-type para servir el archivo — solo
  // al dueño o a un ADMIN. Nunca se sirve como estático público: son DNI y
  // licencias.
  async getDocumentFile(documentId: string, requesterId: string, requesterRole: string) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException('Documento no encontrado');
    if (document.userId !== requesterId && requesterRole !== 'ADMIN') {
      throw new ForbiddenException('No podés ver este documento');
    }

    const extension = document.fileUrl.split('.').pop();
    const contentType =
      Object.entries(EXTENSION_BY_MIME).find(([, ext]) => ext === extension)?.[0] ??
      'application/octet-stream';

    return { absolutePath: join(this.uploadDir, document.fileUrl), contentType };
  }

  async deleteDocument(documentId: string, userId: string) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException('Documento no encontrado');
    if (document.userId !== userId) {
      throw new ForbiddenException('No podés borrar este documento');
    }

    await this.prisma.document.delete({ where: { id: documentId } });
    // Best-effort: si el archivo ya no está en disco no es un error para el
    // usuario, el registro es lo que importa.
    await unlink(join(this.uploadDir, document.fileUrl)).catch(() => undefined);
    return { deleted: true };
  }

  async upsertVehicle(userId: string, dto: UpsertVehicleDto) {
    const plateOwner = await this.prisma.vehicle.findUnique({ where: { plate: dto.plate } });
    if (plateOwner && plateOwner.userId !== userId) {
      throw new ConflictException('Ese dominio ya está registrado por otro transportista');
    }

    // Prisma exige un DateTime ISO completo; el DTO solo valida "es una
    // fecha" (acepta "2027-01-01" sin hora), así que lo normalizamos acá.
    const { insuranceExpiresAt, vtvExpiresAt, ...rest } = dto;
    const data = {
      ...rest,
      ...(insuranceExpiresAt !== undefined ? { insuranceExpiresAt: new Date(insuranceExpiresAt) } : {}),
      ...(vtvExpiresAt !== undefined ? { vtvExpiresAt: new Date(vtvExpiresAt) } : {}),
    };

    const existing = await this.prisma.vehicle.findUnique({ where: { userId } });

    return this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.upsert({
        where: { userId },
        create: { userId, ...data },
        update: { ...data },
      });
      // La cédula, el seguro y la VTV se aprobaron contra los datos viejos del
      // vehículo: si cambió algo, el admin tiene que volver a mirarlos.
      if (existing && vehicleChanged(existing, vehicle)) {
        await sendApprovedDocumentsBackToReview(tx, userId, VEHICLE_DOCUMENT_TYPES);
      }
      return vehicle;
    });
  }

  async getVehicle(userId: string) {
    return this.prisma.vehicle.findUnique({ where: { userId } });
  }

  async acceptTerms(userId: string, version: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { termsAcceptedAt: new Date(), termsAcceptedVersion: version },
      select: { termsAcceptedAt: true, termsAcceptedVersion: true },
    });
  }

  async getStatus(userId: string) {
    const status = await loadProfileStatus(this.prisma, userId);
    if (!status) throw new NotFoundException('Usuario no encontrado');
    return status;
  }
}

// Compara solo los atributos que declara el transportista (no id/fechas de
// auditoría). Las fechas se comparan por valor.
const VEHICLE_FIELDS = [
  'plate',
  'brand',
  'model',
  'year',
  'unit',
  'bodyType',
  'maxWeightKg',
  'maxVolumeM3',
  'heightCm',
  'widthCm',
  'lengthCm',
  'refrigerated',
  'hazardousMaterials',
  'insuranceExpiresAt',
  'vtvExpiresAt',
] as const satisfies readonly (keyof Vehicle)[];

function vehicleChanged(before: Vehicle, after: Vehicle): boolean {
  return VEHICLE_FIELDS.some((field) => {
    const a = before[field];
    const b = after[field];
    if (a instanceof Date || b instanceof Date) {
      return (a as Date | null)?.getTime() !== (b as Date | null)?.getTime();
    }
    return a !== b;
  });
}
