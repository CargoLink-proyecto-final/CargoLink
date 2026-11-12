import type { ReactNode } from 'react';

interface Props {
  eyebrow: string;
  title: string;
  /** Cifra o dato de contexto alineado a la derecha del encabezado. */
  aside?: ReactNode;
  children: ReactNode;
}

/**
 * Contenedor de un gráfico. Mantiene el mismo encabezado en todos los paneles
 * para que las secciones de métricas se lean como una sola familia.
 */
export default function ChartCard({ eyebrow, title, aside, children }: Props) {
  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3 className="mt-1.5 font-display text-[19px] leading-tight text-ink-900">{title}</h3>
        </div>
        {aside && <div className="text-right shrink-0">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
