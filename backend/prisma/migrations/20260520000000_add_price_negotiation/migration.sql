-- Add NEGOTIATING value to PostulationStatus enum
ALTER TYPE "PostulationStatus" ADD VALUE 'NEGOTIATING';

-- Add negotiation fields to postulations table
ALTER TABLE "postulations" ADD COLUMN "counter_offer_price" DOUBLE PRECISION;
ALTER TABLE "postulations" ADD COLUMN "last_offer_by" TEXT;
