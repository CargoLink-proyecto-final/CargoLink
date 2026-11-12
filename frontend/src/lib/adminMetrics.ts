// Formateo de las métricas del panel del admin. Todo valor puede venir null
// (no hay datos suficientes): se muestra como "—", nunca como 0, porque "0% de
// entregas a tiempo" y "todavía no hay entregas" son cosas muy distintas.

export const EMPTY = '—';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 0.7234 → "72%"; con `decimals` → "72,3%". */
export function formatRatio(value: number | null | undefined, decimals = 0): string {
  if (value == null) return EMPTY;
  return `${(value * 100).toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

/** Disponibilidad: siempre con decimales, porque 99% y 99,9% son mundos distintos. */
export function formatUptime(value: number | null | undefined): string {
  if (value == null) return EMPTY;
  if (value >= 0.99995) return '100%';
  return formatRatio(value, value >= 0.99 ? 2 : 1);
}

export function formatMs(value: number | null | undefined): string {
  if (value == null) return EMPTY;
  if (value >= 1000) return `${(value / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} s`;
  return `${Math.round(value)} ms`;
}

/** 3725 → "1 h 2 min". Para caídas y uptime del proceso. */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${Math.round(totalSeconds)} s`;
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  return `${minutes} min`;
}

export function formatHours(value: number | null | undefined): string {
  if (value == null) return EMPTY;
  if (value < 1) return `${Math.round(value * 60)} min`;
  if (value >= 48) return `${Math.round(value / 24)} días`;
  return `${value.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h`;
}

/** "2026-10" → "oct". Con `withYear` → "oct 26". */
export function formatMonth(key: string, withYear = false): string {
  const [year, month] = key.split('-');
  const label = MONTHS[Number(month) - 1] ?? key;
  return withYear ? `${label} ${year.slice(2)}` : label;
}

/** Montos grandes compactos para ejes y KPIs: 1.250.000 → "$1,3 M". */
export function formatCompactCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toLocaleString('es-AR', { maximumFractionDigits: 0 })} mil`;
  }
  return `$${Math.round(value).toLocaleString('es-AR')}`;
}
