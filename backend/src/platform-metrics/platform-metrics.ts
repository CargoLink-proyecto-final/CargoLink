import { DocumentStatus, LoadStatus, Role, TripStatus } from '@prisma/client';
import { computeFuelAndDeliveryMetrics } from '../common/metrics';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Una carga publicada sin postulantes pasado este plazo es una alerta. */
export const UNANSWERED_LOAD_HOURS = 48;
/** Un documento sin revisar pasado este plazo es una alerta. */
export const STALE_DOCUMENT_HOURS = 48;
/** Vencimientos que se avisan con esta anticipación. */
export const EXPIRY_WARNING_DAYS = 30;

const round1 = (n: number) => Math.round(n * 10) / 10;
const ratio = (part: number, total: number) => (total > 0 ? part / total : null);

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Etiqueta YYYY-MM en hora local. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Los últimos `months` meses terminados en el de `now`, del más viejo al actual. */
export function lastMonths(now: Date, months: number): string[] {
  return Array.from({ length: months }, (_, i) =>
    monthKey(new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1)),
  );
}

// ── Marketplace ─────────────────────────────────────────────────────────────

export interface LoadForMarketplace {
  id: string;
  title: string;
  status: LoadStatus;
  createdAt: Date;
  shipperName: string;
  hasTrip: boolean;
  postulations: { createdAt: Date; counterOfferPrice: number | null }[];
}

export interface MarketplaceMetrics {
  loadsPublished: number;
  /**
   * Cargas que consiguieron transportista / cargas que ya tuvieron tiempo de
   * conseguirlo. Las publicadas hace menos de 48 h quedan afuera del
   * denominador: todavía no fallaron, y contarlas bajaría la tasa cada vez que
   * entra una carga nueva.
   */
  assignmentRate: number | null;
  avgPostulationsPerLoad: number | null;
  /** Mediana de horas entre que se publica una carga y llega la primera postulación. */
  medianHoursToFirstPostulation: number | null;
  /** Postulaciones donde hubo contraoferta / postulaciones totales. */
  counterOfferRate: number | null;
  unansweredLoads: { id: string; title: string; shipperName: string; createdAt: Date; hoursWaiting: number }[];
}

export function computeMarketplaceMetrics(loads: LoadForMarketplace[], now: Date): MarketplaceMetrics {
  const unansweredCutoff = now.getTime() - UNANSWERED_LOAD_HOURS * HOUR_MS;

  let assigned = 0;
  let eligible = 0;
  let postulationCount = 0;
  let counterOffers = 0;
  const hoursToFirst: number[] = [];
  const unanswered: MarketplaceMetrics['unansweredLoads'] = [];

  for (const load of loads) {
    const isOld = load.createdAt.getTime() <= unansweredCutoff;
    if (load.hasTrip) assigned += 1;
    if (load.hasTrip || isOld) eligible += 1;

    postulationCount += load.postulations.length;
    counterOffers += load.postulations.filter((p) => p.counterOfferPrice != null).length;

    if (load.postulations.length > 0) {
      const first = Math.min(...load.postulations.map((p) => p.createdAt.getTime()));
      hoursToFirst.push((first - load.createdAt.getTime()) / HOUR_MS);
    } else if (load.status === LoadStatus.PUBLISHED && isOld) {
      unanswered.push({
        id: load.id,
        title: load.title,
        shipperName: load.shipperName,
        createdAt: load.createdAt,
        hoursWaiting: Math.floor((now.getTime() - load.createdAt.getTime()) / HOUR_MS),
      });
    }
  }

  const medianHours = median(hoursToFirst);
  return {
    loadsPublished: loads.length,
    assignmentRate: ratio(assigned, eligible),
    avgPostulationsPerLoad: loads.length ? round1(postulationCount / loads.length) : null,
    medianHoursToFirstPostulation: medianHours == null ? null : round1(medianHours),
    counterOfferRate: ratio(counterOffers, postulationCount),
    // Las que más esperan, primero.
    unansweredLoads: unanswered.sort((a, b) => b.hoursWaiting - a.hoursWaiting).slice(0, 10),
  };
}

