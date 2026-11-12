import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import type { SystemHealth, SystemMetrics } from '@/types/adminMetrics';
import SystemMonitoringPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/dashboard/admin/system',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/store/auth', () => ({ useAuthStore: jest.fn() }));

jest.mock('@/components/layout/Sidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="sidebar" />,
}));

jest.mock('@/lib/api', () => ({
  adminMetricsApi: { getSystemHealth: jest.fn(), getSystemMetrics: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { adminMetricsApi } = require('@/lib/api') as { adminMetricsApi: Record<string, jest.Mock> };

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const latency = {
  requests: 12000,
  errorRate: 0.004,
  clientErrorRate: 0.03,
  avgMs: 60,
  p50Ms: 35,
  p95Ms: 240,
  p99Ms: 900,
  maxMs: 4200,
};

const HEALTH: SystemHealth = {
  status: 'OK',
  reasons: [],
  checkedAt: '2026-10-15T12:00:00.000Z',
  process: {
    uptimeSeconds: 93_600,
    startedAt: '2026-10-14T10:00:00.000Z',
    version: null,
    nodeVersion: 'v20.11.0',
    lastHeartbeatAt: '2026-10-15T11:59:30.000Z',
  },
  memory: { rssMb: 180, heapUsedMb: 90, heapLimitMb: 2048 },
  eventLoop: { p50Ms: 10, p99Ms: 22, maxMs: 40 },
  database: { up: true, latencyMs: 3, detail: null },
  dependencies: [
    { name: 'OSRM (rutas)', state: 'UP', latencyMs: 320, detail: null, checkedAt: '2026-10-15T12:00:00.000Z' },
    {
      name: 'SMTP (mails)',
      state: 'NOT_CONFIGURED',
      latencyMs: null,
      detail: 'Sin SMTP configurado',
      checkedAt: '2026-10-15T12:00:00.000Z',
    },
  ],
  realtime: { onlineUsers: 4, connections: 6 },
  recentRequests: { ...latency, windowMinutes: 15 },
};

const METRICS: SystemMetrics = {
  range: '24h',
  from: '2026-10-14T12:00:00.000Z',
  to: '2026-10-15T12:00:00.000Z',
  stepMinutes: 60,
  uptime: {
    uptimeRatio: 0.9965,
    downtimeSeconds: 300,
    unplannedDowntimeSeconds: 240,
    crashes: 1,
    restarts: 2,
    measuredFrom: '2026-10-14T12:00:00.000Z',
    incidents: [
      { from: '2026-10-15T03:00:00.000Z', to: '2026-10-15T03:04:00.000Z', durationSeconds: 240, kind: 'CRASH' },
      { from: '2026-10-14T20:00:00.000Z', to: '2026-10-14T20:01:00.000Z', durationSeconds: 60, kind: 'PLANNED' },
    ],
  },
  requests: {
    overall: latency,
    slowestRoutes: [{ ...latency, method: 'GET', route: '/api/loads/:id', serverErrors: 0, p95Ms: 1200 }],
    failingRoutes: [{ ...latency, method: 'POST', route: '/api/trips/:id/complete', serverErrors: 7, errorRate: 0.07 }],
    timeline: [
      { at: '2026-10-15T10:00:00.000Z', requests: 500, serverErrors: 2, p95Ms: 200 },
      { at: '2026-10-15T11:00:00.000Z', requests: 600, serverErrors: 0, p95Ms: 260 },
    ],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  (useAuthStore as unknown as jest.Mock).mockImplementation((sel?: (s: unknown) => unknown) => {
    const state = { isAuthenticated: true, user: { id: 'a1', role: 'ADMIN' } };
    return sel ? sel(state) : state;
  });
  adminMetricsApi.getSystemHealth.mockResolvedValue({ data: HEALTH });
  adminMetricsApi.getSystemMetrics.mockResolvedValue({ data: METRICS });
});

describe('SystemMonitoringPage', () => {
  it('shows availability, crashes, p95 and server error rate for the range', async () => {
    renderWithClient(<SystemMonitoringPage />);

    expect(await screen.findByText('99,65%')).toBeInTheDocument();
    expect(screen.getByText('5 min fuera de servicio')).toBeInTheDocument();
    expect(screen.getByText('2 reinicios en total (incluye deploys)')).toBeInTheDocument();
    expect(screen.getByText('240 ms')).toBeInTheDocument();
    expect(screen.getByText('0,40%')).toBeInTheDocument();
  });

  it('tells crashes apart from planned restarts', async () => {
    renderWithClient(<SystemMonitoringPage />);

    expect(await screen.findByText('Caída')).toBeInTheDocument();
    expect(screen.getByText('Planificado')).toBeInTheDocument();
    expect(screen.getByText('4 min')).toBeInTheDocument();
  });

  it('lists the slowest and failing endpoints by route template', async () => {
    renderWithClient(<SystemMonitoringPage />);

    expect(await screen.findByText('/api/loads/:id')).toBeInTheDocument();
    expect(screen.getByText('1,2 s')).toBeInTheDocument();
    expect(screen.getByText('/api/trips/:id/complete')).toBeInTheDocument();
    expect(screen.getByText('7 (7,0%)')).toBeInTheDocument();
  });

  it('refetches the history when the range changes', async () => {
    renderWithClient(<SystemMonitoringPage />);
    await screen.findByText('99,65%');

    fireEvent.click(screen.getByRole('tab', { name: '7 días' }));

    await waitFor(() => expect(adminMetricsApi.getSystemMetrics).toHaveBeenCalledWith('7d'));
    expect(screen.getByRole('tab', { name: '7 días' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows live dependency status, including unconfigured ones', async () => {
    renderWithClient(<SystemMonitoringPage />);

    expect(await screen.findByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByText('OSRM (rutas)')).toBeInTheDocument();
    expect(screen.getByText('Sin configurar')).toBeInTheDocument();
    expect(screen.getByText('4 usuarios conectados')).toBeInTheDocument();
    expect(screen.getByText('Operativo')).toBeInTheDocument();
  });

  it('explains why the system is degraded', async () => {
    adminMetricsApi.getSystemHealth.mockResolvedValue({
      data: { ...HEALTH, status: 'DEGRADED', reasons: ['OSRM (rutas) no responde'] },
    });
    renderWithClient(<SystemMonitoringPage />);

    expect(await screen.findByText('Servicio degradado')).toBeInTheDocument();
    expect(screen.getByText('OSRM (rutas) no responde')).toBeInTheDocument();
  });

  it('flags the backend as down when the health endpoint does not answer', async () => {
    adminMetricsApi.getSystemHealth.mockRejectedValue(new Error('Network Error'));
    renderWithClient(<SystemMonitoringPage />);

    expect(await screen.findByText('El backend no responde')).toBeInTheDocument();
    expect(screen.getByText('Caído')).toBeInTheDocument();
  });
});
