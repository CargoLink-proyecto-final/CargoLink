-- AlterTable
ALTER TABLE "cities" ADD COLUMN     "postal_code" TEXT;

-- AlterTable
ALTER TABLE "provinces" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'Argentina';

