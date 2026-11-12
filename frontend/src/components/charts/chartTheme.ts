/**
 * Piezas compartidas por todos los gráficos del producto.
 *
 * Los colores salen de los tokens de `tailwind.config.ts` (recharts necesita
 * valores literales, no clases), así un gráfico nunca desentona con las
 * StatCards que lo rodean.
 */
export const CHART_COLORS = {
  primary: '#2563EB',
  primarySoft: '#BFDBFE',
  accent: '#D97706',
  success: '#059669',
  danger: '#DC2626',
  grid: '#E5E7EB',
  axis: '#9CA3AF',
} as const;

export type ChartTone = 'primary' | 'accent' | 'success';

export const TONE_COLOR: Record<ChartTone, string> = {
  primary: CHART_COLORS.primary,
  accent: CHART_COLORS.accent,
  success: CHART_COLORS.success,
};

const MONTHS_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/** '2026-06' → 'jun 26'. Corto porque son 12 ticks en el eje X. */
export function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split('-');
  return `${MONTHS_ES[Number(monthNumber) - 1] ?? month} ${year.slice(2)}`;
}

/** '2026-06' → 'junio 2026'. Para el tooltip, donde sí entra completo. */
export function formatMonthLong(month: string): string {
  const [year, monthNumber] = month.split('-');
  const label = MONTHS_ES[Number(monthNumber) - 1];
  return label ? `${label}. ${year}` : month;
}

/** Montos abreviados para el eje Y: $1,2 M, $850 mil. */
export function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}
