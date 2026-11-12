import { Injectable } from '@nestjs/common';
import { DocumentStatus, LoadStatus, PostulationStatus, Role, TripStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  EXPIRY_WARNING_DAYS,
  computeExpiryAlerts,
  computeMarketplaceMetrics,
  computeMonthlySignups,
  computeTripMetrics,
  computeVerificationMetrics,
} from './platform-metrics';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Ventana de las tasas (asignación, puntualidad, cancelación...). */
export const WINDOW_DAYS = 90;
/** Largo de las series mensuales. */
export const SERIES_MONTHS = 6;
/** "Activo" = hizo algo en la plataforma en este plazo. */
export const ACTIVE_USER_DAYS = 30;

const fullName = (u: { firstName: string; lastName: string; companyName?: string | null }) =>
  u.companyName || `${u.firstName} ${u.lastName}`.trim();

/**
 * Métricas de uso de toda la plataforma para el panel del admin.
 *
 * Los cálculos viven en funciones puras (`platform-metrics.ts`); acá solo se
 * traen de la DB los campos mínimos. Los conteos simples van con `count` /
 * `groupBy` en la DB; lo que necesita diferencias de fechas trae las filas de
 * la ventana, acotadas por fecha.
 */
@Injectable()
export class PlatformMetricsService {
  constructor(private prisma: PrismaService) {}

  async getMetrics(now = new Date()) {
    const windowStart = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
    const seriesStart = new Date(now.getFullYear(), now.getMonth() - (SERIES_MONTHS - 1), 1);
    const activeSince = new Date(now.getTime() - ACTIVE_USER_DAYS * DAY_MS);
    const expiryLimit = new Date(now.getTime() + EXPIRY_WARNING_DAYS * DAY_MS);
    const notDeleted = { deletedAt: null };

    const [
      usersByRole,
      signups,
      loads,
      trips,
      tripsInProgress,
      loadsOpen,
      pendingDocs,
      reviewedDocs,
      transportersWithExpiry,
      ratings,
      activeShippers,
      activeTransporters,
    ] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], where: notDeleted, _count: { _all: true } }),
      this.prisma.user.findMany({
        where: { ...notDeleted, createdAt: { gte: seriesStart } },
        select: { role: true, createdAt: true },
      }),
      this.prisma.load.findMany({
        where: { createdAt: { gte: windowStart } },
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          shipper: { select: { firstName: true, lastName: true, companyName: true } },
          trip: { select: { id: true } },
          postulations: { select: { createdAt: true, counterOfferPrice: true } },
        },
      }),
      this.prisma.trip.findMany({
        where: { OR: [{ createdAt: { gte: windowStart } }, { completedAt: { gte: seriesStart } }] },
        select: {
          status: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
          distanceKm: true,
          fuelLiters: true,
          load: {
            select: {
              deliveryDate: true,
              price: true,
              postulations: {
                where: { status: PostulationStatus.ACCEPTED },
                select: { proposedPrice: true },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma.trip.count({ where: { status: TripStatus.IN_PROGRESS } }),
      this.prisma.load.count({ where: { status: LoadStatus.PUBLISHED } }),
      this.prisma.document.findMany({
        where: { status: DocumentStatus.PENDING },
        select: { status: true, createdAt: true, reviewedAt: true },
      }),
      this.prisma.document.findMany({
        where: { reviewedAt: { gte: windowStart }, status: { not: DocumentStatus.PENDING } },
        select: { status: true, createdAt: true, reviewedAt: true },
      }),
      this.prisma.user.findMany({
        where: {
          ...notDeleted,
          isActive: true,
          role: Role.TRANSPORTER,
          OR: [
            { licenseExpiresAt: { lte: expiryLimit } },
            { vehicle: { insuranceExpiresAt: { lte: expiryLimit } } },
            { vehicle: { vtvExpiresAt: { lte: expiryLimit } } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          licenseExpiresAt: true,
          vehicle: { select: { insuranceExpiresAt: true, vtvExpiresAt: true } },
        },
      }),
      this.prisma.rating.aggregate({
        where: { createdAt: { gte: windowStart } },
        _avg: { score: true },
        _count: { _all: true },
      }),
      this.prisma.load.findMany({
        where: { createdAt: { gte: activeSince } },
        select: { shipperId: true },
        distinct: ['shipperId'],
      }),
      Promise.all([
        this.prisma.postulation.findMany({
          where: { createdAt: { gte: activeSince } },
          select: { transporterId: true },
          distinct: ['transporterId'],
        }),
        this.prisma.trip.findMany({
          where: { updatedAt: { gte: activeSince } },
          select: { carrierId: true },
          distinct: ['carrierId'],
        }),
      ]),
    ]);

    const [postulants, carriers] = activeTransporters;
    const activeTransporterIds = new Set([
      ...postulants.map((p) => p.transporterId),
      ...carriers.map((t) => t.carrierId),
    ]);

    const marketplace = computeMarketplaceMetrics(
      loads.map((l) => ({
        id: l.id,
        title: l.title,
        status: l.status,
        createdAt: l.createdAt,
        shipperName: fullName(l.shipper),
        hasTrip: l.trip != null,
        postulations: l.postulations,
      })),
      now,
    );

    return {
      generatedAt: now.toISOString(),
      windowDays: WINDOW_DAYS,
      users: {
        byRole: Object.fromEntries(usersByRole.map((r) => [r.role, r._count._all])),
        total: usersByRole.reduce((sum, r) => sum + r._count._all, 0),
        activeLast30Days: {
          shippers: activeShippers.length,
          transporters: activeTransporterIds.size,
        },
        monthlySignups: computeMonthlySignups(signups, now, SERIES_MONTHS),
      },
      now: { loadsOpen, tripsInProgress },
      marketplace,
      trips: computeTripMetrics(trips, now, windowStart, SERIES_MONTHS),
      verification: computeVerificationMetrics(pendingDocs, reviewedDocs, now),
      expiryAlerts: computeExpiryAlerts(
        transportersWithExpiry.map((t) => ({ ...t, name: fullName(t) })),
        now,
      ),
      ratings: {
        average: ratings._avg.score == null ? null : Math.round(ratings._avg.score * 10) / 10,
        count: ratings._count._all,
      },
    };
  }
}
