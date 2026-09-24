import { formatCompactCurrency, formatMonthLabel, formatMonthLong } from './chartTheme';

describe('formatMonthLabel', () => {
  it('shortens YYYY-MM to a two-digit year for the axis', () => {
    expect(formatMonthLabel('2026-06')).toBe('jun 26');
    expect(formatMonthLabel('2025-12')).toBe('dic 25');
    expect(formatMonthLabel('2026-01')).toBe('ene 26');
  });
});

describe('formatMonthLong', () => {
  it('keeps the full year for the tooltip', () => {
    expect(formatMonthLong('2026-06')).toBe('jun. 2026');
  });

  it('falls back to the raw value when the month is out of range', () => {
    expect(formatMonthLong('2026-13')).toBe('2026-13');
  });
});

describe('formatCompactCurrency', () => {
  it('abbreviates the amounts so the Y axis stays narrow', () => {
    // El separador que mete Intl varía según la versión de ICU, así que
    // verificamos las partes que nos importan, no el string completo.
    const formatted = formatCompactCurrency(1_200_000);
    expect(formatted).toContain('$');
    expect(formatted).toContain('1,2');
    expect(formatted.length).toBeLessThan(10);
  });
});
