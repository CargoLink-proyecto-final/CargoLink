-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DNI_FRONT', 'DNI_BACK', 'LICENSE_FRONT', 'LICENSE_BACK', 'AFIP_CONSTANCIA', 'VEHICLE_CARD', 'INSURANCE', 'VTV');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('CAMION', 'CAMIONETA', 'FURGON', 'SEMIRREMOLQUE', 'BATEA', 'OTRO');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cuit" TEXT,
ADD COLUMN     "license_category" TEXT,
ADD COLUMN     "license_expires_at" TIMESTAMP(3),
ADD COLUMN     "terms_accepted_at" TIMESTAMP(3),
ADD COLUMN     "terms_accepted_version" TEXT;

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "type" "VehicleType" NOT NULL,
    "max_weight_kg" DOUBLE PRECISION NOT NULL,
    "max_volume_m3" DOUBLE PRECISION,
    "height_cm" DOUBLE PRECISION,
    "width_cm" DOUBLE PRECISION,
    "length_cm" DOUBLE PRECISION,
    "refrigerated" BOOLEAN NOT NULL DEFAULT false,
    "hazardous_materials" BOOLEAN NOT NULL DEFAULT false,
    "bulk_liquid" BOOLEAN NOT NULL DEFAULT false,
    "insurance_expires_at" TIMESTAMP(3),
    "vtv_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "file_url" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_user_id_key" ON "vehicles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_key" ON "vehicles"("plate");

-- CreateIndex
CREATE INDEX "documents_user_id_idx" ON "documents"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_user_id_type_key" ON "documents"("user_id", "type");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
