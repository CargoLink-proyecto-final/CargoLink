-- AlterTable
ALTER TABLE "loads" ADD COLUMN     "height_cm" DOUBLE PRECISION,
ADD COLUMN     "length_cm" DOUBLE PRECISION,
ADD COLUMN     "max_budget" DOUBLE PRECISION,
ADD COLUMN     "package_count" INTEGER,
ADD COLUMN     "width_cm" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "industry" TEXT;
