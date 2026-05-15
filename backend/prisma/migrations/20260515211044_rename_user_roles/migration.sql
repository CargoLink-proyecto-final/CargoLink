-- Rename Role enum values in place so existing user rows are preserved.
-- SHIPPER becomes CARGO_GENERATOR ("Generador de carga") and
-- CARRIER becomes TRANSPORTER ("Transportista").
ALTER TYPE "Role" RENAME VALUE 'SHIPPER' TO 'CARGO_GENERATOR';
ALTER TYPE "Role" RENAME VALUE 'CARRIER' TO 'TRANSPORTER';

ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'CARGO_GENERATOR';
