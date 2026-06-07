import { render, screen } from '@testing-library/react';
import StatusBadge from './StatusBadge';
import { getStatusLabel } from '@/lib/utils';

describe('StatusBadge', () => {
  it('renders the Spanish label for a known status', () => {
    render(<StatusBadge status="DELIVERED" />);
    expect(screen.getByText(getStatusLabel('DELIVERED'))).toBeInTheDocument();
    expect(screen.getByText('Entregado')).toBeInTheDocument();
  });

  it('echoes the raw status when unknown', () => {
    render(<StatusBadge status="SOMETHING_ELSE" />);
    expect(screen.getByText('SOMETHING_ELSE')).toBeInTheDocument();
  });

  it('applies the success tone classes for DELIVERED', () => {
    const { container } = render(<StatusBadge status="DELIVERED" />);
    const badge = container.querySelector('span');
    expect(badge).toHaveClass('text-success-700');
    expect(badge).toHaveClass('ring-success-600/15');
    // the colored dot
    expect(container.querySelector('.bg-success-600')).toBeInTheDocument();
  });

  it('applies the danger tone classes for CANCELLED', () => {
    const { container } = render(<StatusBadge status="CANCELLED" />);
    const badge = container.querySelector('span');
    expect(badge).toHaveClass('text-danger-700');
    expect(container.querySelector('.bg-danger-600')).toBeInTheDocument();
  });

  it('falls back to the neutral tone for an unmapped status', () => {
    const { container } = render(<StatusBadge status="WHATEVER" />);
    const badge = container.querySelector('span');
    expect(badge).toHaveClass('text-ink-700');
    expect(container.querySelector('.bg-ink-500')).toBeInTheDocument();
  });

  it('uses the small size padding by default', () => {
    const { container } = render(<StatusBadge status="PUBLISHED" />);
    const badge = container.querySelector('span');
    expect(badge).toHaveClass('px-2', 'py-0.5', 'text-[10px]');
  });

  it('uses the md size padding when size="md"', () => {
    const { container } = render(<StatusBadge status="PUBLISHED" size="md" />);
    const badge = container.querySelector('span');
    expect(badge).toHaveClass('px-2.5', 'py-1', 'text-[11px]');
  });

  it('merges a custom className', () => {
    const { container } = render(<StatusBadge status="PUBLISHED" className="custom-x" />);
    const badge = container.querySelector('span');
    expect(badge).toHaveClass('custom-x');
  });

  it('marks the dot as aria-hidden', () => {
    const { container } = render(<StatusBadge status="PUBLISHED" />);
    const dot = container.querySelector('[aria-hidden]');
    expect(dot).toBeInTheDocument();
  });
});
