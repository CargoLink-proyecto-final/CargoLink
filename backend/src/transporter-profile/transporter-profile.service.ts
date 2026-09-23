import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { DocumentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertVehicleDto } from './dto/upsert-vehicle.dto';
import { computeProfileStatus } from './profile-completeness';

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
    // Absoluto siempre: `res.sendFile` (usado para servir el archivo) lo exige,
    // y en Docker UPLOAD_DIR ya viene absoluto (/app/uploads) — esto solo
    // importa para el default relativo de dev local.
    this.uploadDir = resolve(configService.get<string>('UPLOAD_DIR', './uploads'));
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
      update: { fileUrl: relativePath, status: 'PENDING' },
    });
  }

  async listDocuments(userId: string) {
    return this.prisma.document.findMany({
      where: { userId },
      select: { id: true, type: true, status: true, createdAt: true, updatedAt: true },
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

    return this.prisma.vehicle.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data },
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
    const [user, vehicle, documents] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { cuit: true, licenseCategory: true, licenseExpiresAt: true, termsAcceptedAt: true },
      }),
      this.prisma.vehicle.findUnique({ where: { userId } }),
      this.prisma.document.findMany({ where: { userId }, select: { type: true } }),
    ]);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    return computeProfileStatus({
      user,
      hasVehicle: !!vehicle,
      documentTypes: documents.map((d) => d.type),
    });
  }
}
