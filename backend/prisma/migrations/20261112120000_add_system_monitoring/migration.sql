-- CreateTable
CREATE TABLE "uptime_sessions" (
    "id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "version" TEXT,

    CONSTRAINT "uptime_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_metrics" (
    "id" TEXT NOT NULL,
    "bucket" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "client_errors" INTEGER NOT NULL,
    "server_errors" INTEGER NOT NULL,
    "total_ms" DOUBLE PRECISION NOT NULL,
    "max_ms" DOUBLE PRECISION NOT NULL,
    "histogram" INTEGER[],

    CONSTRAINT "request_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uptime_sessions_started_at_idx" ON "uptime_sessions"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "request_metrics_bucket_method_route_key" ON "request_metrics"("bucket", "method", "route");

