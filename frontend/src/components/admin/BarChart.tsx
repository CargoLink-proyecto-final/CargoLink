import { cn } from '@/lib/utils';

export interface BarPoint {
  /** Etiqueta del eje X (mes, hora, día). */
  label: string;
  value: number;
  /** Parte del valor a resaltar en rojo (ej. errores dentro del total de requests). */
  alert?: number;
  /** Texto del tooltip y del lector de pantalla. */
  title: string;
}

interface Props {
  points: BarPoint[];
  /** Cómo mostrar el máximo del eje. */
  formatValue: (value: number) => string;
  /** Resumen accesible del gráfico entero. */
  ariaLabel: string;
  tone?: 'primary' | 'info' | 'ink';
  height?: number;
  /** Cada cuántas barras mostrar etiqueta (para series largas). */
  labelEvery?: number;
}

const TONE = {
  primary: 'bg-primary-500 group-hover:bg-primary-600',
  info: 'bg-info-600/80 group-hover:bg-info-600',
  ink: 'bg-ink-400 group-hover:bg-ink-600',
};

/**
 * Barras verticales hechas con divs. Alcanza para series cortas (meses, horas)
 * y no suma una librería de gráficos al bundle del panel del admin.
 */
export default function BarChart({
  points,
  formatValue,
  ariaLabel,
  tone = 'primary',
  height = 140,
  labelEvery = 1,
}: Props) {
  const max = Math.max(0, ...points.map((p) => p.value));

  return (
    <figure aria-label={ariaLabel} className="w-full">
      <div className="flex items-baseline justify-between text-[11px] text-ink-500 tabular-nums mb-1.5">
        <span>máx. {formatValue(max)}</span>
      </div>
      <div
        className="flex items-end gap-[3px] border-b border-ink-200"
        style={{ height }}
      >
        {points.map((p, i) => {
          const pct = max > 0 ? (p.value / max) * 100 : 0;
          const alertPct = p.value > 0 && p.alert ? (p.alert / p.value) * 100 : 0;
          return (
            <div key={`${p.label}-${i}`} className="group relative flex-1 h-full flex items-end" title={p.title}>
              <span className="sr-only">{p.title}</span>
              <div
                className={cn('w-full rounded-t-[3px] transition-colors flex flex-col justify-start overflow-hidden', TONE[tone])}
                // Altura mínima visible para que un valor chico no parezca cero.
                style={{ height: p.value > 0 ? `max(${pct}%, 2px)` : 0 }}
              >
                {alertPct > 0 && (
                  <div className="w-full bg-danger-600" style={{ height: `max(${alertPct}%, 2px)` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-[3px] mt-1.5" aria-hidden>
        {points.map((p, i) => (
          <span key={`${p.label}-${i}`} className="flex-1 text-center text-[10.5px] text-ink-500 truncate">
            {i % labelEvery === 0 ? p.label : ''}
          </span>
        ))}
      </div>
    </figure>
  );
}