// ── Viajes y dinero ─────────────────────────────────────────────────────────

export interface TripForPlatform {
  status: TripStatus;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  distanceKm: number | null;
  fuelLiters: number | null;
  load: {
    deliveryDate: Date | null;
    price: number | null;
    /** Postulación ACCEPTED (0 o 1), como la devuelve Prisma con `take: 1`. */
    postulations: { proposedPrice: number | null }[];
  } | null;
}

/**
 * Precio pactado de un viaje: el de la postulación aceptada (ahí queda el
 * precio final de la negociación) o, si no hubo postulación, el publicado.
 * Mismo criterio que usan los paneles de transportista, dador y empresa.
 */
export function agreedPrice(trip: TripForPlatform): number {
  return trip.load?.postulations[0]?.proposedPrice ?? trip.load?.price ?? 0;
}

export interface TripMetrics {
  /** Dinero pactado en viajes completados este mes. */
  volumeThisMonth: number;
  tripsCompletedThisMonth: number;
  monthlyVolume: { month: string; amount: number; trips: number }[];
  /** Dinero / km sobre viajes completados con distancia. null sin datos. */
  avgPricePerKm: number | null;
  /** Entregas completadas a tiempo / medibles (con fecha comprometida). */
  onTimeRate: number | null;
  /** Viajes cancelados / (completados + cancelados) entre los creados en la ventana. */
  cancellationRate: number | null;
  avgTripHours: number | null;
}

export function computeTripMetrics(
  trips: TripForPlatform[],
  now: Date,
  windowStart: Date,
  months: number,
): TripMetrics {
  const monthly = new Map(lastMonths(now, months).map((m) => [m, { month: m, amount: 0, trips: 0 }]));
  const currentMonth = monthKey(now);

  let pricedAmount = 0;
  let pricedKm = 0;
  let completedInWindow = 0;
  let cancelledInWindow = 0;
  const durations: number[] = [];
  const recentCompleted: TripForPlatform[] = [];

  for (const trip of trips) {
    const completed = trip.status === TripStatus.COMPLETED && trip.completedAt;

    if (completed) {
      const point = monthly.get(monthKey(trip.completedAt!));
      if (point) {
        point.amount += agreedPrice(trip);
        point.trips += 1;
      }
    }

    if (trip.completedAt && trip.completedAt >= windowStart && completed) {
      recentCompleted.push(trip);
      if (trip.distanceKm) {
        pricedAmount += agreedPrice(trip);
        pricedKm += trip.distanceKm;
      }
      if (trip.startedAt) durations.push((trip.completedAt.getTime() - trip.startedAt.getTime()) / HOUR_MS);
    }

    if (trip.createdAt >= windowStart) {
      if (trip.status === TripStatus.COMPLETED) completedInWindow += 1;
      if (trip.status === TripStatus.CANCELLED) cancelledInWindow += 1;
    }
  }

  const delivery = computeFuelAndDeliveryMetrics(
    recentCompleted.map((t) => ({ ...t, load: t.load ? { deliveryDate: t.load.deliveryDate } : null })),
    now,
  );
  const thisMonth = monthly.get(currentMonth)!;
  const avgTrip = durations.length ? durations.reduce((s, h) => s + h, 0) / durations.length : null;

  return {
    volumeThisMonth: thisMonth.amount,
    tripsCompletedThisMonth: thisMonth.trips,
    monthlyVolume: [...monthly.values()],
    avgPricePerKm: pricedKm > 0 ? round1(pricedAmount / pricedKm) : null,
    onTimeRate: delivery.onTimeRate,
    cancellationRate: ratio(cancelledInWindow, completedInWindow + cancelledInWindow),
    avgTripHours: avgTrip == null ? null : round1(avgTrip),
  };
}

// ── Verificación de transportistas ──────────────────────────────────────────

export interface DocumentForReview {
  status: DocumentStatus;
  createdAt: Date;
  reviewedAt: Date | null;
}

export interface VerificationMetrics {
  pendingDocuments: number;
  /** Pendientes hace más de 48 h. */
  stalePendingDocuments: number;
  oldestPendingAt: Date | null;
  /** Horas promedio entre la subida y la revisión, sobre lo revisado en la ventana. */
  avgReviewHours: number | null;
  /** Rechazados / revisados en la ventana. */
  rejectionRate: number | null;
}

