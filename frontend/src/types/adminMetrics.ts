// Respuestas de los endpoints del panel del admin de plataforma:
// GET /admin/metrics, GET /admin/system/health y GET /admin/system/metrics.
// Van en un archivo propio (no en types/index.ts) porque son exclusivas del admin.

export interface PlatformMetrics {
  generatedAt: string;
  windowDays: number;
  users: {
    byRole: Partial<Record<'CARGO_GENERATOR' | 'TRANSPORTER' | 'ADMIN' | 'COMPANY_ADMIN', number>>;
    total: number;
    activeLast30Days: { shippers: number; transporters: number };
    monthlySignups: { month: string; byRole: Record<string, number>; total: number }[];
  };
  now: { loadsOpen: number; tripsInProgress: number };
  marketplace: {
    loadsPublished: number;
    assignmentRate: number | null;
    avgPostulationsPerLoad: number | null;
    medianHoursToFirstPostulation: number | null;
    counterOfferRate: number | null;
    unansweredLoads: { id: string; title: string; shipperName: string; createdAt: string; hoursWaiting: number }[];
  };
  trips: {
    volumeThisMonth: number;
    tripsCompletedThisMonth: number;
    monthlyVolume: { month: string; amount: number; trips: number }[];
    avgPricePerKm: number | null;
    onTimeRate: number | null;
    cancellationRate: number | null;
    avgTripHours: number | null;
  };
  verification: {
    pendingDocuments: number;
    stalePendingDocuments: number;
    oldestPendingAt: string | null;
    avgReviewHours: number | null;
    rejectionRate: number | null;
  };
  expiryAlerts: {
    userId: string;
    userName: string;
    kind: 'LICENSE' | 'INSURANCE' | 'VTV';
    expiresAt: string;
    daysLeft: number;
  }[];
  ratings: { average: number | null; count: number };
}

export type OverallState = 'OK' | 'DEGRADED' | 'DOWN';
export type DependencyState = 'UP' | 'DOWN' | 'DEGRADED' | 'NOT_CONFIGURED';

export interface DependencyStatus {
  name: string;
  state: DependencyState;
  latencyMs: number | null;
  detail: string | null;
  checkedAt: string;
}

export interface LatencySummary {
  requests: number;
  errorRate: number | null;
  clientErrorRate: number | null;
  avgMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
}

export interface SystemHealth {
  status: OverallState;
  reasons: string[];
  checkedAt: string;
  process: {
    uptimeSeconds: number;
    startedAt: string;
    version: string | null;
    nodeVersion: string;
    lastHeartbeatAt: string | null;
  };
  memory: { rssMb: number; heapUsedMb: number; heapLimitMb: number };
  eventLoop: { p50Ms: number; p99Ms: number; maxMs: number };
  database: { up: boolean; latencyMs: number | null; detail: string | null };
  dependencies: DependencyStatus[];
  realtime: { onlineUsers: number; connections: number };
  recentRequests: LatencySummary & { windowMinutes: number };
}

export type MonitoringRange = '24h' | '7d' | '30d';

export interface RouteSummary extends LatencySummary {
  method: string;
  route: string;
  serverErrors: number;
}

export interface DowntimeIncident {
  from: string;
  to: string;
  durationSeconds: number;
  kind: 'CRASH' | 'PLANNED';
}

export interface SystemMetrics {
  range: MonitoringRange;
  from: string;
  to: string;
  stepMinutes: number;
  uptime: {
    uptimeRatio: number | null;
    downtimeSeconds: number;
    unplannedDowntimeSeconds: number;
    crashes: number;
    restarts: number;
    measuredFrom: string | null;
    incidents: DowntimeIncident[];
  };
  requests: {
    overall: LatencySummary;
    slowestRoutes: RouteSummary[];
    failingRoutes: RouteSummary[];
    timeline: { at: string; requests: number; serverErrors: number; p95Ms: number | null }[];
  };
}
