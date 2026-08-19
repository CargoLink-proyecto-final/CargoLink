import {
  cn,
  formatCurrency,
  formatPrice,
  formatDate,
  getStatusColor,
  getStatusLabel,
  getSolicitudStage,
  getSolicitudStageLabel,
} from './utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('dedupes conflicting tailwind classes (last wins)', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, null, 'c')).toBe('a c');
  });
});

describe('formatCurrency', () => {
  it('formats a number as ARS currency', () => {
    const out = formatCurrency(1000);
    // Intl output uses non-breaking spaces; assert on the salient parts.
    expect(out).toMatch(/\$/);
    expect(out).toMatch(/1\.000/);
  });

  it('handles zero', () => {
    expect(formatCurrency(0)).toMatch(/0/);
  });
});

describe('formatPrice', () => {
  it('falls back to "A convenir" when the load has no price', () => {
    expect(formatPrice(null)).toBe('A convenir');
    expect(formatPrice(undefined)).toBe('A convenir');
  });

  it('formats a real price like formatCurrency', () => {
    expect(formatPrice(1000)).toBe(formatCurrency(1000));
  });

  it('does not treat a zero price as missing', () => {
    // 0 es un precio declarado (raro, pero explícito): no es "a convenir".
    expect(formatPrice(0)).toBe(formatCurrency(0));
  });
});

describe('formatDate', () => {
  it('formats an ISO date string in es-AR locale', () => {
    const out = formatDate('2026-01-15T00:00:00.000Z');
    expect(out).toMatch(/2026/);
    expect(typeof out).toBe('string');
  });
});

describe('getStatusColor', () => {
  it('returns the mapped color for a known status', () => {
    expect(getStatusColor('PUBLISHED')).toBe('bg-blue-100 text-blue-800');
    expect(getStatusColor('DELIVERED')).toBe('bg-green-100 text-green-800');
  });

  it('returns the default color for an unknown status', () => {
    expect(getStatusColor('SOMETHING_ELSE')).toBe('bg-gray-100 text-gray-800');
  });
});

describe('getStatusLabel', () => {
  it('returns the Spanish label for a known status', () => {
    expect(getStatusLabel('PENDING')).toBe('Pendiente');
    expect(getStatusLabel('NEGOTIATING')).toBe('En negociación');
  });

  it('echoes the input for an unknown status', () => {
    expect(getStatusLabel('UNKNOWN')).toBe('UNKNOWN');
  });
});

describe('getSolicitudStage', () => {
  it('derives the unified stage from a LoadStatus', () => {
    expect(getSolicitudStage('PUBLISHED')).toBe('CREATED');
    expect(getSolicitudStage('ASSIGNED')).toBe('ASSIGNED');
    expect(getSolicitudStage('IN_TRANSIT')).toBe('STARTED');
    expect(getSolicitudStage('DELIVERED')).toBe('COMPLETED');
  });

  it('derives the unified stage from a TripStatus', () => {
    expect(getSolicitudStage('PENDING')).toBe('CREATED');
    expect(getSolicitudStage('ACCEPTED')).toBe('ASSIGNED');
    expect(getSolicitudStage('IN_PROGRESS')).toBe('STARTED');
    expect(getSolicitudStage('COMPLETED')).toBe('COMPLETED');
  });

  it('maps the shared CANCELLED value', () => {
    expect(getSolicitudStage('CANCELLED')).toBe('CANCELLED');
  });

  it('returns null for a non-load/trip status', () => {
    expect(getSolicitudStage('NEGOTIATING')).toBeNull();
    expect(getSolicitudStage('UNKNOWN')).toBeNull();
  });
});

describe('getSolicitudStageLabel', () => {
  it('labels Load and Trip statuses with the unified vocabulary', () => {
    expect(getSolicitudStageLabel('PUBLISHED')).toBe('Creado');
    expect(getSolicitudStageLabel('ACCEPTED')).toBe('Asignado');
    expect(getSolicitudStageLabel('IN_TRANSIT')).toBe('Iniciado');
    expect(getSolicitudStageLabel('COMPLETED')).toBe('Completado');
    expect(getSolicitudStageLabel('CANCELLED')).toBe('Cancelado');
  });

  it('falls back to the raw status label when not part of the solicitud cycle', () => {
    expect(getSolicitudStageLabel('NEGOTIATING')).toBe('En negociación');
  });
});
