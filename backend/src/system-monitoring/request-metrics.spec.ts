import { bucketIndex, emptyHistogram } from './latency-histogram';
import { MIN_REQUESTS_FOR_RANKING, RequestMetricRow, aggregateRequestMetrics } from './request-metrics';
import { RequestMetricsRecorder } from './request-metrics.recorder';

const HOUR = 3600_000;
const from = new Date('2026-10-15T00:00:00.000Z');
const to = new Date('2026-10-15T03:00:00.000Z');

function row(overrides: Partial<RequestMetricRow> & { latencyMs?: number }): RequestMetricRow {
  const { latencyMs = 40, ...rest } = overrides;
  const count = rest.count ?? 1;
  const histogram = emptyHistogram();
  histogram[bucketIndex(latencyMs)] = count;
  return {
    bucket: new Date('2026-10-15T00:10:00.000Z'),
    method: 'GET',
    route: '/api/loads',
    count,
    clientErrors: 0,
    serverErrors: 0,
    totalMs: latencyMs * count,
    maxMs: latencyMs,
    histogram,
    ...rest,
  };
}

describe('aggregateRequestMetrics', () => {
  it('returns an empty report (with a zeroed timeline) when there was no traffic', () => {
    const report = aggregateRequestMetrics([], from, to, HOUR);
    expect(report.overall).toMatchObject({ requests: 0, errorRate: null, p95Ms: null });
    expect(report.timeline).toHaveLength(3);
    expect(report.timeline.every((p) => p.requests === 0)).toBe(true);
  });

  it('computes overall error rate and averages across rows', () => {
    const report = aggregateRequestMetrics(
      [row({ count: 90, latencyMs: 40 }), row({ count: 10, latencyMs: 40, serverErrors: 5, clientErrors: 2 })],
      from,
      to,
      HOUR,
    );
    expect(report.overall.requests).toBe(100);
    expect(report.overall.errorRate).toBe(0.05);
    expect(report.overall.clientErrorRate).toBe(0.02);
    expect(report.overall.avgMs).toBe(40);
  });

  it('places each row in its timeline slot', () => {
    const report = aggregateRequestMetrics(
      [
        row({ bucket: new Date('2026-10-15T00:30:00.000Z'), count: 3 }),
        row({ bucket: new Date('2026-10-15T02:05:00.000Z'), count: 2, serverErrors: 1 }),
      ],
      from,
      to,
      HOUR,
    );
    expect(report.timeline.map((p) => [p.at, p.requests, p.serverErrors])).toEqual([
      ['2026-10-15T00:00:00.000Z', 3, 0],
      ['2026-10-15T01:00:00.000Z', 0, 0],
      ['2026-10-15T02:00:00.000Z', 2, 1],
    ]);
  });

  it('ranks slowest routes by p95 and ignores routes with too little traffic', () => {
    const report = aggregateRequestMetrics(
      [
        row({ route: '/api/loads', count: MIN_REQUESTS_FOR_RANKING, latencyMs: 40 }),
        row({ route: '/api/trips/:id', count: MIN_REQUESTS_FOR_RANKING, latencyMs: 900 }),
        row({ route: '/api/rare', count: 2, latencyMs: 8000 }),
      ],
      from,
      to,
      HOUR,
    );
    expect(report.slowestRoutes.map((r) => r.route)).toEqual(['/api/trips/:id', '/api/loads']);
  });

  it('lists only routes with 5xx as failing, most errors first', () => {
    const report = aggregateRequestMetrics(
      [
        row({ route: '/api/a', serverErrors: 1 }),
        row({ route: '/api/b', count: 5, serverErrors: 4 }),
        row({ route: '/api/c', clientErrors: 1 }),
      ],
      from,
      to,
      HOUR,
    );
    expect(report.failingRoutes.map((r) => [r.route, r.serverErrors])).toEqual([
      ['/api/b', 4],
      ['/api/a', 1],
    ]);
  });
});

describe('RequestMetricsRecorder', () => {
  const at = (iso: string) => new Date(`2026-10-15T${iso}Z`);

  it('accumulates requests per minute and endpoint', () => {
    const recorder = new RequestMetricsRecorder();
    recorder.record('GET', '/api/loads', 200, 30, at('10:00:05'));
    recorder.record('GET', '/api/loads', 404, 50, at('10:00:40'));
    recorder.record('GET', '/api/loads', 503, 700, at('10:00:59'));
    recorder.record('POST', '/api/loads', 201, 80, at('10:00:10'));

    const rows = recorder.drain(at('10:01:00'));
    const get = rows.find((r) => r.method === 'GET')!;
    expect(rows).toHaveLength(2);
    expect(get).toMatchObject({ count: 3, clientErrors: 1, serverErrors: 1, totalMs: 780, maxMs: 700 });
    expect(get.bucket).toEqual(at('10:00:00'));
    expect(get.histogram.reduce((s, n) => s + n, 0)).toBe(3);
  });

  it('keeps the minute in progress until it closes, unless asked for everything', () => {
    const recorder = new RequestMetricsRecorder();
    recorder.record('GET', '/api/loads', 200, 30, at('10:00:05'));
    recorder.record('GET', '/api/loads', 200, 30, at('10:01:05'));

    expect(recorder.drain(at('10:01:30')).map((r) => r.bucket)).toEqual([at('10:00:00')]);
    expect(recorder.pendingStats().count).toBe(1);
    expect(recorder.drain(at('10:01:30'), true)).toHaveLength(1);
    expect(recorder.pendingStats().count).toBe(0);
  });
});
