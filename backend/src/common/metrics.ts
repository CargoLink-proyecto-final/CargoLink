import { TripStatus } from '@prisma/client';

/** Forma mínima de un viaje necesaria para calcular las métricas de flota. */
export interface TripForMetrics {
  status: TripStatus;
  completedAt: Date | null;
  fuelLiters: number | null;
  distanceKm: number | null;
  load: { deliveryDate: Date | null } | null;
}

export interface FuelAndDeliveryMetrics {
  /** Entregas completadas con fecha comprometida que llegaron a tiempo. */
  onTimeDeliveries: number;
  /** Entregas completadas con fecha comprometida que llegaron demoradas. */
  lateDeliveries: number;
  /** onTime / (onTime + late). null si ninguna entrega es medible. */
  onTimeRate: number | null;
  /** Suma de km de las rutas de los viajes completados. */
  totalDistanceKm: number;
  /** Suma de litros cargados en los viajes completados. */
  totalFuelLiters: number;
  /** km totales / litros totales. null si no hay litros registrados. */
  avgKmPerLiter: number | null;
  /** Litros cargados en viajes completados durante el mes en curso. */
  litersThisMonth: number;
  /** km recorridos en viajes completados durante el mes en curso. */
  kmThisMonth: number;
  /** Mes de referencia para *ThisMonth, en formato YYYY-MM. */
  monthLabel: string;
}

/** Redondeo a 1 decimal — km, litros, promedios de conteo. */
export const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Calcula las métricas de combustible y puntualidad sobre un conjunto de viajes.
 * Función pura: la usan tanto el dashboard del transportista como el de la
 * empresa para que el cómputo sea idéntico en ambos lados.
 *
 * - Puntualidad: solo cuentan los viajes completados cuya carga tiene
 *   `deliveryDate`. A tiempo = `completedAt <= deliveryDate`; demorado si no.
 * - km/L y "del mes": sobre viajes completados que tengan el dato cargado.
 */
export function computeFuelAndDeliveryMetrics(
  trips: TripForMetrics[],
  now: Date,
): FuelAndDeliveryMetrics {
  const completed = trips.filter((t) => t.status === TripStatus.COMPLETED);

  let onTime = 0;
  let late = 0;
  let totalDistanceKm = 0;
  let totalFuelLiters = 0;
  let litersThisMonth = 0;
  let kmThisMonth = 0;

  const year = now.getFullYear();
  const month = now.getMonth();

  for (const t of completed) {
    if (t.load?.deliveryDate && t.completedAt) {
      if (t.completedAt <= t.load.deliveryDate) onTime += 1;
      else late += 1;
    }

    if (t.distanceKm) totalDistanceKm += t.distanceKm;
    if (t.fuelLiters) totalFuelLiters += t.fuelLiters;

    if (
      t.completedAt &&
      t.completedAt.getFullYear() === year &&
      t.completedAt.getMonth() === month
    ) {
      if (t.fuelLiters) litersThisMonth += t.fuelLiters;
      if (t.distanceKm) kmThisMonth += t.distanceKm;
    }
  }

  const measurable = onTime + late;
  const monthLabel = `${year}-${String(month + 1).padStart(2, '0')}`;

  return {
    onTimeDeliveries: onTime,
    lateDeliveries: late,
    onTimeRate: measurable ? onTime / measurable : null,
    totalDistanceKm: round1(totalDistanceKm),
    totalFuelLiters: round1(totalFuelLiters),
    avgKmPerLiter: totalFuelLiters ? round1(totalDistanceKm / totalFuelLiters) : null,
    litersThisMonth: round1(litersThisMonth),
    kmThisMonth: round1(kmThisMonth),
    monthLabel,
  };
}

/** Redondeo a 2 decimales — montos de dinero. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Forma mínima de un viaje necesaria para calcular cuánto dinero movió.
 * La postulación aceptada viene como array porque así la devuelve Prisma con
 * `postulations: { where: { status: ACCEPTED }, take: 1 }`.
 */
