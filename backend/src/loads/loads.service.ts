import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLoadDto } from './dto/create-load.dto';
import { UpdateLoadDto } from './dto/update-load.dto';
import { RegisterQueryDto } from './dto/register-query.dto';
import { LoadStatus, Prisma, PostulationStatus, TripStatus } from '@prisma/client';
import {
  computeFuelAndDeliveryMetrics,
  computeMoneyMetrics,
  round1,
  round2,
} from '../common/metrics';

type AuthUser = { id: string; role: string };

// Distancia en línea recta (km) entre dos puntos. Suficiente para ordenar
// cargas por cercanía a la zona de influencia del transportista (P12); no
// pretende exactitud de ruta (para eso está OSRM en common/routing).
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

type LoadListParams = {
  status?: LoadStatus;
  page?: number;
  limit?: number;
  shipperId?: string;
  cargoType?: string;
  q?: string;
  // Ciudad de recogida / entrega del padrón oficial, por id.
  originCityId?: string;
  destCityId?: string;
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
  // Si viene, las cargas se ordenan por cercanía del origen a este punto
  // (zona del transportista, P12) en lugar de por fecha de creación.
  prioritizeZone?: { lat: number; lng: number };
  // Cuántos se postularon es información del publicador: al transportista no
  // se le expone, ni siquiera en el payload, para no filtrar la competencia.
  hidePostulationCount?: boolean;
};

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
  'originCityId',
  'destAddress',
  'destLat',
  'destLng',
  'destCityId',
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

  /**
   * Las FK de ciudad llegan del cliente. `@IsUUID` valida el formato pero no la
   * existencia: sin este chequeo, un id inventado revienta en Prisma (P2003) y
   * el filtro global lo devuelve como 500 con el mensaje crudo del ORM.
   */
  private async assertCitiesExist(dto: { originCityId?: string; destCityId?: string }) {
    const pairs = [
      ['originCityId', dto.originCityId, 'origen'],
      ['destCityId', dto.destCityId, 'destino'],
    ] as const;

    for (const [, id, label] of pairs) {
      if (!id) continue;
      const exists = await this.prisma.city.count({ where: { id } });
      if (!exists) {
        throw new BadRequestException(
          `La ciudad de ${label} no existe en el padrón geográfico`,
        );
      }
    }
  }

  async create(shipperId: string, dto: CreateLoadDto) {
    await this.assertCitiesExist(dto);
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

  async findAll(params?: LoadListParams) {
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
    if (params?.originCityId) where.originCityId = params.originCityId;
    if (params?.destCityId) where.destCityId = params.destCityId;
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

    const include = {
      shipper: { select: { id: true, firstName: true, lastName: true, companyName: true } },
      trip: { select: { id: true, status: true, carrierId: true } },
      _count: {
        select: { postulations: { where: { status: 'PENDING' as const } } },
      },
    };
    const shape = ({ _count, ...rest }: any) => ({
      ...rest,
      // undefined desaparece al serializar: el transportista no recibe la clave.
      pendingPostulationsCount: params?.hidePostulationCount
        ? undefined
        : (_count?.postulations ?? 0),
    });

    // Priorización por zona de influencia (P12): cuando el transportista definió
    // una zona, ordenamos las cargas por cercanía del origen a ese punto
    // (haversine) y paginamos en memoria. Cap defensivo para no traer todo el
    // universo de cargas en un único query.
    if (params?.prioritizeZone) {
      const { lat, lng } = params.prioritizeZone;
      const all = await this.prisma.load.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      const sorted = all
        .map((l) => ({ l, d: haversineKm(lat, lng, l.originLat, l.originLng) }))
        .sort((a, b) => a.d - b.d)
        .map(({ l }) => shape(l));
      const total = sorted.length;
      const start = (page - 1) * limit;
      return {
        loads: sorted.slice(start, start + limit),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    const [loads, total] = await Promise.all([
      this.prisma.load.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.load.count({ where }),
    ]);

    return { loads: loads.map(shape), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Ciudades que efectivamente aparecen en las cargas que el usuario puede ver.
   * Alimenta el desplegable del filtro: ofrecer las 4.027 del padrón haría que
   * casi cualquier elección devolviera una tabla vacía.
   */
  async findFilterCities(user: { id: string; role: string }) {
    const scope: any =
      user.role === 'CARGO_GENERATOR'
        ? { shipperId: user.id }
        : user.role === 'TRANSPORTER'
          ? { status: LoadStatus.PUBLISHED }
          : {};

    const [origins, dests] = await Promise.all([
      this.prisma.load.groupBy({
        by: ['originCityId'],
        where: { ...scope, originCityId: { not: null } },
      }),
      this.prisma.load.groupBy({
        by: ['destCityId'],
        where: { ...scope, destCityId: { not: null } },
      }),
    ]);

    const originIds = origins.map((row) => row.originCityId as string);
    const destIds = dests.map((row) => row.destCityId as string);
    const cities = await this.prisma.city.findMany({
      where: { id: { in: [...new Set([...originIds, ...destIds])] } },
      select: {
        id: true, code: true, name: true, department: true, postalCode: true,
        lat: true, lng: true,
        province: { select: { id: true, name: true, country: true } },
      },
      orderBy: { name: 'asc' },
    });

    const shaped = new Map(
      cities.map(({ province, ...city }) => [
        city.id,
        {
          ...city,
          provinceId: province.id,
          provinceName: province.name,
          country: province.country,
        },
      ]),
    );
    const pick = (ids: string[]) =>
      ids.map((id) => shaped.get(id)).filter((city): city is NonNullable<typeof city> => !!city)
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    return { origin: pick(originIds), dest: pick(destIds) };
  }

  async findAvailable(
    carrierId: string,
    params?: Omit<LoadListParams, 'status' | 'prioritizeZone' | 'shipperId'>,
  ) {
    const carrier = await this.prisma.user.findUnique({
      where: { id: carrierId },
      select: { zoneLat: true, zoneLng: true },
    });
    const prioritizeZone =
      carrier?.zoneLat != null && carrier?.zoneLng != null
        ? { lat: carrier.zoneLat, lng: carrier.zoneLng }
        : undefined;
    return this.findAll({
      ...params,
      status: LoadStatus.PUBLISHED,
      prioritizeZone,
      hidePostulationCount: true,
    });
  }

  async findById(id: string, viewerRole?: string) {
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
      // Mismo criterio que en el listado: al transportista no se le manda.
      pendingPostulationsCount:
        viewerRole === 'TRANSPORTER' ? undefined : (_count?.postulations ?? 0),
    };
  }

  async update(id: string, userId: string, dto: UpdateLoadDto) {
    await this.assertCitiesExist(dto);
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

  /**
   * Métricas del dador de carga logueado: estado de sus cargas, qué tan rápido
   * consiguen transportista, puntualidad de las entregas que recibió y cuánto
   * gastó en fletes. Alimenta el panel del shipper.
   */
  async getShipperMetrics(shipperId: string) {
    const now = new Date();

    const loads = await this.prisma.load.findMany({
      where: { shipperId },
      select: {
        status: true,
        price: true,
        cargoType: true,
        createdAt: true,
        deliveryDate: true,
        _count: { select: { postulations: true } },
        // El precio pactado vive acá, no en load.price — ver resolveTripPrice().
        postulations: {
          where: { status: PostulationStatus.ACCEPTED },
          select: { proposedPrice: true },
          take: 1,
        },
        trip: {
          select: {
            status: true,
            createdAt: true,
            completedAt: true,
            distanceKm: true,
            carrier: {
              select: { id: true, firstName: true, lastName: true, companyName: true },
            },
          },
        },
      },
    });

    // Los helpers puros de common/metrics trabajan sobre viajes, así que
    // reconstruimos esa forma desde las cargas (que es como consultamos acá).
    const trips = loads.flatMap((l) =>
      l.trip
        ? [
            {
              status: l.trip.status,
              completedAt: l.trip.completedAt,
              distanceKm: l.trip.distanceKm,
              fuelLiters: null,
              load: {
                deliveryDate: l.deliveryDate,
                price: l.price,
                postulations: l.postulations,
              },
            },
          ]
        : [],
    );

    const byStatus = (status: LoadStatus) =>
      loads.filter((l) => l.status === status).length;

    // La tasa de asignación mide cuántas cargas consiguieron transportista.
    // Las canceladas no entran: el dador las bajó, no es que el mercado no
    // las tomó.
    const assignable = loads.filter((l) => l.status !== LoadStatus.CANCELLED);
    const assigned = assignable.filter((l) => l.trip);

    const assignmentHours = assigned.flatMap((l) =>
      l.trip ? [(l.trip.createdAt.getTime() - l.createdAt.getTime()) / 3_600_000] : [],
    );
    const avgHoursToAssignment = assignmentHours.length
      ? round1(assignmentHours.reduce((a, b) => a + b, 0) / assignmentHours.length)
      : null;

    const totalPostulations = loads.reduce((sum, l) => sum + l._count.postulations, 0);

    // Cuánto se corrió el precio pactado respecto del publicado. Solo mide las
    // cargas que salieron con precio: en las "a convenir" no hay referencia.
    const negotiationDeltas = loads.flatMap((l) => {
      const agreed = l.postulations[0]?.proposedPrice;
      if (l.price == null || l.price <= 0 || agreed == null) return [];
      return [(agreed - l.price) / l.price];
    });
    const avgNegotiationDelta = negotiationDeltas.length
      ? negotiationDeltas.reduce((a, b) => a + b, 0) / negotiationDeltas.length
      : null;

    const { onTimeDeliveries, lateDeliveries, onTimeRate, totalDistanceKm } =
      computeFuelAndDeliveryMetrics(trips, now);
    const money = computeMoneyMetrics(trips, now);

    // Ranking de transportistas: con quiénes viene trabajando y cuánto les pagó.
    const carriers = new Map<
      string,
      { id: string; name: string; completedTrips: number; totalSpend: number; avgRating: number | null }
    >();
    for (const l of loads) {
      if (!l.trip || l.trip.status !== TripStatus.COMPLETED || !l.trip.carrier) continue;
      const c = l.trip.carrier;
      const entry = carriers.get(c.id) ?? {
        id: c.id,
        name: c.companyName || `${c.firstName} ${c.lastName}`,
        completedTrips: 0,
        totalSpend: 0,
        avgRating: null,
      };
      entry.completedTrips += 1;
      entry.totalSpend += l.postulations[0]?.proposedPrice ?? l.price ?? 0;
      carriers.set(c.id, entry);
    }

    // Calificación que este dador le puso a cada transportista, para que el
    // ranking no sea solo volumen.
    if (carriers.size) {
      const ratings = await this.prisma.rating.groupBy({
        by: ['toUserId'],
        where: { fromUserId: shipperId, toUserId: { in: [...carriers.keys()] } },
        _avg: { score: true },
      });
      for (const r of ratings) {
        const entry = carriers.get(r.toUserId);
        if (entry) entry.avgRating = r._avg.score;
      }
    }

    const topCarriers = [...carriers.values()]
      .map((c) => ({ ...c, totalSpend: round2(c.totalSpend) }))
      .sort((a, b) => b.completedTrips - a.completedTrips || b.totalSpend - a.totalSpend)
      .slice(0, 5);

    // En qué tipo de carga se le va el presupuesto.
    const byCargoType = new Map<string, { cargoType: string; trips: number; amount: number }>();
    for (const l of loads) {
      if (!l.trip || l.trip.status !== TripStatus.COMPLETED) continue;
      const entry = byCargoType.get(l.cargoType) ?? {
        cargoType: l.cargoType,
        trips: 0,
        amount: 0,
      };
      entry.trips += 1;
      entry.amount += l.postulations[0]?.proposedPrice ?? l.price ?? 0;
      byCargoType.set(l.cargoType, entry);
    }
    const spendByCargoType = [...byCargoType.values()]
      .map((c) => ({ ...c, amount: round2(c.amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    return {
      totalLoads: loads.length,
      publishedLoads: byStatus(LoadStatus.PUBLISHED),
      assignedLoads: byStatus(LoadStatus.ASSIGNED),
      inTransitLoads: byStatus(LoadStatus.IN_TRANSIT),
      deliveredLoads: byStatus(LoadStatus.DELIVERED),
      cancelledLoads: byStatus(LoadStatus.CANCELLED),
      // null cuando todavía no publicó nada medible, para no mostrar 0%.
      assignmentRate: assignable.length ? assigned.length / assignable.length : null,
      avgHoursToAssignment,
      avgPostulationsPerLoad: loads.length
        ? round1(totalPostulations / loads.length)
        : null,
      onTimeDeliveries,
      lateDeliveries,
      onTimeRate,
      totalDistanceKm,
      avgNegotiationDelta,
      negotiatedLoads: negotiationDeltas.length,
      ...money,
      topCarriers,
      spendByCargoType,
    };
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
