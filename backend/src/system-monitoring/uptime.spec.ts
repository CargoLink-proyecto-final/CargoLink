import { computeUptime, SessionForUptime } from './uptime';

const t = (iso: string) => new Date(`2026-10-15T${iso}:00.000Z`);

const session = (startedAt: string, lastSeenAt: string, endedAt: string | null = null): SessionForUptime => ({
  startedAt: t(startedAt),
  lastSeenAt: t(lastSeenAt),
  endedAt: endedAt ? t(endedAt) : null,
});

describe('computeUptime', () => {
  const now = t('12:00');

  it('returns no data when the backend never recorded a session', () => {
    const result = computeUptime([], t('00:00'), now);
    expect(result.uptimeRatio).toBeNull();
    expect(result.measuredFrom).toBeNull();
    expect(result.incidents).toEqual([]);
  });

  it('reports full availability for a single session that is still running', () => {
    const result = computeUptime([session('00:00', '11:59')], t('00:00'), now);
    expect(result.uptimeRatio).toBe(1);
    expect(result.restarts).toBe(0);
    expect(result.incidents).toEqual([]);
  });

  it('classifies a gap after a session without endedAt as a crash', () => {
    const result = computeUptime(
      [session('00:00', '06:00'), session('06:30', '11:59')],
      t('00:00'),
      now,
    );
    expect(result.crashes).toBe(1);
    expect(result.incidents).toEqual([
      { from: t('06:00'), to: t('06:30'), durationSeconds: 1800, kind: 'CRASH' },
    ]);
    expect(result.unplannedDowntimeSeconds).toBe(1800);
    // 30 min caído sobre 12 h medidas
    expect(result.uptimeRatio).toBeCloseTo(1 - 1800 / (12 * 3600), 6);
  });

  it('classifies a gap after a graceful shutdown as planned and keeps it out of unplanned downtime', () => {
    const result = computeUptime(
      [session('00:00', '05:59', '06:00'), session('06:02', '11:59')],
      t('00:00'),
      now,
    );
    expect(result.incidents[0]).toMatchObject({ kind: 'PLANNED', durationSeconds: 120 });
    expect(result.crashes).toBe(0);
    expect(result.restarts).toBe(1);
    expect(result.downtimeSeconds).toBe(120);
    expect(result.unplannedDowntimeSeconds).toBe(0);
  });

  it('ignores restarts so fast they never left a visible gap', () => {
    const sessions = [
      { startedAt: t('00:00'), lastSeenAt: t('05:59'), endedAt: new Date(t('06:00').getTime()) },
      { startedAt: new Date(t('06:00').getTime() + 2000), lastSeenAt: t('11:59'), endedAt: null },
    ];
    const result = computeUptime(sessions, t('00:00'), now);
    expect(result.incidents).toEqual([]);
    expect(result.restarts).toBe(1);
  });

  it('does not count time before monitoring existed as downtime', () => {
    const result = computeUptime([session('10:00', '11:59')], t('00:00'), now);
    expect(result.measuredFrom).toEqual(t('10:00'));
    expect(result.uptimeRatio).toBe(1);
  });

  it('clips an outage that started before the range to the part inside it', () => {
    const result = computeUptime(
      [session('00:00', '01:00'), session('03:00', '11:59')],
      t('02:00'),
      now,
    );
    expect(result.incidents).toEqual([
      { from: t('02:00'), to: t('03:00'), durationSeconds: 3600, kind: 'CRASH' },
    ]);
  });

  it('leaves out outages that ended before the range', () => {
    const result = computeUptime(
      [session('00:00', '01:00'), session('01:30', '11:59')],
      t('02:00'),
      now,
    );
    expect(result.incidents).toEqual([]);
    expect(result.restarts).toBe(0);
  });

  it('lists the most recent incident first', () => {
    const result = computeUptime(
      [session('00:00', '01:00'), session('02:00', '05:00'), session('06:00', '11:59')],
      t('00:00'),
      now,
    );
    expect(result.incidents.map((i) => i.from)).toEqual([t('05:00'), t('01:00')]);
  });
});
