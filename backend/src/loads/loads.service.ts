import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLoadDto } from './dto/create-load.dto';
import { UpdateLoadDto } from './dto/update-load.dto';
import { RegisterQueryDto } from './dto/register-query.dto';
import { LoadStatus, Prisma } from '@prisma/client';

type AuthUser = { id: string; role: string };

function applyDateRange(where: any, field: string, from?: string, to?: string) {
  if (!from && !to) return;
  const range: any = {};
  if (from) range.gte = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  where[field] = range;
}

const EXPORT_CAP = 5000;
const DEFAULT_TERMINAL_STATUSES: LoadStatus[] = [
  LoadStatus.DELIVERED,
  LoadStatus.CANCELLED,
];

// Campos "críticos" de una carga: definen el compromiso que el transportista aceptó
// (mercadería, peso, fechas, origen, destino, precio). Una vez que hay una postulación
// aceptada quedan bloqueados; solo se puede retocar título y descripción.
const CRITICAL_LOAD_FIELDS = [
  'originAddress',
  'originLat',
  'originLng',
  'destAddress',
  'destLat',
  'destLng',
  'cargoType',
  'weight',
  'volume',
  'pickupDate',
  'deliveryDate',
  'price',
] as const;

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
    q?: string;
    minWeight?: number;
    maxWeight?: number;
    minPrice?: number;
    maxPrice?: number;
    createdFrom?: string;
    createdTo?: string;
    pickupFrom?: string;
    pickupTo?: string;
    deliveryFrom?: string;
    deliveryTo?: string;
  }) {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const where: any = {};

    if (params?.status) where.status = params.status;
    if (params?.shipperId) where.shipperId = params.shipperId;
    if (params?.cargoType) where.cargoType = { contains: params.cargoType, mode: 'insensitive' };
    if (params?.q) {
      const q = params.q;
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { originAddress: { contains: q, mode: 'insensitive' } },
            { destAddress: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }
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
    applyDateRange(where, 'createdAt', params?.createdFrom, params?.createdTo);
    applyDateRange(where, 'pickupDate', params?.pickupFrom, params?.pickupTo);
    applyDateRange(where, 'deliveryDate', params?.deliveryFrom, params?.deliveryTo);

    const [loads, total] = await Promise.all([
      this.prisma.load.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          shipper: { select: { id: true, firstName: true, lastName: true, companyName: true } },
          trip: { select: { id: true, status: true, carrierId: true } },
          _count: {
            select: { postulations: { where: { status: 'PENDING' } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.load.count({ where }),
    ]);

    const shaped = loads.map(({ _count, ...rest }) => ({
      ...rest,
      pendingPostulationsCount: _count?.postulations ?? 0,
    }));

    return { loads: shaped, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findAvailable(params?: { page?: number; limit?: number }) {
    return this.findAll({ ...params, status: LoadStatus.PUBLISHED });
  }

  async findById(id: string) {
    const load = await this.prisma.load.findUnique({
      where: { id },
      include: {
        shipper: { select: { id: true, firstName: true, lastName: true, companyName: true, industry: true, phone: true } },
        trip: {
          include: {
            carrier: { select: { id: true, firstName: true, lastName: true, companyName: true, phone: true } },
            ratings: true,
          },
        },
        _count: {
          select: { postulations: { where: { status: 'PENDING' } } },
        },
      },
    });
    if (!load) throw new NotFoundException('Carga no encontrada');
    const { _count, ...rest } = load;
    return {
      ...rest,
      pendingPostulationsCount: _count?.postulations ?? 0,
    };
  }

  async update(id: string, userId: string, dto: UpdateLoadDto) {
    const load = await this.findById(id);
    if (load.shipperId !== userId) {
      throw new ForbiddenException('Solo puedes editar tus propias cargas');
    }
    if (load.status === LoadStatus.DELIVERED || load.status === LoadStatus.CANCELLED) {
      throw new ForbiddenException('No se puede editar una carga finalizada o cancelada');
    }
    // "Postulación aceptada" ⟺ la carga ya está asignada o en viaje: los campos críticos
    // quedan bloqueados (solo se permiten título y descripción).
    const hasAcceptedPostulation =
      load.status === LoadStatus.ASSIGNED || load.status === LoadStatus.IN_TRANSIT;
    if (hasAcceptedPostulation) {
      const attempted = CRITICAL_LOAD_FIELDS.filter(
        (field) => (dto as Record<string, unknown>)[field] !== undefined,
      );
      if (attempted.length) {
        throw new ForbiddenException(
          'La carga tiene una postulación aceptada: solo podés editar el título y la descripción.',
        );
      }
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

  async getRegister(authUser: AuthUser, query: RegisterQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const where = this.buildRegisterWhere(authUser, query);

    const [rows, total] = await Promise.all([
      this.prisma.load.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          shipper: { select: { id: true, firstName: true, lastName: true, companyName: true, email: true, phone: true } },
          trip: {
            include: {
              carrier: { select: { id: true, firstName: true, lastName: true, companyName: true, email: true, phone: true } },
              messages: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { content: true, createdAt: true, senderId: true },
              },
              _count: { select: { messages: true } },
            },
          },
        },
      }),
      this.prisma.load.count({ where }),
    ]);

    const items = rows.map((load) => this.shapeRegisterItem(load));
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getRegisterForExport(authUser: AuthUser, query: RegisterQueryDto) {
    const where = this.buildRegisterWhere(authUser, query);
    const total = await this.prisma.load.count({ where });
    if (total > EXPORT_CAP) {
      throw new PayloadTooLargeException(
        `Demasiados resultados (${total}). Afiná los filtros (máx ${EXPORT_CAP}).`,
      );
    }
    return this.prisma.load.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        shipper: { select: { id: true, firstName: true, lastName: true, companyName: true, email: true, phone: true } },
        trip: {
          include: {
            carrier: { select: { id: true, firstName: true, lastName: true, companyName: true, email: true, phone: true } },
            messages: {
              orderBy: { createdAt: 'asc' },
              include: { sender: { select: { id: true, firstName: true, lastName: true } } },
            },
          },
        },
      },
    });
  }

  private shapeRegisterItem(load: any) {
    const trip = load.trip
      ? {
          id: load.trip.id,
          status: load.trip.status,
          startedAt: load.trip.startedAt,
          completedAt: load.trip.completedAt,
          notes: load.trip.notes,
          carrier: load.trip.carrier,
          messageCount: load.trip._count?.messages ?? 0,
          lastMessagePreview: load.trip.messages?.[0] ?? null,
        }
      : null;
    return {
      id: load.id,
      title: load.title,
      description: load.description,
      status: load.status,
      cargoType: load.cargoType,
      weight: load.weight,
      volume: load.volume,
      price: load.price,
      originAddress: load.originAddress,
      originLat: load.originLat,
      originLng: load.originLng,
      destAddress: load.destAddress,
      destLat: load.destLat,
      destLng: load.destLng,
      pickupDate: load.pickupDate,
      deliveryDate: load.deliveryDate,
      createdAt: load.createdAt,
      updatedAt: load.updatedAt,
      shipper: load.shipper,
      trip,
    };
  }

  private buildRegisterWhere(authUser: AuthUser, query: RegisterQueryDto): Prisma.LoadWhereInput {
    const statuses = query.statuses?.length ? query.statuses : DEFAULT_TERMINAL_STATUSES;
    const where: Prisma.LoadWhereInput = { status: { in: statuses } };

    if (authUser.role === 'CARGO_GENERATOR') {
      where.shipperId = authUser.id;
    } else if (authUser.role === 'TRANSPORTER') {
      where.trip = { carrierId: authUser.id };
    }

    if (query.from || query.to) {
      where.pickupDate = {};
      if (query.from) (where.pickupDate as any).gte = new Date(query.from);
      if (query.to) (where.pickupDate as any).lte = new Date(query.to);
    }

    const conditions: Prisma.LoadWhereInput[] = [];

    if (query.q) {
      conditions.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { cargoType: { contains: query.q, mode: 'insensitive' } },
          { originAddress: { contains: query.q, mode: 'insensitive' } },
          { destAddress: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }

    if (authUser.role === 'ADMIN' && query.participant) {
      const p = query.participant;
      conditions.push({
        OR: [
          { shipper: { firstName: { contains: p, mode: 'insensitive' } } },
          { shipper: { lastName: { contains: p, mode: 'insensitive' } } },
          { shipper: { companyName: { contains: p, mode: 'insensitive' } } },
          { trip: { is: { carrier: { firstName: { contains: p, mode: 'insensitive' } } } } },
          { trip: { is: { carrier: { lastName: { contains: p, mode: 'insensitive' } } } } },
          { trip: { is: { carrier: { companyName: { contains: p, mode: 'insensitive' } } } } },
        ],
      });
    }

    if (conditions.length) {
      where.AND = conditions;
    }

    return where;
  }
}
