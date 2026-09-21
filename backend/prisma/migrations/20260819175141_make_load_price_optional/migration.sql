-- El precio de la carga pasa a ser opcional: si el publicador no lo fija, la
-- carga sale "a convenir" y el precio lo define la postulación del transportista.
-- Relajar el NOT NULL no toca datos existentes ni reescribe la tabla.
-- AlterTable
ALTER TABLE "loads" ALTER COLUMN "price" DROP NOT NULL;
