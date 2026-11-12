import { DependencyStatus } from './dependency-checks';
import { StatusSignals, computeOverallStatus } from './system-status';

const dep = (overrides: Partial<DependencyStatus> = {}): DependencyStatus => ({
  name: 'OSRM (rutas)',
  state: 'UP',
  latencyMs: 120,
  detail: null,
  checkedAt: '2026-10-15T12:00:00.000Z',
  ...overrides,
});

const healthy: StatusSignals = {
  databaseUp: true,
  dependencies: [dep()],
  recentErrorRate: 0.001,
  eventLoopP99Ms: 20,
  heapUsedRatio: 0.4,
  heartbeatFailures: 0,
};

describe('computeOverallStatus', () => {
  it('is OK when every signal is within thresholds', () => {
    expect(computeOverallStatus(healthy)).toEqual({ state: 'OK', reasons: [] });
  });

  it('is DOWN when the database does not respond, regardless of the rest', () => {
    const result = computeOverallStatus({ ...healthy, databaseUp: false });
    expect(result.state).toBe('DOWN');
    expect(result.reasons).toEqual(['La base de datos no responde']);
  });

  it('is DEGRADED with a reason per problem found', () => {
    const result = computeOverallStatus({
      ...healthy,
      recentErrorRate: 0.12,
      dependencies: [dep({ state: 'DOWN' }), dep({ name: 'SMTP (mails)', state: 'DEGRADED', latencyMs: 2100 })],
      eventLoopP99Ms: 450,
      heapUsedRatio: 0.9,
      heartbeatFailures: 3,
    });
    expect(result.state).toBe('DEGRADED');
    expect(result.reasons).toEqual([
      '12% de errores 5xx en los últimos 15 minutos',
      '3 latidos seguidos sin poder escribir en la DB',
      'OSRM (rutas) no responde',
      'SMTP (mails) responde lento (2100 ms)',
      'Event loop trabado: p99 de 450 ms',
      'Memoria al 90% del límite',
    ]);
  });

  it('does not flag an unconfigured dependency or a window without traffic', () => {
    const result = computeOverallStatus({
      ...healthy,
      recentErrorRate: null,
      dependencies: [dep({ name: 'SMTP (mails)', state: 'NOT_CONFIGURED', latencyMs: null })],
    });
    expect(result.state).toBe('OK');
  });

  it('tolerates a single failed heartbeat (a blip, not an outage)', () => {
    expect(computeOverallStatus({ ...healthy, heartbeatFailures: 1 }).state).toBe('OK');
  });
});
