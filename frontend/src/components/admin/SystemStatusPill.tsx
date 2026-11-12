import { cn } from '@/lib/utils';
import type { OverallState } from '@/types/adminMetrics';

const STATE: Record<OverallState, { label: string; dot: string; tone: string }> = {
  OK: { label: 'Operativo', dot: 'bg-success-600', tone: 'text-success-700 bg-success-50 ring-success-600/20' },
  DEGRADED: { label: 'Degradado', dot: 'bg-warning-600', tone: 'text-warning-700 bg-warning-50 ring-warning-600/20' },
  DOWN: { label: 'Caído', dot: 'bg-danger-600', tone: 'text-danger-700 bg-danger-50 ring-danger-600/20' },
};

interface Props {
  state: OverallState | null;
  className?: string;
}

/** Semáforo del sistema. `null` = todavía no se sabe (cargando o sin respuesta). */
export default function SystemStatusPill({ state, className }: Props) {
  const s = state ? STATE[state] : null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 px-2.5 py-1 rounded-full ring-1 text-[12px] font-medium',
        s ? s.tone : 'text-ink-500 bg-ink-100 ring-ink-200',
        className,
      )}
    >
      <span className={cn('w-2 h-2 rounded-full', s ? s.dot : 'bg-ink-400', state === 'OK' && 'animate-pulse')} aria-hidden />
      {s ? s.label : 'Sin datos'}
    </span>
  );
}