export interface TripForMoneyMetrics {
  status: TripStatus;
  completedAt: Date | null;
  distanceKm: number | null;
  load: {
    price: number | null;
    postulations?: { proposedPrice: number | null }[];
  } | null;
}

/** Un mes de la serie histórica. Los meses sin actividad van en cero. */
export interface MoneyMonthPoint {
  /** Mes en formato YYYY-MM. */
  month: string;
  /** Dinero pactado en los viajes completados durante ese mes. */
  amount: number;
  /** Viajes completados durante ese mes. */
  trips: number;
  /** km recorridos en esos viajes. */
  km: number;
}

export interface MoneyMetrics {
  /** Dinero de todos los viajes completados. */
  totalAmount: number;
  /** Dinero de los viajes completados durante el mes en curso. */
  amountThisMonth: number;
  /** total / viajes completados. null si no hay viajes completados. */
  avgAmountPerTrip: number | null;
  /** total / km recorridos. null si ningún viaje tiene distancia cargada. */
  amountPerKm: number | null;
  /** Serie mensual continua (incluye meses vacíos) terminada en el mes actual. */
  monthly: MoneyMonthPoint[];
}

/**
 * Precio realmente pactado de un viaje.
 *
 * `accept()` escribe el precio final en la postulación aceptada y nunca lo
 * copia a `load.price`: leer solo `load.price` haría que toda carga publicada
 * "a convenir" sume $0. Si no hubo postulación (el transportista tomó la carga
 * al precio publicado), vale el precio de la carga.
 */
export function resolveTripPrice(trip: TripForMoneyMetrics): number {
  return trip.load?.postulations?.[0]?.proposedPrice ?? trip.load?.price ?? 0;
}

/** Etiqueta YYYY-MM de una fecha, en hora local (igual criterio que monthLabel). */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Ventana de los últimos `months` meses terminada en el mes de `now`, en cero.
 * Devolver los meses vacíos evita que el gráfico del frontend dibuje una serie
 * con huecos cuando no hubo viajes en un mes.
 */
function emptyMonthlyWindow(now: Date, months: number): MoneyMonthPoint[] {
  const window: MoneyMonthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    window.push({ month: monthKey(d), amount: 0, trips: 0, km: 0 });
  }
  return window;
}

/**
 * Calcula las métricas de dinero sobre un conjunto de viajes.
 * Función pura: la comparten el dashboard del transportista (ingresos), el del
 * dador de carga (gasto) y el de la empresa (facturación de flota), para que el
 * criterio de precio pactado sea idéntico en los tres.
 *
 * Solo cuentan los viajes COMPLETED: un viaje en curso todavía no facturó.
 */
export function computeMoneyMetrics(
  trips: TripForMoneyMetrics[],
  now: Date,
  months = 12,
): MoneyMetrics {
  const completed = trips.filter((t) => t.status === TripStatus.COMPLETED);
  const monthly = emptyMonthlyWindow(now, months);
  const byMonth = new Map(monthly.map((m) => [m.month, m]));
  const currentMonth = monthKey(now);

  let totalAmount = 0;
  let totalKm = 0;
  let amountThisMonth = 0;

  for (const t of completed) {
    const amount = resolveTripPrice(t);
    totalAmount += amount;
    if (t.distanceKm) totalKm += t.distanceKm;

    if (!t.completedAt) continue;
    const key = monthKey(t.completedAt);
    if (key === currentMonth) amountThisMonth += amount;

    const point = byMonth.get(key);
    if (point) {
      point.amount += amount;
      point.trips += 1;
      if (t.distanceKm) point.km += t.distanceKm;
    }
  }

  for (const point of monthly) {
    point.amount = round2(point.amount);
    point.km = round1(point.km);
  }

  return {
    totalAmount: round2(totalAmount),
    amountThisMonth: round2(amountThisMonth),
    avgAmountPerTrip: completed.length ? round2(totalAmount / completed.length) : null,
    amountPerKm: totalKm ? round2(totalAmount / totalKm) : null,
    monthly,
  };
}
