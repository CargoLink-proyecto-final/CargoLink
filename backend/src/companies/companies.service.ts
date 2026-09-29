import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JoinRequestStatus, PostulationStatus, TripStatus } from '@prisma/client';
import { computeFuelAndDeliveryMetrics } from '../common/metrics';

// Campos públicos de un conductor — nunca exponemos password ni tokens.
const DRIVER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  avatarUrl: true,
} as const;

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  // ------------------------------------------------------------------
  // Directorio + lado transportista
  // ------------------------------------------------------------------

  /** Directorio de empresas para que un transportista elija a cuál postularse. */
  async listCompanies() {
    return this.prisma.company.findMany({
      // Sólo las que tienen a alguien del otro lado. Todo lo que administra una
      // empresa se resuelve por su titular, así que una empresa cuyo titular se
      // dio de baja no puede aprobar ni rechazar nada: ofrecerla sería mandar al
      // transportista a esperar una respuesta que no va a llegar.
      where: { owner: { isActive: true } },
      select: {
        id: true,
        name: true,
        _count: { select: { members: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /** Membresía actual del transportista + historial de solicitudes. */
  async getMyMembership(transporterId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: transporterId },
      select: { company: { select: { id: true, name: true } } },
    });
    const requests = await this.prisma.companyJoinRequest.findMany({
      where: { transporterId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        decidedAt: true,
        company: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { company: user?.company ?? null, requests };
  }

  /** El transportista pide unirse a una empresa (flujo request + approval). */
  async createJoinRequest(transporterId: string, companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { owner: { select: { isActive: true } } },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    // El directorio ya las filtra, pero el id puede llegar de un link viejo o de
    // una pantalla cargada antes de la baja del titular.
    if (!company.owner.isActive) {
      throw new ConflictException('La empresa ya no está activa');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: transporterId },
      select: { companyId: true },
    });
    if (user?.companyId) {
      throw new ConflictException('Ya pertenecés a una empresa');
    }

    const existing = await this.prisma.companyJoinRequest.findUnique({
      where: { companyId_transporterId: { companyId, transporterId } },
    });
    if (existing?.status === JoinRequestStatus.PENDING) {
      throw new ConflictException(
        'Ya tenés una solicitud pendiente para esta empresa',
      );
    }

    // Re-postulación: reutilizamos la fila (unique companyId+transporterId)
    // y la reseteamos a PENDING si antes fue rechazada.
    return this.prisma.companyJoinRequest.upsert({
      where: { companyId_transporterId: { companyId, transporterId } },
      create: { companyId, transporterId },
      update: { status: JoinRequestStatus.PENDING, decidedAt: null },
      select: {
        id: true,
        status: true,
        createdAt: true,
        company: { select: { id: true, name: true } },
      },
    });
  }

  /** El transportista cancela su propia solicitud pendiente. */
  async cancelJoinRequest(transporterId: string, requestId: string) {
    const request = await this.prisma.companyJoinRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.transporterId !== transporterId) {
      throw new NotFoundException('Solicitud no encontrada');
    }
    if (request.status !== JoinRequestStatus.PENDING) {
      throw new BadRequestException('La solicitud ya fue resuelta');
    }
    await this.prisma.companyJoinRequest.delete({ where: { id: requestId } });
    return { message: 'Solicitud cancelada' };
  }

  /** El transportista deja su empresa actual. */
  async leaveCompany(transporterId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: transporterId },
      select: { companyId: true },
    });
    if (!user?.companyId) {
      throw new BadRequestException('No pertenecés a ninguna empresa');
    }
    await this.prisma.user.update({
      where: { id: transporterId },
      data: { companyId: null },
    });
    return { message: 'Saliste de la empresa' };
  }

  // ------------------------------------------------------------------
  // Lado admin de empresa — todo scopeado a la empresa que el user posee
  // ------------------------------------------------------------------

  /** Resuelve la empresa que administra el usuario (owner). */
  private async getOwnedCompany(ownerId: string) {
    const company = await this.prisma.company.findUnique({
      where: { ownerId },
    });
    if (!company) {
      throw new NotFoundException('No tenés una empresa asociada');
    }
    return company;
  }

  async getMyCompany(ownerId: string) {
    const company = await this.getOwnedCompany(ownerId);
    const [memberCount, pendingRequests] = await Promise.all([
      this.prisma.user.count({ where: { companyId: company.id } }),
      this.prisma.companyJoinRequest.count({
        where: { companyId: company.id, status: JoinRequestStatus.PENDING },
      }),
    ]);
    return { ...company, memberCount, pendingRequests };
  }

  async listDrivers(ownerId: string) {
    const company = await this.getOwnedCompany(ownerId);
    return this.prisma.user.findMany({
      where: { companyId: company.id },
      select: DRIVER_SELECT,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  async removeDriver(ownerId: string, driverId: string) {
    const company = await this.getOwnedCompany(ownerId);
    const driver = await this.prisma.user.findUnique({
      where: { id: driverId },
      select: { companyId: true },
    });
    if (!driver || driver.companyId !== company.id) {
      throw new NotFoundException('Conductor no encontrado en tu empresa');
    }
    await this.prisma.user.update({
      where: { id: driverId },
      data: { companyId: null },
    });
    return { message: 'Conductor removido de la empresa' };
  }

  async listRequests(ownerId: string, status?: JoinRequestStatus) {
    const company = await this.getOwnedCompany(ownerId);
    return this.prisma.companyJoinRequest.findMany({
      where: { companyId: company.id, ...(status ? { status } : {}) },
      select: {
        id: true,
        status: true,
        createdAt: true,
        decidedAt: true,
        transporter: { select: DRIVER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async decideRequest(
    ownerId: string,
    requestId: string,
    decision: 'APPROVE' | 'REJECT',
  ) {
    const company = await this.getOwnedCompany(ownerId);
    const request = await this.prisma.companyJoinRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.companyId !== company.id) {
      throw new NotFoundException('Solicitud no encontrada');
    }
    if (request.status !== JoinRequestStatus.PENDING) {
      throw new BadRequestException('La solicitud ya fue resuelta');
    }

    if (decision === 'REJECT') {
      return this.prisma.companyJoinRequest.update({
        where: { id: requestId },
        data: { status: JoinRequestStatus.REJECTED, decidedAt: new Date() },
      });
    }

    // APPROVE: el transportista debe seguir libre antes de asignarlo.
    const transporter = await this.prisma.user.findUnique({
      where: { id: request.transporterId },
      select: { companyId: true },
    });
    if (transporter?.companyId) {
      throw new ConflictException(
        'El transportista ya pertenece a otra empresa',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: request.transporterId },
        data: { companyId: company.id },
      });
      return tx.companyJoinRequest.update({
        where: { id: requestId },
        data: { status: JoinRequestStatus.APPROVED, decidedAt: new Date() },
      });
    });
  }

  /** Viajes de todos los conductores de la empresa, con filtros. */
  async listCompanyTrips(
    ownerId: string,
    params: {
      status?: TripStatus;
      driverId?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const company = await this.getOwnedCompany(ownerId);
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;

    const where: any = { carrier: { companyId: company.id } };
    if (params.driverId) where.carrierId = params.driverId;
    if (params.status) where.status = params.status;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = new Date(params.from);
      if (params.to) where.createdAt.lte = new Date(params.to);
    }

    const [trips, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          load: {
            select: {
              id: true,
              title: true,
              originAddress: true,
              destAddress: true,
              price: true,
              deliveryDate: true,
            },
          },
          carrier: { select: DRIVER_SELECT },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.trip.count({ where }),
    ]);

    return { trips, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Performance de un conductor concreto de la empresa. */
  async getDriverStats(ownerId: string, driverId: string) {
    const company = await this.getOwnedCompany(ownerId);
    const driver = await this.prisma.user.findUnique({
      where: { id: driverId },
      select: { ...DRIVER_SELECT, companyId: true },
    });
    if (!driver || driver.companyId !== company.id) {
      throw new NotFoundException('Conductor no encontrado en tu empresa');
    }

    const trips = await this.prisma.trip.findMany({
      where: { carrierId: driverId },
      select: {
        status: true,
        completedAt: true,
        fuelLiters: true,
        distanceKm: true,
        load: {
          select: {
            price: true,
            deliveryDate: true,
            // El precio realmente pactado vive en la postulación aceptada:
            // accept() escribe ahí el finalPrice y nunca lo copia a load.price.
            // Sin esto, una carga publicada "a convenir" sumaría $0 a los
            // ingresos del conductor.
            postulations: {
              where: { status: PostulationStatus.ACCEPTED },
              select: { proposedPrice: true },
              take: 1,
            },
          },
        },
      },
    });

    const completed = trips.filter((t) => t.status === TripStatus.COMPLETED);
    const active = trips.filter(
      (t) =>
        t.status === TripStatus.IN_PROGRESS ||
        t.status === TripStatus.ACCEPTED ||
        t.status === TripStatus.PENDING,
    );
    // Precio del viaje: el pactado en la postulación aceptada; si el
    // transportista no propuso nada, aceptó el precio publicado.
    const totalRevenue = completed.reduce(
      (sum, t) => sum + (t.load?.postulations[0]?.proposedPrice ?? t.load?.price ?? 0),
      0,
    );

    // Puntualidad + combustible: mismo cómputo que el dashboard del transportista.
    const fuelAndDelivery = computeFuelAndDeliveryMetrics(trips, new Date());

    const ratingAgg = await this.prisma.rating.aggregate({
      where: { toUserId: driverId },
      _avg: { score: true },
      _count: { score: true },
    });

    const { companyId: _omit, ...driverInfo } = driver;
    return {
      driver: driverInfo,
      totalTrips: trips.length,
      completedTrips: completed.length,
      activeTrips: active.length,
      totalRevenue,
      avgRating: ratingAgg._avg.score,
      ratingsCount: ratingAgg._count.score,
      ...fuelAndDelivery,
    };
  }
}
