import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TripStatus, LoadStatus, PostulationStatus } from '@prisma/client';
import { fetchRouteDistanceKm } from '../common/routing';
import { computeFuelAndDeliveryMetrics, computeMoneyMetrics } from '../common/metrics';

@Injectable()
export class TripsService {
  constructor(private prisma: PrismaService) {}

  async acceptLoad(carrierId: string, loadId: string) {
    const load = await this.prisma.load.findUnique({ where: { id: loadId } });
    if (!load) throw new NotFoundException('Carga no encontrada');
    if (load.status !== LoadStatus.PUBLISHED) {
      throw new BadRequestException('La carga ya no está disponible');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.load.update({
        where: { id: loadId },
        data: { status: LoadStatus.ASSIGNED },
      });

      return tx.trip.create({
        data: {
          loadId,
          carrierId,
          status: TripStatus.ACCEPTED,
        },
        include: {
          load: true,
          carrier: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });
  }

  async findAll(params?: {
    carrierId?: string;
    shipperId?: string;
    status?: TripStatus;
    page?: number;
    limit?: number;
  }) {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const where: any = {};

    if (params?.carrierId) where.carrierId = params.carrierId;
    if (params?.shipperId) where.load = { shipperId: params.shipperId };
    if (params?.status) where.status = params.status;

    const [trips, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          load: {
            include: {
              shipper: { select: { id: true, firstName: true, lastName: true, companyName: true } },
            },
          },
          carrier: { select: { id: true, firstName: true, lastName: true, companyName: true } },
          ratings: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.trip.count({ where }),
    ]);

    return { trips, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        load: {
          include: {
            shipper: { select: { id: true, firstName: true, lastName: true, companyName: true, phone: true } },
          },
        },
        carrier: { select: { id: true, firstName: true, lastName: true, companyName: true, phone: true } },
        ratings: true,
      },
    });
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    return trip;
  }

  async startTrip(id: string, carrierId: string) {
    const trip = await this.findById(id);
    if (trip.carrierId !== carrierId) {
      throw new ForbiddenException('No es tu viaje');
    }
    if (trip.status !== TripStatus.ACCEPTED) {
      throw new BadRequestException('El viaje no se puede iniciar');
    }

    return this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id },
        data: { status: TripStatus.IN_PROGRESS, startedAt: new Date() },
      }),
      this.prisma.load.update({
        where: { id: trip.loadId },
        data: { status: LoadStatus.IN_TRANSIT },
      }),
    ]);
  }

  async completeTrip(id: string, carrierId: string, fuelLiters?: number) {
    const trip = await this.findById(id);
    if (trip.carrierId !== carrierId) {
      throw new ForbiddenException('No es tu viaje');
    }
    if (trip.status !== TripStatus.IN_PROGRESS) {
      throw new BadRequestException('El viaje no está en progreso');
    }

    // La distancia se calcula en el backend con OSRM (la misma ruta que ve el
    // usuario en el mapa) para no depender de lo que mande el cliente. Es
    // best-effort: si OSRM falla, se guarda null y la métrica simplemente no
    // suma ese viaje.
    const distanceKm = trip.load
      ? await fetchRouteDistanceKm(
          trip.load.originLat,
          trip.load.originLng,
          trip.load.destLat,
          trip.load.destLng,
        )
      : null;

    return this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id },
        data: {
          status: TripStatus.COMPLETED,
          completedAt: new Date(),
          fuelLiters: fuelLiters ?? null,
          distanceKm,
        },
      }),
      this.prisma.load.update({
        where: { id: trip.loadId },
        data: { status: LoadStatus.DELIVERED },
      }),
    ]);
  }

  /**
   * Métricas del transportista logueado: combustible, puntualidad, ingresos y
   * conversión de postulaciones. Alimenta el panel de rendimiento.
   */
  async getCarrierMetrics(carrierId: string) {
    const [trips, postulationsByStatus, ratingAgg] = await Promise.all([
      this.prisma.trip.findMany({
        where: { carrierId },
        select: {
          status: true,
          completedAt: true,
          fuelLiters: true,
          distanceKm: true,
          load: {
            select: {
              deliveryDate: true,
              price: true,
              // El precio pactado vive en la postulación aceptada — ver
              // resolveTripPrice() en common/metrics.
              postulations: {
                where: { status: PostulationStatus.ACCEPTED },
                select: { proposedPrice: true },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma.postulation.groupBy({
        by: ['status'],
        where: { transporterId: carrierId },
        _count: { _all: true },
      }),
      this.prisma.rating.aggregate({
        where: { toUserId: carrierId },
        _avg: { score: true },
        _count: { score: true },
      }),
    ]);

    const now = new Date();
    const completedTrips = trips.filter(
      (t) => t.status === TripStatus.COMPLETED,
    ).length;

    const postulationsSent = postulationsByStatus.reduce(
      (sum, row) => sum + row._count._all,
      0,
    );
    const postulationsAccepted =
      postulationsByStatus.find((row) => row.status === PostulationStatus.ACCEPTED)
        ?._count._all ?? 0;

    return {
      completedTrips,
      ...computeFuelAndDeliveryMetrics(trips, now),
      ...computeMoneyMetrics(trips, now),
      postulationsSent,
      postulationsAccepted,
      // Cuántas de las postulaciones enviadas terminaron en viaje. null si
      // todavía no se postuló a nada, para no mostrar un 0% engañoso.
      postulationAcceptanceRate: postulationsSent
        ? postulationsAccepted / postulationsSent
        : null,
      avgRating: ratingAgg._avg.score,
      ratingsCount: ratingAgg._count.score,
    };
  }

  async updateLocation(id: string, carrierId: string, lat: number, lng: number) {
    const trip = await this.findById(id);
    if (trip.carrierId !== carrierId) {
      throw new ForbiddenException('No es tu viaje');
    }

    return this.prisma.trip.update({
      where: { id },
      data: { currentLat: lat, currentLng: lng },
    });
  }
}
