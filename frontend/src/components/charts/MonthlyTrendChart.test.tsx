import { render, screen } from '@testing-library/react';
import MonthlyTrendChart from './MonthlyTrendChart';

const months = (amounts: number[]) =>
  amounts.map((amount, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    amount,
    trips: amount > 0 ? 1 : 0,
    km: amount > 0 ? 100 : 0,
  }));

describe('MonthlyTrendChart', () => {
  it('explains the emptiness instead of drawing 12 bars en cero', () => {
    render(
      <MonthlyTrendChart
        data={months([0, 0, 0])}
        valueLabel="Ingresos"
        emptyMessage="Todavía no cerraste viajes."
      />,
    );

    expect(screen.getByText('Todavía no cerraste viajes.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('draws the chart with an accessible description once there is activity', () => {
    render(
      <MonthlyTrendChart
        data={months([0, 5000, 0])}
        valueLabel="Gasto"
        emptyMessage="Sin actividad."
      />,
    );

    expect(screen.queryByText('Sin actividad.')).not.toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Gasto por mes, últimos 12 meses' }),
    ).toBeInTheDocument();
  });
});
