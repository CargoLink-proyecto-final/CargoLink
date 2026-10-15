import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { DocumentStatus, DocumentType } from '@prisma/client';
import { TransporterProfileService } from './transporter-profile.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('fs/promises');

describe('TransporterProfileService', () => {
  let service: TransporterProfileService;
  let prisma: {
    document: {
      upsert: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
      updateMany: jest.Mock;
    };
    vehicle: { upsert: jest.Mock; findUnique: jest.Mock };
    user: { findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      document: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        updateMany: jest.fn(),
      },
      vehicle: { upsert: jest.fn(), findUnique: jest.fn() },
      user: { findUnique: jest.fn(), update: jest.fn() },
      // Transacción interactiva: el callback recibe el mismo mock como tx.
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransporterProfileService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('./uploads') } },
      ],
    }).compile();

    service = module.get(TransporterProfileService);

    (mkdir as jest.Mock).mockResolvedValue(undefined);
    (writeFile as jest.Mock).mockResolvedValue(undefined);
    (unlink as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => jest.clearAllMocks());

  describe('uploadDocument', () => {
    const file = { mimetype: 'image/jpeg', buffer: Buffer.from('fake') } as Express.Multer.File;

    it('writes the file to disk and upserts the Document row', async () => {
      prisma.document.upsert.mockResolvedValue({ id: 'doc-1', type: DocumentType.DNI_FRONT });

      const result = await service.uploadDocument('user-1', DocumentType.DNI_FRONT, file);

      expect(mkdir).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalled();
      expect(prisma.document.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_type: { userId: 'user-1', type: DocumentType.DNI_FRONT } },
        }),
      );
      expect(result).toEqual({ id: 'doc-1', type: DocumentType.DNI_FRONT });
    });

    it('sends a re-uploaded document back to review and clears the previous verdict', async () => {
      prisma.document.upsert.mockResolvedValue({ id: 'doc-1', type: DocumentType.VTV });

      await service.uploadDocument('user-1', DocumentType.VTV, file);

      expect(prisma.document.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            status: 'PENDING',
            rejectionReason: null,
            reviewedAt: null,
            reviewedById: null,
          }),
        }),
      );
    });

    it('rejects a mimetype outside the allowlist', async () => {
      const badFile = { mimetype: 'application/zip', buffer: Buffer.from('x') } as Express.Multer.File;

      await expect(
        service.uploadDocument('user-1', DocumentType.DNI_FRONT, badFile),
      ).rejects.toThrow(BadRequestException);
      expect(writeFile).not.toHaveBeenCalled();
    });
  });

  describe('getDocumentFile', () => {
    it('returns the path for the document owner', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        userId: 'user-1',
        fileUrl: 'user-1/DNI_FRONT.jpg',
      });

      const result = await service.getDocumentFile('doc-1', 'user-1', 'TRANSPORTER');
      expect(result.contentType).toBe('image/jpeg');
    });

    it('allows an ADMIN to fetch a document owned by someone else', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        userId: 'user-1',
        fileUrl: 'user-1/DNI_FRONT.jpg',
      });

      await expect(service.getDocumentFile('doc-1', 'admin-1', 'ADMIN')).resolves.toBeDefined();
    });

    it('rejects a requester who is neither the owner nor an ADMIN', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        userId: 'user-1',
        fileUrl: 'user-1/DNI_FRONT.jpg',
      });

      await expect(
        service.getDocumentFile('doc-1', 'someone-else', 'TRANSPORTER'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when the document does not exist', async () => {
      prisma.document.findUnique.mockResolvedValue(null);
      await expect(service.getDocumentFile('missing', 'user-1', 'TRANSPORTER')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteDocument', () => {
    it('deletes the row and best-effort removes the file', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        userId: 'user-1',
        fileUrl: 'user-1/DNI_FRONT.jpg',
      });
      prisma.document.delete.mockResolvedValue({ id: 'doc-1' });

      const result = await service.deleteDocument('doc-1', 'user-1');

      expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
      expect(unlink).toHaveBeenCalled();
      expect(result).toEqual({ deleted: true });
    });

    it('rejects deleting a document that belongs to someone else', async () => {
      prisma.document.findUnique.mockResolvedValue({ id: 'doc-1', userId: 'user-1', fileUrl: 'x' });
      await expect(service.deleteDocument('doc-1', 'someone-else')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('upsertVehicle', () => {
    const dto = {
      plate: 'AB123CD',
      brand: 'Mercedes-Benz',
      model: 'Actros',
      year: 2019,
      unit: 'CHASIS',
      bodyType: 'CERRADA',
      maxWeightKg: 12000,
    } as any;

    it('creates/updates the vehicle when the plate is free', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(null);
      prisma.vehicle.upsert.mockResolvedValue({ id: 'vehicle-1', ...dto });

      const result = await service.upsertVehicle('user-1', dto);
      expect(result).toEqual({ id: 'vehicle-1', ...dto });
      // Alta de vehículo: no hay documentos aprobados contra datos viejos.
      expect(prisma.document.updateMany).not.toHaveBeenCalled();
    });

    it('sends approved vehicle documents back to review when the vehicle changes', async () => {
      const existing = { id: 'vehicle-1', userId: 'user-1', ...dto };
      prisma.vehicle.findUnique.mockResolvedValue(existing);
      prisma.vehicle.upsert.mockResolvedValue({ ...existing, maxWeightKg: 15000 });

      await service.upsertVehicle('user-1', { ...dto, maxWeightKg: 15000 });

      expect(prisma.document.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            type: { in: ['VEHICLE_CARD', 'INSURANCE', 'VTV'] },
            status: 'APPROVED',
          },
          data: expect.objectContaining({ status: 'PENDING', reviewedById: null }),
        }),
      );
    });

    it('rejects a plate already used by another transporter', async () => {
      prisma.vehicle.findUnique.mockResolvedValue({ id: 'vehicle-2', userId: 'someone-else' });
      await expect(service.upsertVehicle('user-1', dto)).rejects.toThrow(ConflictException);
      expect(prisma.vehicle.upsert).not.toHaveBeenCalled();
    });

    it('allows re-saving your own plate without re-opening the review', async () => {
      const existing = { id: 'vehicle-1', userId: 'user-1', ...dto };
      prisma.vehicle.findUnique.mockResolvedValue(existing);
      prisma.vehicle.upsert.mockResolvedValue(existing);

      await expect(service.upsertVehicle('user-1', dto)).resolves.toBeDefined();
      expect(prisma.document.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('acceptTerms', () => {
    it('stamps termsAcceptedAt and the given version', async () => {
      prisma.user.update.mockResolvedValue({ termsAcceptedAt: new Date(), termsAcceptedVersion: 'v1' });
      const result = await service.acceptTerms('user-1', 'v1');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ termsAcceptedVersion: 'v1' }),
        }),
      );
      expect(result.termsAcceptedVersion).toBe('v1');
    });
  });

  describe('getStatus', () => {
    it('delegates to computeProfileStatus with the current pieces', async () => {
      prisma.user.findUnique.mockResolvedValue({
        cuit: '20-12345678-3',
        licenseCategory: 'E1',
        licenseExpiresAt: new Date(),
        termsAcceptedAt: new Date(),
      });
      prisma.vehicle.findUnique.mockResolvedValue({ id: 'vehicle-1' });
      prisma.document.findMany.mockResolvedValue([
        { type: DocumentType.DNI_FRONT, status: DocumentStatus.PENDING },
      ]);

      const status = await service.getStatus('user-1');
      expect(status.complete).toBe(false);
      expect(status.missing).toContain('document:DNI_BACK');
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.vehicle.findUnique.mockResolvedValue(null);
      prisma.document.findMany.mockResolvedValue([]);

      await expect(service.getStatus('missing-user')).rejects.toThrow(NotFoundException);
    });
  });
});
