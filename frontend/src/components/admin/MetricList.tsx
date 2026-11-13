import { cn } from '@/lib/utils';

export interface MetricItem {
  label: string;
  value: string;
  hint?: string;
  /** Marca el valor como problema (rojo) o advertencia (ámbar). */
  tone?: 'default' | 'warning' | 'danger' | 'success';
}

interface Props {
  items: MetricItem[];
  columns?: 2 | 3 | 4;
}

const VALUE_TONE = {
  default: 'text-ink-900',
  warning: 'text-warning-700',
  danger: 'text-danger-700',
  success: 'text-success-700',
};

const COLUMNS = { 2: 'grid-cols-2', 3: 'grid-cols-2 sm:grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4' };

/** Grilla de métricas secundarias: etiqueta chica arriba, número abajo. */
export default function MetricList({ items, columns = 3 }: Props) {
  return (
    <dl className={cn('grid gap-x-4 gap-y-4', COLUMNS[columns])}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[11.5px] text-ink-500 leading-tight">{item.label}</dt>
          <dd className={cn('mt-1 font-display font-semibold text-[20px] leading-none tabular-nums', VALUE_TONE[item.tone ?? 'default'])}>
            {item.value}
          </dd>
          {item.hint && <dd className="mt-1 text-[11px] text-ink-500 leading-snug">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
