import { DocumentStatus, LoadStatus, Role, TripStatus } from '@prisma/client';
import {
  LoadForMarketplace,
  TripForPlatform,
  agreedPrice,
  computeExpiryAlerts,
  computeMarketplaceMetrics,
  computeMonthlySignups,
  computeTripMetrics,
  computeVerificationMetrics,
  lastMonths,
  median,
} from './platform-metrics';

const now = new Date(2026, 9, 15, 12, 0); // 15/10/2026 12:00 local
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
const daysAgo = (d: number) => hoursAgo(d * 24);

describe('median', () => {
  it('handles empty, odd and even lists', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('lastMonths', () => {
  it('ends in the current month and crosses year boundaries', () => {
    expect(lastMonths(new Date(2026, 1, 10), 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});

describe('computeMarketplaceMetrics', () => {
  const load = (overrides: Partial<LoadForMarketplace>): LoadForMarketplace => ({
    id: 'l',
    title: 'Carga',
    status: LoadStatus.PUBLISHED,
    createdAt: daysAgo(5),
    shipperName: 'Dador',
    hasTrip: false,
    postulations: [],
    ...overrides,
  });

  it('returns nulls when there are no loads', () => {
    const m = computeMarketplaceMetrics([], now);
    expect(m.assignmentRate).toBeNull();
    expect(m.avgPostulationsPerLoad).toBeNull();
    expect(m.medianHoursToFirstPostulation).toBeNull();
    expect(m.counterOfferRate).toBeNull();
  });

  it('leaves fresh unassigned loads out of the assignment rate denominator', () => {
    const m = computeMarketplaceMetrics(
      [
        load({ id: 'a', hasTrip: true, status: LoadStatus.ASSIGNED }),
        load({ id: 'b' }), // 5 días sin asignar: falló
        load({ id: 'c', createdAt: hoursAgo(3) }), // recién publicada: todavía no cuenta
      ],
      now,
    );
    expect(m.assignmentRate).toBe(0.5);
    expect(m.loadsPublished).toBe(3);
  });

  it('measures time to first postulation from the earliest one', () => {
    const createdAt = hoursAgo(30);
    const m = computeMarketplaceMetrics(
      [
        load({
          createdAt,
          postulations: [
            { createdAt: hoursAgo(20), counterOfferPrice: null },
            { createdAt: hoursAgo(26), counterOfferPrice: 90000 },
          ],
        }),
      ],
      now,
    );
    expect(m.medianHoursToFirstPostulation).toBe(4);
    expect(m.counterOfferRate).toBe(0.5);
    expect(m.avgPostulationsPerLoad).toBe(2);
  });

  it('flags published loads with no postulations after 48 hours, longest waiting first', () => {
    const m = computeMarketplaceMetrics(
      [
        load({ id: 'old', createdAt: hoursAgo(100) }),
        load({ id: 'older', createdAt: hoursAgo(200) }),
        load({ id: 'fresh', createdAt: hoursAgo(10) }),
        load({ id: 'cancelled', createdAt: hoursAgo(300), status: LoadStatus.CANCELLED }),
      ],
      now,
    );
    expect(m.unansweredLoads.map((l) => [l.id, l.hoursWaiting])).toEqual([
      ['older', 200],
      ['old', 100],
    ]);
  });
});

describe('computeTripMetrics', () => {
  const trip = (overrides: Partial<TripForPlatform>): TripForPlatform => ({
    status: TripStatus.COMPLETED,
    createdAt: daysAgo(10),
    startedAt: daysAgo(9),
    completedAt: daysAgo(8),
    distanceKm: 100,
    fuelLiters: 30,
    load: { deliveryDate: daysAgo(7), price: 100000, postulations: [] },
    ...overrides,
  });

  it('uses the accepted postulation price over the published one', () => {
    expect(agreedPrice(trip({ load: { deliveryDate: null, price: 100000, postulations: [{ proposedPrice: 85000 }] } }))).toBe(85000);
    expect(agreedPrice(trip({}))).toBe(100000);
    expect(agreedPrice(trip({ load: { deliveryDate: null, price: null, postulations: [] } }))).toBe(0);
  });

  it('sums completed volume per month and for the current month', () => {
    const m = computeTripMetrics(
      [
        trip({ completedAt: new Date(2026, 9, 3) }),
        trip({ completedAt: new Date(2026, 8, 20) }),
        trip({ status: TripStatus.IN_PROGRESS, completedAt: null }),
      ],
      now,
      daysAgo(90),
      3,
    );
    expect(m.volumeThisMonth).toBe(100000);
    expect(m.tripsCompletedThisMonth).toBe(1);
    expect(m.monthlyVolume).toEqual([
      { month: '2026-08', amount: 0, trips: 0 },
      { month: '2026-09', amount: 100000, trips: 1 },
      { month: '2026-10', amount: 100000, trips: 1 },
    ]);
  });

  it('computes price per km, duration, on-time and cancellation rates within the window', () => {
    const m = computeTripMetrics(
      [
        trip({}), // a tiempo, 24 h
        trip({ completedAt: daysAgo(6), load: { deliveryDate: daysAgo(7), price: 300000, postulations: [] } }), // tarde, 72 h
        trip({ status: TripStatus.CANCELLED, completedAt: null, startedAt: null }),
        trip({ createdAt: daysAgo(200), completedAt: daysAgo(190), startedAt: daysAgo(191) }), // fuera de la ventana
      ],
      now,
      daysAgo(90),
      6,
    );
    expect(m.avgPricePerKm).toBe(2000); // 400000 / 200 km
    expect(m.avgTripHours).toBe(48);
    expect(m.onTimeRate).toBe(0.5);
    expect(m.cancellationRate).toBeCloseTo(1 / 3);
  });
});

describe('computeVerificationMetrics', () => {
  it('counts the pending queue and review speed', () => {
    const m = computeVerificationMetrics(
      [
        { status: DocumentStatus.PENDING, createdAt: hoursAgo(72), reviewedAt: null },
        { status: DocumentStatus.PENDING, createdAt: hoursAgo(5), reviewedAt: null },
      ],
      [
        { status: DocumentStatus.APPROVED, createdAt: hoursAgo(30), reviewedAt: hoursAgo(20) },
        { status: DocumentStatus.REJECTED, createdAt: hoursAgo(40), reviewedAt: hoursAgo(10) },
      ],
      now,
    );
    expect(m.pendingDocuments).toBe(2);
    expect(m.stalePendingDocuments).toBe(1);
    expect(m.oldestPendingAt).toEqual(hoursAgo(72));
    expect(m.avgReviewHours).toBe(20);
    expect(m.rejectionRate).toBe(0.5);
  });

  it('returns nulls without reviews', () => {
    const m = computeVerificationMetrics([], [], now);
    expect(m).toEqual({
      pendingDocuments: 0,
      stalePendingDocuments: 0,
      oldestPendingAt: null,
      avgReviewHours: null,
      rejectionRate: null,
    });
  });
});

describe('computeExpiryAlerts', () => {
  it('lists expired and soon-to-expire papers, soonest first, and skips distant ones', () => {
    const alerts = computeExpiryAlerts(
      [
        {
          id: 'u1',
          name: 'Ana',
          licenseExpiresAt: daysAgo(-10),
          vehicle: { insuranceExpiresAt: daysAgo(3), vtvExpiresAt: daysAgo(-90) },
        },
        { id: 'u2', name: 'Beto', licenseExpiresAt: null, vehicle: null },
      ],
      now,
    );
    expect(alerts.map((a) => [a.userName, a.kind, a.daysLeft])).toEqual([
      ['Ana', 'INSURANCE', -3],
      ['Ana', 'LICENSE', 10],
    ]);
  });
});

describe('computeMonthlySignups', () => {
  it('groups signups by month and role, ignoring admins and months outside the window', () => {
    const series = computeMonthlySignups(
      [
        { role: Role.TRANSPORTER, createdAt: new Date(2026, 9, 2) },
        { role: Role.CARGO_GENERATOR, createdAt: new Date(2026, 9, 5) },
        { role: Role.ADMIN, createdAt: new Date(2026, 9, 5) },
        { role: Role.TRANSPORTER, createdAt: new Date(2026, 8, 1) },
        { role: Role.TRANSPORTER, createdAt: new Date(2025, 0, 1) },
      ],
      now,
      2,
    );
    expect(series).toEqual([
      { month: '2026-09', byRole: { CARGO_GENERATOR: 0, TRANSPORTER: 1, COMPANY_ADMIN: 0 }, total: 1 },
      { month: '2026-10', byRole: { CARGO_GENERATOR: 1, TRANSPORTER: 1, COMPANY_ADMIN: 0 }, total: 2 },
    ]);
  });
});
