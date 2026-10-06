import { TripStatus } from '@prisma/client';
import {
  computeFuelAndDeliveryMetrics,
  computeMoneyMetrics,
  resolveTripPrice,
  TripForMetrics,
  TripForMoneyMetrics,
} from './metrics';

describe('computeFuelAndDeliveryMetrics', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  const makeTrip = (overrides: Partial<TripForMetrics> = {}): TripForMetrics => ({
    status: TripStatus.COMPLETED,
    completedAt: new Date('2026-06-10T00:00:00Z'),
    fuelLiters: null,
    distanceKm: null,
    load: null,
    ...overrides,
  });

  it('returns all zeros / nulls for an empty trip list', () => {
    const result = computeFuelAndDeliveryMetrics([], now);

    expect(result).toEqual({
      onTimeDeliveries: 0,
      lateDeliveries: 0,
      onTimeRate: null,
      totalDistanceKm: 0,
      totalFuelLiters: 0,
      avgKmPerLiter: null,
      litersThisMonth: 0,
      kmThisMonth: 0,
      monthLabel: '2026-06',
    });
  });

  it('ignores trips that are not COMPLETED', () => {
    const trips = [
      makeTrip({ status: TripStatus.IN_PROGRESS, distanceKm: 100, fuelLiters: 10 }),
      makeTrip({ status: TripStatus.PENDING, distanceKm: 50, fuelLiters: 5 }),
    ];
    const result = computeFuelAndDeliveryMetrics(trips, now);
    expect(result.totalDistanceKm).toBe(0);
    expect(result.totalFuelLiters).toBe(0);
  });

  it('counts on-time deliveries when completedAt <= deliveryDate', () => {
    const trips = [
      makeTrip({
        completedAt: new Date('2026-06-10T00:00:00Z'),
        load: { deliveryDate: new Date('2026-06-11T00:00:00Z') },
      }),
    ];
    const result = computeFuelAndDeliveryMetrics(trips, now);
    expect(result.onTimeDeliveries).toBe(1);
    expect(result.lateDeliveries).toBe(0);
    expect(result.onTimeRate).toBe(1);
  });

  it('counts late deliveries when completedAt > deliveryDate', () => {
    const trips = [
      makeTrip({
        completedAt: new Date('2026-06-12T00:00:00Z'),
        load: { deliveryDate: new Date('2026-06-11T00:00:00Z') },
      }),
    ];
    const result = computeFuelAndDeliveryMetrics(trips, now);
    expect(result.onTimeDeliveries).toBe(0);
    expect(result.lateDeliveries).toBe(1);
    expect(result.onTimeRate).toBe(0);
  });

  it('treats equal completedAt and deliveryDate as on-time (boundary)', () => {
    const d = new Date('2026-06-11T00:00:00Z');
    const trips = [makeTrip({ completedAt: d, load: { deliveryDate: new Date(d) } })];
    const result = computeFuelAndDeliveryMetrics(trips, now);
    expect(result.onTimeDeliveries).toBe(1);
  });

  it('computes onTimeRate as a fraction across mixed deliveries', () => {
    const trips = [
      makeTrip({
        completedAt: new Date('2026-06-10T00:00:00Z'),
        load: { deliveryDate: new Date('2026-06-11T00:00:00Z') },
      }),
      makeTrip({
        completedAt: new Date('2026-06-13T00:00:00Z'),
        load: { deliveryDate: new Date('2026-06-11T00:00:00Z') },
      }),
    ];
    const result = computeFuelAndDeliveryMetrics(trips, now);
    expect(result.onTimeDeliveries).toBe(1);
    expect(result.lateDeliveries).toBe(1);
    expect(result.onTimeRate).toBe(0.5);
  });

  it('excludes deliveries without a deliveryDate from punctuality', () => {
    const trips = [makeTrip({ load: { deliveryDate: null } })];
    const result = computeFuelAndDeliveryMetrics(trips, now);
    expect(result.onTimeDeliveries).toBe(0);
    expect(result.lateDeliveries).toBe(0);
    expect(result.onTimeRate).toBeNull();
  });

  it('excludes deliveries without a completedAt from punctuality', () => {
    const trips = [
      makeTrip({ completedAt: null, load: { deliveryDate: new Date('2026-06-11') } }),
    ];
    const result = computeFuelAndDeliveryMetrics(trips, now);
    expect(result.onTimeRate).toBeNull();
  });

  it('sums distance and fuel across completed trips and rounds to 1 decimal', () => {
    const trips = [
      makeTrip({ distanceKm: 100.05, fuelLiters: 10 }),
      makeTrip({ distanceKm: 50, fuelLiters: 5.04 }),
    ];
    const result = computeFuelAndDeliveryMetrics(trips, now);
    expect(result.totalDistanceKm).toBe(150.1); // 150.05 -> 150.1
    expect(result.totalFuelLiters).toBe(15); // 15.04 -> 15.0
  });

  it('computes avgKmPerLiter rounded, null when no fuel recorded', () => {
    const withFuel = computeFuelAndDeliveryMetrics(
      [makeTrip({ distanceKm: 100, fuelLiters: 8 })],
      now,
    );
    expect(withFuel.avgKmPerLiter).toBe(12.5);

    const noFuel = computeFuelAndDeliveryMetrics(
      [makeTrip({ distanceKm: 100, fuelLiters: null })],
      now,
    );
    expect(noFuel.avgKmPerLiter).toBeNull();
  });

  it('accumulates liters/km of the current month only', () => {
    const trips = [
      // current month (June 2026)
      makeTrip({
        completedAt: new Date('2026-06-05T00:00:00Z'),
        distanceKm: 100,
        fuelLiters: 10,
      }),
      // previous month
      makeTrip({
        completedAt: new Date('2026-05-20T00:00:00Z'),
        distanceKm: 200,
        fuelLiters: 20,
      }),
    ];
    const result = computeFuelAndDeliveryMetrics(trips, now);
    expect(result.kmThisMonth).toBe(100);
    expect(result.litersThisMonth).toBe(10);
    // totals include both months
    expect(result.totalDistanceKm).toBe(300);
    expect(result.totalFuelLiters).toBe(30);
  });

  it('formats monthLabel as YYYY-MM with zero-padded month', () => {
    const jan = computeFuelAndDeliveryMetrics([], new Date('2026-01-09T00:00:00Z'));
    expect(jan.monthLabel).toBe('2026-01');

    const dec = computeFuelAndDeliveryMetrics([], new Date('2026-12-09T00:00:00Z'));
    expect(dec.monthLabel).toBe('2026-12');
  });

  it('ignores zero distance/fuel values (falsy) in sums', () => {
    const trips = [makeTrip({ distanceKm: 0, fuelLiters: 0 })];
    const result = computeFuelAndDeliveryMetrics(trips, now);
    expect(result.totalDistanceKm).toBe(0);
    expect(result.totalFuelLiters).toBe(0);
    expect(result.avgKmPerLiter).toBeNull();
  });
});

