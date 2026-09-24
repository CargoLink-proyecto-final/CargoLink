import { render, screen } from '@testing-library/react';
import RankingBars from './RankingBars';

const items = [
  { id: 'a', label: 'Transportes Sur', value: 1000, hint: '3 viajes' },
  { id: 'b', label: 'Fletes Norte', value: 250, href: '/dashboard/company-admin/drivers/b' },
];

describe('RankingBars', () => {
  it('shows the empty message instead of an empty chart', () => {
    render(<RankingBars items={[]} formatValue={String} emptyMessage="Sin datos aún." />);
    expect(screen.getByText('Sin datos aún.')).toBeInTheDocument();
  });

  it('scales each bar against the largest value', () => {
    const { container } = render(
      <RankingBars items={items} formatValue={(v) => `$${v}`} emptyMessage="—" />,
    );

    const bars = container.querySelectorAll('li > div > div');
    expect(bars).toHaveLength(2);
    expect((bars[0] as HTMLElement).style.width).toBe('100%');
    expect((bars[1] as HTMLElement).style.width).toBe('25%');
  });

  it('renders values, hints and links to the detail when there is one', () => {
    render(<RankingBars items={items} formatValue={(v) => `$${v}`} emptyMessage="—" />);

    expect(screen.getByText('$1000')).toBeInTheDocument();
    expect(screen.getByText('3 viajes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fletes Norte' })).toHaveAttribute(
      'href',
      '/dashboard/company-admin/drivers/b',
    );
    // Sin href la fila es texto plano, no un link muerto.
    expect(screen.queryByRole('link', { name: 'Transportes Sur' })).not.toBeInTheDocument();
  });

  it('keeps a sliver visible for a zero value so the row does not look broken', () => {
    const { container } = render(
      <RankingBars
        items={[{ id: 'z', label: 'Sin gasto', value: 0 }]}
        formatValue={String}
        emptyMessage="—"
      />,
    );

    const bar = container.querySelector('li > div > div') as HTMLElement;
    expect(bar.style.width).toBe('2%');
  });
});
