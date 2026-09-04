/*
  Warnings:

  - You are about to drop the column `delisted_price` on the `listings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "listings" DROP COLUMN "delisted_price";
