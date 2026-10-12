-- Separa el tipo de vehículo en dos ejes: unidad (tamaño, informativo) y
-- carrocería (lo que la carga le exige). El VehicleType anterior mezclaba
-- ambos (FURGON y BATEA son carrocerías; CAMION y SEMIRREMOLQUE son unidades).

-- CreateEnum
CREATE TYPE "VehicleUnit" AS ENUM ('CAMIONETA', 'CHASIS', 'BALANCIN', 'SEMIRREMOLQUE');

-- CreateEnum
CREATE TYPE "BodyType" AS ENUM ('CERRADA', 'ABIERTA', 'VOLCADORA', 'CISTERNA');

-- Columnas nuevas nullable para poder convertir los vehículos existentes.
ALTER TABLE "vehicles" ADD COLUMN "unit" "VehicleUnit",
ADD COLUMN "body_type" "BodyType";

-- Conversión best effort desde el tipo anterior. El transportista puede
-- corregirla desde su perfil (y si cambia, la documentación vuelve a revisión).
UPDATE "vehicles" SET
  "unit" = CASE "type"
    WHEN 'CAMIONETA' THEN 'CAMIONETA'::"VehicleUnit"
    WHEN 'SEMIRREMOLQUE' THEN 'SEMIRREMOLQUE'::"VehicleUnit"
    ELSE 'CHASIS'::"VehicleUnit"
  END,
  "body_type" = CASE
    WHEN "bulk_liquid" THEN 'CISTERNA'::"BodyType"
    WHEN "type" = 'FURGON' THEN 'CERRADA'::"BodyType"
    WHEN "type" = 'BATEA' THEN 'VOLCADORA'::"BodyType"
    ELSE 'ABIERTA'::"BodyType"
  END;

ALTER TABLE "vehicles" ALTER COLUMN "unit" SET NOT NULL,
ALTER COLUMN "body_type" SET NOT NULL;

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "bulk_liquid",
DROP COLUMN "type";

-- DropEnum
DROP TYPE "VehicleType";
