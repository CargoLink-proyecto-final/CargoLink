-- AlterTable
ALTER TABLE "loads" ADD COLUMN     "dest_city_id" TEXT,
ADD COLUMN     "origin_city_id" TEXT;

-- CreateIndex
CREATE INDEX "loads_origin_city_id_idx" ON "loads"("origin_city_id");

-- CreateIndex
CREATE INDEX "loads_dest_city_id_idx" ON "loads"("dest_city_id");

-- AddForeignKey
ALTER TABLE "loads" ADD CONSTRAINT "loads_origin_city_id_fkey" FOREIGN KEY ("origin_city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loads" ADD CONSTRAINT "loads_dest_city_id_fkey" FOREIGN KEY ("dest_city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

