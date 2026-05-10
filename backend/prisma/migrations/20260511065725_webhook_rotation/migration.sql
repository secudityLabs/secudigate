-- AlterTable
ALTER TABLE "Webhook" ADD COLUMN "previousSecret" TEXT;
ALTER TABLE "Webhook" ADD COLUMN "previousSecretExpiresAt" DATETIME;
