/*
  Warnings:

  - Added the required column `trip_id` to the `messages` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "trip_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "messages_trip_id_idx" ON "messages"("trip_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
