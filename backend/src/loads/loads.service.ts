import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLoadDto } from './dto/create-load.dto';
import { UpdateLoadDto } from './dto/update-load.dto';
import { LoadStatus } from '@prisma/client';

@Injectable()
export class LoadsService {
  constructor(private prisma: PrismaService) {}

  async create(shipperId: string, dto: CreateLoadDto) {
    return this.prisma.load.create({
      data: {
        ...dto,
        pickupDate: new Date(dto.pickupDate),
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
        shipperId,
      },
      include: { shipper: { select: { id: true, firstName: true, lastName: true, companyName: true } } },
    });
  }

  async findAll(params?: {
    status?: LoadStatus;
    page?: number;
    limit?: number;
    shipperId?: string;
    cargoType?: string;
    minWeight?: number;
    maxWeight?: number;
    minPrice?: number;
    maxPrice?: number;
  }) {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const where: any = {};

    if (params?.status) where.status = params.status;
    if (params?.shipperId) where.shipperId = params.shipperId;
    if (params?.cargoType) where.cargoType = { contains: params.cargoType, mode: 'insensitive' };
    if (params?.minWeight || params?.maxWeight) {
      where.weight = {};
      if (params?.minWeight) where.weight.gte = params.minWeight;
      if (params?.maxWeight) where.weight.lte = params.maxWeight;
    }
    if (params?.minPrice || params?.maxPrice) {
      where.price = {};
      if (params?.minPrice) where.price.gte = params.minPrice;
      if (params?.maxPrice) where.price.lte = params.maxPrice;
    }

    const [loads, total] = await Promise.all([
      this.prisma.load.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          shipper: { select: { id: true, firstName: true, lastName: true, companyName: true } },
          trip: { select: { id: true, status: true, carrierId: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.load.count({ where }),
    ]);

    return { loads, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findAvailable(params?: { page?: number; limit?: number }) {
    return this.findAll({ ...params, status: LoadStatus.PUBLISHED });
  }

  async findById(id: string) {
    const load = await this.prisma.load.findUnique({
      where: { id },
      include: {
        shipper: { select: { id: true, firstName: true, lastName: true, companyName: true, phone: true } },
        trip: {
          include: {
            carrier: { select: { id: true, firstName: true, lastName: true, companyName: true, phone: true } },
          },
        },
      },
    });
    if (!load) throw new NotFoundException('Carga no encontrada');
    return load;
  }

  async update(id: string, userId: string, dto: UpdateLoadDto) {
    const load = await this.findById(id);
    if (load.shipperId !== userId) {
      throw new ForbiddenException('Solo puedes editar tus propias cargas');
    }
    if (load.status !== LoadStatus.PUBLISHED) {
      throw new ForbiddenException('Solo se pueden editar cargas publicadas');
    }
    return this.prisma.load.update({
      where: { id },
      data: {
        ...dto,
        pickupDate: dto.pickupDate ? new Date(dto.pickupDate) : undefined,
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
      },
      include: {
        shipper: { select: { id: true, firstName: true, lastName: true, companyName: true } },
        trip: { select: { id: true, status: true, carrierId: true } },
      },
    });
  }

  async cancel(id: string, userId: string) {
    const load = await this.findById(id);
    if (load.shipperId !== userId) {
      throw new ForbiddenException('Solo puedes cancelar tus propias cargas');
    }
    return this.prisma.load.update({
      where: { id },
      data: { status: LoadStatus.CANCELLED },
    });
  }
}
