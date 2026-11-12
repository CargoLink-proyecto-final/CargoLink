import {
  EMPTY,
  formatCompactCurrency,
  formatDuration,
  formatHours,
  formatMonth,
  formatMs,
  formatRatio,
  formatUptime,
} from './adminMetrics';

describe('admin metrics formatters', () => {
  it('shows missing data as a dash, never as zero', () => {
    expect(formatRatio(null)).toBe(EMPTY);
    expect(formatUptime(undefined)).toBe(EMPTY);
    expect(formatMs(null)).toBe(EMPTY);
    expect(formatHours(null)).toBe(EMPTY);
    expect(formatRatio(0)).toBe('0%');
  });

  it('formats ratios as Argentine percentages', () => {
    expect(formatRatio(0.7234)).toBe('72%');
    expect(formatRatio(0.7234, 1)).toBe('72,3%');
  });

  it('keeps enough decimals in uptime to tell 99% from 99.9%', () => {
    expect(formatUptime(1)).toBe('100%');
    expect(formatUptime(0.999)).toBe('99,90%');
    expect(formatUptime(0.95)).toBe('95,0%');
  });

  it('formats latencies in ms or seconds', () => {
    expect(formatMs(87.4)).toBe('87 ms');
    expect(formatMs(2350)).toBe('2,4 s');
  });

  it('formats durations at the coarsest useful unit', () => {
    expect(formatDuration(42)).toBe('42 s');
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(3725)).toBe('1 h 2 min');
    expect(formatDuration(7200)).toBe('2 h');
    expect(formatDuration(90000)).toBe('1 d 1 h');
  });

  it('formats hours, switching to minutes or days at the extremes', () => {
    expect(formatHours(0.5)).toBe('30 min');
    expect(formatHours(5.25)).toBe('5,3 h');
    expect(formatHours(72)).toBe('3 días');
  });

  it('formats month keys and compact amounts', () => {
    expect(formatMonth('2026-10')).toBe('oct');
    expect(formatMonth('2026-01', true)).toBe('ene 26');
    expect(formatCompactCurrency(1_250_000)).toBe('$1,3 M');
    expect(formatCompactCurrency(85_000)).toBe('$85 mil');
    expect(formatCompactCurrency(950)).toBe('$950');
  });
});
