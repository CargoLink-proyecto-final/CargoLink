-- CreateEnum
CREATE TYPE "PostulationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "postulations" (
    "id" TEXT NOT NULL,
    "load_id" TEXT NOT NULL,
    "transporter_id" TEXT NOT NULL,
    "message" TEXT,
    "proposed_price" DOUBLE PRECISION,
    "status" "PostulationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "postulations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "postulations_load_id_status_idx" ON "postulations"("load_id", "status");

-- CreateIndex
CREATE INDEX "postulations_transporter_id_idx" ON "postulations"("transporter_id");

-- CreateIndex
CREATE UNIQUE INDEX "postulations_load_id_transporter_id_key" ON "postulations"("load_id", "transporter_id");

-- AddForeignKey
ALTER TABLE "postulations" ADD CONSTRAINT "postulations_load_id_fkey" FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postulations" ADD CONSTRAINT "postulations_transporter_id_fkey" FOREIGN KEY ("transporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
