import { render, screen } from '@testing-library/react';
import { Package } from 'lucide-react';
import StatCard from './StatCard';

describe('StatCard', () => {
  it('renders the label and value', () => {
    render(<StatCard label="Cargas activas" value={42} icon={Package} />);
    expect(screen.getByText('Cargas activas')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders a string value as-is', () => {
    render(<StatCard label="Estado" value="OK" icon={Package} />);
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('renders the icon (svg) passed in', () => {
    const { container } = render(<StatCard label="x" value={1} icon={Package} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders the hint when provided', () => {
    render(<StatCard label="x" value={1} icon={Package} hint="vs mes pasado" />);
    expect(screen.getByText('vs mes pasado')).toBeInTheDocument();
  });

  it('omits the hint when not provided', () => {
    render(<StatCard label="x" value={1} icon={Package} />);
    expect(screen.queryByText('vs mes pasado')).not.toBeInTheDocument();
  });

  it('applies the default ink tone classes', () => {
    const { container } = render(<StatCard label="x" value={1} icon={Package} />);
    // icon wrapper carries the tone icon classes
    expect(container.querySelector('.text-ink-900.bg-ink-100')).toBeInTheDocument();
    // accent rule
    expect(container.querySelector('.bg-ink-800')).toBeInTheDocument();
  });

  it('applies a specified tone (primary)', () => {
    const { container } = render(<StatCard label="x" value={1} icon={Package} tone="primary" />);
    expect(container.querySelector('.text-primary-700.bg-primary-50')).toBeInTheDocument();
    expect(container.querySelector('.bg-primary-500')).toBeInTheDocument();
  });
});
