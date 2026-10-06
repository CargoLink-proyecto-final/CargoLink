import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { ChartTone } from './chartTheme';

export interface RankingItem {
  id: string;
  label: string;
  value: number;
  /** Segunda línea: contexto del valor (viajes, calificación, km). */
  hint?: string;
  /** Si la fila lleva a un detalle (ej. la ficha del conductor). */
  href?: string;
}

interface Props {
  items: RankingItem[];
  formatValue: (value: number) => string;
  tone?: ChartTone;
  emptyMessage: string;
}

const TONE_BAR: Record<ChartTone, string> = {
  primary: 'bg-primary-500/70',
  accent: 'bg-accent-400/70',
  success: 'bg-success-600/60',
};

/**
 * Ranking en barras horizontales. Preferido sobre un gráfico de barras real
 * para listas cortas: las etiquetas largas (nombres, tipos de carga) se leen
 * completas y la fila entera sirve de guía del ojo hacia el valor.
 */
export default function RankingBars({
  items,
  formatValue,
  tone = 'primary',
  emptyMessage,
}: Props) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-[13px] text-ink-500">{emptyMessage}</p>;
  }

  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <div className="flex items-baseline justify-between gap-3">
            {item.href ? (
              <Link
                href={item.href}
                className="text-[13.5px] font-medium text-ink-800 truncate hover:text-primary-700 transition"
              >
                {item.label}
              </Link>
            ) : (
              <p className="text-[13.5px] font-medium text-ink-800 truncate">{item.label}</p>
            )}
            <p className="font-mono text-[13px] tabular-nums text-ink-900 shrink-0">
              {formatValue(item.value)}
            </p>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-ink-100 overflow-hidden">
            <div
              className={cn('h-full rounded-full', TONE_BAR[tone])}
              style={{ width: `${Math.max((item.value / max) * 100, 2)}%` }}
            />
          </div>
          {item.hint && <p className="mt-1 text-[12px] text-ink-500">{item.hint}</p>}
        </li>
      ))}
    </ul>
  );
}