describe('resolveTripPrice', () => {
  const trip = (load: any) => ({
    status: TripStatus.COMPLETED,
    completedAt: new Date('2026-06-10T00:00:00Z'),
    distanceKm: null,
    load,
  });

  it('prefers the price agreed in the accepted postulation', () => {
    expect(
      resolveTripPrice(trip({ price: 50000, postulations: [{ proposedPrice: 65000 }] })),
    ).toBe(65000);
  });

  it('falls back to the published price when there was no postulation', () => {
    expect(resolveTripPrice(trip({ price: 50000, postulations: [] }))).toBe(50000);
  });

  it('returns 0 for a load published "a convenir" with no accepted offer', () => {
    expect(resolveTripPrice(trip({ price: null, postulations: [] }))).toBe(0);
    expect(resolveTripPrice(trip(null))).toBe(0);
  });
});

describe('computeMoneyMetrics', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  const makeTrip = (overrides: Partial<TripForMoneyMetrics> = {}): TripForMoneyMetrics => ({
    status: TripStatus.COMPLETED,
    completedAt: new Date('2026-06-10T00:00:00Z'),
    distanceKm: null,
    load: { price: null, postulations: [] },
    ...overrides,
  });

  it('returns a zeroed 12-month window for an empty trip list', () => {
    const result = computeMoneyMetrics([], now);

    expect(result.totalAmount).toBe(0);
    expect(result.amountThisMonth).toBe(0);
    expect(result.avgAmountPerTrip).toBeNull();
    expect(result.amountPerKm).toBeNull();
    expect(result.monthly).toHaveLength(12);
    expect(result.monthly[0].month).toBe('2025-07');
    expect(result.monthly[11].month).toBe('2026-06');
  });

  it('ignores trips that are not COMPLETED', () => {
    const result = computeMoneyMetrics(
      [
        makeTrip({
          status: TripStatus.IN_PROGRESS,
          load: { price: 90000, postulations: [] },
        }),
      ],
      now,
    );

    expect(result.totalAmount).toBe(0);
    expect(result.monthly[11].trips).toBe(0);
  });

  it('buckets completed trips by month and keeps totals over the whole history', () => {
    const trips = [
      makeTrip({
        completedAt: new Date('2026-06-10T00:00:00Z'),
        distanceKm: 100,
        load: { price: 4000, postulations: [{ proposedPrice: 5000 }] },
      }),
      makeTrip({
        completedAt: new Date('2026-04-02T00:00:00Z'),
        distanceKm: 50,
        load: { price: 3000, postulations: [] },
      }),
      // Fuera de la ventana de 12 meses: suma al total, no a la serie.
      makeTrip({
        completedAt: new Date('2024-01-05T00:00:00Z'),
        distanceKm: 10,
        load: { price: 1000, postulations: [] },
      }),
    ];

    const result = computeMoneyMetrics(trips, now);

    expect(result.totalAmount).toBe(9000);
    expect(result.amountThisMonth).toBe(5000);
    expect(result.avgAmountPerTrip).toBe(3000);
    expect(result.amountPerKm).toBe(56.25); // 9000 / 160 km
    expect(result.monthly[11]).toEqual({ month: '2026-06', amount: 5000, trips: 1, km: 100 });
    expect(result.monthly[9]).toEqual({ month: '2026-04', amount: 3000, trips: 1, km: 50 });
    expect(result.monthly.reduce((sum, m) => sum + m.amount, 0)).toBe(8000);
  });

  it('leaves amountPerKm null when no completed trip has a distance', () => {
    const result = computeMoneyMetrics(
      [makeTrip({ load: { price: 7000, postulations: [] } })],
      now,
    );

    expect(result.totalAmount).toBe(7000);
    expect(result.amountPerKm).toBeNull();
  });
});