/**
 * `pending` son todos los PENDING (sin importar la ventana: un documento
 * olvidado hace meses es justo lo que hay que ver). `reviewed` son los
 * revisados dentro de la ventana.
 *
 * Nota: `createdAt` es la primera subida; si el transportista re-subió el
 * archivo, el tiempo de revisión puede quedar inflado.
 */
export function computeVerificationMetrics(
  pending: DocumentForReview[],
  reviewed: DocumentForReview[],
  now: Date,
): VerificationMetrics {
  const staleCutoff = now.getTime() - STALE_DOCUMENT_HOURS * HOUR_MS;
  const oldest = pending.reduce<Date | null>((min, d) => (!min || d.createdAt < min ? d.createdAt : min), null);

  const reviewHours = reviewed
    .filter((d) => d.reviewedAt)
    .map((d) => (d.reviewedAt!.getTime() - d.createdAt.getTime()) / HOUR_MS);
  const rejected = reviewed.filter((d) => d.status === DocumentStatus.REJECTED).length;

  return {
    pendingDocuments: pending.length,
    stalePendingDocuments: pending.filter((d) => d.createdAt.getTime() <= staleCutoff).length,
    oldestPendingAt: oldest,
    avgReviewHours: reviewHours.length
      ? round1(reviewHours.reduce((s, h) => s + h, 0) / reviewHours.length)
      : null,
    rejectionRate: ratio(rejected, reviewed.length),
  };
}

export type ExpiryKind = 'LICENSE' | 'INSURANCE' | 'VTV';

export interface ExpiryAlert {
  userId: string;
  userName: string;
  kind: ExpiryKind;
  expiresAt: Date;
  /** Negativo si ya venció. */
  daysLeft: number;
}

export interface TransporterForExpiry {
  id: string;
  name: string;
  licenseExpiresAt: Date | null;
  vehicle: { insuranceExpiresAt: Date | null; vtvExpiresAt: Date | null } | null;
}

/** Licencias, seguros y VTV vencidos o que vencen en los próximos 30 días. */
export function computeExpiryAlerts(transporters: TransporterForExpiry[], now: Date): ExpiryAlert[] {
  const limit = now.getTime() + EXPIRY_WARNING_DAYS * DAY_MS;
  const alerts: ExpiryAlert[] = [];

  const push = (t: TransporterForExpiry, kind: ExpiryKind, date: Date | null | undefined) => {
    if (!date || date.getTime() > limit) return;
    alerts.push({
      userId: t.id,
      userName: t.name,
      kind,
      expiresAt: date,
      daysLeft: Math.floor((date.getTime() - now.getTime()) / DAY_MS),
    });
  };

  for (const t of transporters) {
    push(t, 'LICENSE', t.licenseExpiresAt);
    push(t, 'INSURANCE', t.vehicle?.insuranceExpiresAt);
    push(t, 'VTV', t.vehicle?.vtvExpiresAt);
  }
  return alerts.sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
}

// ── Crecimiento ─────────────────────────────────────────────────────────────

/** Roles que se cuentan en las altas: los admins se crean a mano, no son crecimiento. */
export const GROWTH_ROLES: Role[] = [Role.CARGO_GENERATOR, Role.TRANSPORTER, Role.COMPANY_ADMIN];

export function computeMonthlySignups(
  users: { role: Role; createdAt: Date }[],
  now: Date,
  months: number,
): { month: string; byRole: Record<string, number>; total: number }[] {
  const empty = () => Object.fromEntries(GROWTH_ROLES.map((r) => [r, 0])) as Record<string, number>;
  const series = new Map(lastMonths(now, months).map((m) => [m, { month: m, byRole: empty(), total: 0 }]));

  for (const user of users) {
    if (!GROWTH_ROLES.includes(user.role)) continue;
    const point = series.get(monthKey(user.createdAt));
    if (!point) continue;
    point.byRole[user.role] += 1;
    point.total += 1;
  }
  return [...series.values()];
}
