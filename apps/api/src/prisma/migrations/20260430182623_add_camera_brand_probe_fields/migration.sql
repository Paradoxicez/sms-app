-- AlterTable
ALTER TABLE "Camera" ADD COLUMN     "brandConfidence" TEXT,
ADD COLUMN     "brandHint" TEXT,
ADD COLUMN     "streamWarnings" TEXT[] DEFAULT ARRAY[]::TEXT[];
