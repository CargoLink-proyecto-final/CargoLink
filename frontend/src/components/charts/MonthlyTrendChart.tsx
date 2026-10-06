'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';
import type { MoneyMonthPoint } from '@/types';
import {
  CHART_COLORS,
  TONE_COLOR,
  formatCompactCurrency,
  formatMonthLabel,
  formatMonthLong,
  type ChartTone,
} from './chartTheme';

interface Props {
  /** Los 12 meses que devuelve el backend, el más reciente último. */
  data: MoneyMonthPoint[];
  tone?: ChartTone;
  /** Cómo se llama la plata en este panel: "Ingresos", "Gasto", "Facturación". */
  valueLabel: string;
  emptyMessage: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload: MoneyMonthPoint }[];
}

/**
 * Serie mensual de dinero de los últimos 12 meses.
 *
 * Barras y no líneas: cada mes es un total cerrado, no una medición continua,
 * y el mes en curso se destaca con color pleno porque todavía está abierto.
 */
export default function MonthlyTrendChart({
  data,
  tone = 'primary',
  valueLabel,
  emptyMessage,
}: Props) {
  const color = TONE_COLOR[tone];
  const hasActivity = data.some((point) => point.amount > 0);

  const CustomTooltip = ({ active, payload }: TooltipProps) => {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload;
    return (
      <div className="card px-3 py-2 shadow-raised">
        <p className="eyebrow">{formatMonthLong(point.month)}</p>
        <p className="mt-1 font-medium text-[14px] text-ink-900 tabular-nums">
          {formatCurrency(point.amount)}
        </p>
        <p className="text-[12px] text-ink-500">
          {point.trips} viaje{point.trips === 1 ? '' : 's'}
          {point.km > 0 && ` · ${point.km} km`}
        </p>
      </div>
    );
  };

  if (!hasActivity) {
    return (
      <div className="h-[220px] flex items-center justify-center text-center px-6">
        <p className="text-[13px] text-ink-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="h-[220px]" role="img" aria-label={`${valueLabel} por mes, últimos 12 meses`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthLabel}
            tickLine={false}
            axisLine={false}
            tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            tickFormatter={formatCompactCurrency}
            tickLine={false}
            axisLine={false}
            width={62}
            tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={38}>
            {data.map((point, index) => (
              <Cell
                key={point.month}
                fill={color}
                // El mes en curso va pleno; los cerrados, atenuados.
                fillOpacity={index === data.length - 1 ? 1 : 0.55}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
