-- Requisitos de vehículo de la carga. Las cargas existentes quedan sin
-- requisitos (carrocería null = cualquiera, flags en false).

-- AlterTable
ALTER TABLE "loads" ADD COLUMN     "required_body_type" "BodyType",
ADD COLUMN     "requires_hazmat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requires_refrigeration" BOOLEAN NOT NULL DEFAULT false;
