import { cn, formatCurrency, formatDate, getStatusColor, getStatusLabel } from './utils';

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
