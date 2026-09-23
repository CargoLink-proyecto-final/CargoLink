import { Test, TestingModule } from '@nestjs/testing';
import { PostulationStatus } from '@prisma/client';
import { PostulationsController } from './postulations.controller';
import { PostulationsService } from './postulations.service';
import { PrismaService } from '../prisma/prisma.service';

// ProfileCompleteGuard (aplicado en create()) sólo se ejecuta cuando Nest
// procesa una request real vía HTTP — llamar a los métodos del controller
// directamente (como hacen estos tests) lo salta por completo. Pero como es
// una guard class y no un token, Nest igual necesita poder instanciarla al
// compilar el módulo de test, así que su dependencia (PrismaService) tiene
// que estar disponible como provider aunque nunca se use acá.

describe('PostulationsController', () => {
  let controller: PostulationsController;
  let service: {
    create: jest.Mock;
    listForLoad: jest.Mock;
    listMine: jest.Mock;
    accept: jest.Mock;
    counterOffer: jest.Mock;
    acceptOffer: jest.Mock;
    withdraw: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      listForLoad: jest.fn(),
      listMine: jest.fn(),
      accept: jest.fn(),
      counterOffer: jest.fn(),
      acceptOffer: jest.fn(),
      withdraw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostulationsController],
      providers: [
        { provide: PostulationsService, useValue: service },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<PostulationsController>(PostulationsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('delegates to service.create with loadId, userId and dto', async () => {
      const dto = { message: 'hola', proposedPrice: 120000 };
      service.create.mockResolvedValue({ id: 'p1' });

      const result = await controller.create('load-1', 'transporter-1', dto);

      expect(service.create).toHaveBeenCalledWith('load-1', 'transporter-1', dto);
      expect(result).toEqual({ id: 'p1' });
    });
  });

  describe('listForLoad', () => {
    it('delegates to service.listForLoad with loadId, user id and role', async () => {
      service.listForLoad.mockResolvedValue([]);
      const user = { id: 'shipper-1', role: 'CARGO_GENERATOR' };

      const result = await controller.listForLoad('load-1', user);

      expect(service.listForLoad).toHaveBeenCalledWith('load-1', 'shipper-1', 'CARGO_GENERATOR');
      expect(result).toEqual([]);
    });
  });

  describe('listMine', () => {
    it('delegates to service.listMine without a status filter', async () => {
      service.listMine.mockResolvedValue([{ id: 'p1' }]);
      const result = await controller.listMine('transporter-1');
      expect(service.listMine).toHaveBeenCalledWith('transporter-1', undefined);
      expect(result).toEqual([{ id: 'p1' }]);
    });

    it('passes through a status filter when provided', async () => {
      service.listMine.mockResolvedValue([]);
      await controller.listMine('transporter-1', PostulationStatus.ACCEPTED);
      expect(service.listMine).toHaveBeenCalledWith(
        'transporter-1',
        PostulationStatus.ACCEPTED,
      );
    });
  });

  describe('accept', () => {
    it('delegates to service.accept with id and userId', async () => {
      service.accept.mockResolvedValue({ postulation: {}, trip: {} });
      const result = await controller.accept('post-1', 'shipper-1');
      expect(service.accept).toHaveBeenCalledWith('post-1', 'shipper-1');
      expect(result).toEqual({ postulation: {}, trip: {} });
    });
  });

  describe('counterOffer', () => {
    it('delegates to service.counterOffer with id, user id, role and dto', async () => {
      const dto = { price: 110000 };
      const user = { id: 'shipper-1', role: 'CARGO_GENERATOR' };
      service.counterOffer.mockResolvedValue({ id: 'post-1' });

      const result = await controller.counterOffer('post-1', user, dto);

      expect(service.counterOffer).toHaveBeenCalledWith(
        'post-1',
        'shipper-1',
        'CARGO_GENERATOR',
        dto,
      );
      expect(result).toEqual({ id: 'post-1' });
    });
  });

  describe('acceptOffer', () => {
    it('delegates to service.acceptOffer with id and userId', async () => {
      service.acceptOffer.mockResolvedValue({ postulation: {}, trip: {} });
      const result = await controller.acceptOffer('post-1', 'transporter-1');
      expect(service.acceptOffer).toHaveBeenCalledWith('post-1', 'transporter-1');
      expect(result).toEqual({ postulation: {}, trip: {} });
    });
  });

  describe('withdraw', () => {
    it('delegates to service.withdraw with id and userId', async () => {
      service.withdraw.mockResolvedValue({ id: 'post-1', status: 'WITHDRAWN' });
      const result = await controller.withdraw('post-1', 'transporter-1');
      expect(service.withdraw).toHaveBeenCalledWith('post-1', 'transporter-1');
      expect(result).toEqual({ id: 'post-1', status: 'WITHDRAWN' });
    });
  });
});
