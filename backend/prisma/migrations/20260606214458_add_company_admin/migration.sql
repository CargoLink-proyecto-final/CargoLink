-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'COMPANY_ADMIN';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "company_id" TEXT;

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_join_requests" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "transporter_id" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "company_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_owner_id_key" ON "companies"("owner_id");

-- CreateIndex
CREATE INDEX "company_join_requests_company_id_status_idx" ON "company_join_requests"("company_id", "status");

-- CreateIndex
CREATE INDEX "company_join_requests_transporter_id_idx" ON "company_join_requests"("transporter_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_join_requests_company_id_transporter_id_key" ON "company_join_requests"("company_id", "transporter_id");

-- CreateIndex
CREATE INDEX "users_company_id_idx" ON "users"("company_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_join_requests" ADD CONSTRAINT "company_join_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_join_requests" ADD CONSTRAINT "company_join_requests_transporter_id_fkey" FOREIGN KEY ("transporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
