import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { TransporterProfileController } from './transporter-profile.controller';
import { TransporterProfileService } from './transporter-profile.service';

describe('TransporterProfileController', () => {
  let controller: TransporterProfileController;
  let service: {
    uploadDocument: jest.Mock;
    listDocuments: jest.Mock;
    getDocumentFile: jest.Mock;
    deleteDocument: jest.Mock;
    upsertVehicle: jest.Mock;
    getVehicle: jest.Mock;
    acceptTerms: jest.Mock;
    getStatus: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      uploadDocument: jest.fn(),
      listDocuments: jest.fn(),
      getDocumentFile: jest.fn(),
      deleteDocument: jest.fn(),
      upsertVehicle: jest.fn(),
      getVehicle: jest.fn(),
      acceptTerms: jest.fn(),
      getStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransporterProfileController],
      providers: [{ provide: TransporterProfileService, useValue: service }],
    }).compile();

    controller = module.get(TransporterProfileController);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  describe('uploadDocument', () => {
    it('delegates to service.uploadDocument with userId, type and the file', async () => {
      const file = { mimetype: 'image/jpeg' } as Express.Multer.File;
      service.uploadDocument.mockResolvedValue({ id: 'doc-1' });

      const result = await controller.uploadDocument(file, { type: DocumentType.DNI_FRONT }, 'user-1');

      expect(service.uploadDocument).toHaveBeenCalledWith('user-1', DocumentType.DNI_FRONT, file);
      expect(result).toEqual({ id: 'doc-1' });
    });

    it('rejects when multer did not attach a file', () => {
      expect(() =>
        controller.uploadDocument(undefined as any, { type: DocumentType.DNI_FRONT }, 'user-1'),
      ).toThrow(BadRequestException);
      expect(service.uploadDocument).not.toHaveBeenCalled();
    });
  });

  describe('listDocuments', () => {
    it('delegates to service.listDocuments with userId', async () => {
      service.listDocuments.mockResolvedValue([]);
      const result = await controller.listDocuments('user-1');
      expect(service.listDocuments).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([]);
    });
  });

  describe('getDocumentFile', () => {
    it('streams the resolved file with its content-type', async () => {
      service.getDocumentFile.mockResolvedValue({
        absolutePath: '/uploads/user-1/DNI_FRONT.jpg',
        contentType: 'image/jpeg',
      });
      const res = { setHeader: jest.fn(), sendFile: jest.fn() } as any;

      await controller.getDocumentFile('doc-1', { id: 'user-1', role: 'TRANSPORTER' }, res);

      expect(service.getDocumentFile).toHaveBeenCalledWith('doc-1', 'user-1', 'TRANSPORTER');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(res.sendFile).toHaveBeenCalledWith('/uploads/user-1/DNI_FRONT.jpg');
    });
  });

  describe('deleteDocument', () => {
    it('delegates to service.deleteDocument with id and userId', async () => {
      service.deleteDocument.mockResolvedValue({ deleted: true });
      const result = await controller.deleteDocument('doc-1', 'user-1');
      expect(service.deleteDocument).toHaveBeenCalledWith('doc-1', 'user-1');
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('upsertVehicle', () => {
    it('delegates to service.upsertVehicle with userId and dto', async () => {
      const dto = { plate: 'AB123CD' } as any;
      service.upsertVehicle.mockResolvedValue({ id: 'vehicle-1' });
      const result = await controller.upsertVehicle('user-1', dto);
      expect(service.upsertVehicle).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual({ id: 'vehicle-1' });
    });
  });

  describe('getVehicle', () => {
    it('delegates to service.getVehicle with userId', async () => {
      service.getVehicle.mockResolvedValue(null);
      const result = await controller.getVehicle('user-1');
      expect(service.getVehicle).toHaveBeenCalledWith('user-1');
      expect(result).toBeNull();
    });
  });

  describe('acceptTerms', () => {
    it('delegates to service.acceptTerms with userId and version', async () => {
      service.acceptTerms.mockResolvedValue({ termsAcceptedVersion: 'v1' });
      const result = await controller.acceptTerms('user-1', { version: 'v1' });
      expect(service.acceptTerms).toHaveBeenCalledWith('user-1', 'v1');
      expect(result).toEqual({ termsAcceptedVersion: 'v1' });
    });
  });

  describe('getStatus', () => {
    it('delegates to service.getStatus with userId', async () => {
      service.getStatus.mockResolvedValue({ complete: true, missing: [] });
      const result = await controller.getStatus('user-1');
      expect(service.getStatus).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ complete: true, missing: [] });
    });
  });
});
