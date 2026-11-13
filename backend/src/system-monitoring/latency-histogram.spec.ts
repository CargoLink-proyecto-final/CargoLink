import {
  HISTOGRAM_SIZE,
  LATENCY_BOUNDS_MS,
  bucketIndex,
  emptyHistogram,
  mergeHistogramInto,
  percentileFromHistogram,
} from './latency-histogram';

describe('latency histogram', () => {
  it('places each latency in the first bucket whose bound covers it', () => {
    expect(bucketIndex(0)).toBe(0);
    expect(bucketIndex(10)).toBe(0);
    expect(bucketIndex(11)).toBe(1);
    expect(bucketIndex(250)).toBe(4);
    expect(bucketIndex(10_000)).toBe(LATENCY_BOUNDS_MS.length - 1);
  });

  it('sends anything slower than the last bound to the open overflow bucket', () => {
    expect(bucketIndex(10_001)).toBe(LATENCY_BOUNDS_MS.length);
    expect(emptyHistogram()).toHaveLength(HISTOGRAM_SIZE);
  });

  it('merges histograms bucket by bucket', () => {
    const a = [1, 2, 0];
    expect(mergeHistogramInto(a, [0, 3, 4])).toEqual([1, 5, 4]);
  });

  it('returns null for an empty histogram', () => {
    expect(percentileFromHistogram(emptyHistogram(), 0.95, 0)).toBeNull();
  });

  it('interpolates the percentile inside the bucket where it falls', () => {
    const h = emptyHistogram();
    h[bucketIndex(40)] = 100; // los 100 requests en (25, 50]
    // p50 → mitad del bucket (25..50) = 37.5 → 38
    expect(percentileFromHistogram(h, 0.5, 50)).toBe(38);
    expect(percentileFromHistogram(h, 1, 50)).toBe(50);
  });

  it('does not report a percentile above the slowest request actually seen', () => {
    const h = emptyHistogram();
    h[bucketIndex(300)] = 10; // bucket (250, 500] pero el máximo real fue 300
    expect(percentileFromHistogram(h, 1, 300)).toBe(300);
  });

  it('uses the real max when the percentile lands in the overflow bucket', () => {
    const h = emptyHistogram();
    h[0] = 90;
    h[LATENCY_BOUNDS_MS.length] = 10;
    expect(percentileFromHistogram(h, 0.99, 42_000)).toBe(42_000);
    expect(percentileFromHistogram(h, 0.5, 42_000)).toBeLessThanOrEqual(10);
  });
});
