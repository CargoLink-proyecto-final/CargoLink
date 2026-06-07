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

const round1 = (n: number) => Math.round(n * 10) / 10;

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
