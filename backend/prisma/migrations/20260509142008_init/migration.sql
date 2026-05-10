-- CreateTable
CREATE TABLE "Merchant" (
    "address" TEXT NOT NULL PRIMARY KEY,
    "businessName" TEXT NOT NULL DEFAULT '',
    "brandColor" TEXT NOT NULL DEFAULT '#7c5cff',
    "logoUrl" TEXT,
    "defaultTreasury" TEXT NOT NULL,
    "acceptedTokens" TEXT NOT NULL,
    "acceptedChains" TEXT NOT NULL,
    "defaultChainId" INTEGER NOT NULL,
    "merchantFeeBps" INTEGER NOT NULL DEFAULT 0,
    "merchantFeeReceiver" TEXT NOT NULL,
    "merchantDailyLimit" TEXT NOT NULL DEFAULT '0',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantAddress" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "description" TEXT,
    "items" TEXT,
    "taxRateBps" INTEGER,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "txHash" TEXT,
    "payer" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_merchantAddress_fkey" FOREIGN KEY ("merchantAddress") REFERENCES "Merchant" ("address") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DepositLink" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "merchantAddress" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "treasury" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requireReference" BOOLEAN NOT NULL DEFAULT false,
    "referenceLabel" TEXT NOT NULL DEFAULT 'Reference',
    "minAmount" TEXT,
    "maxAmount" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DepositLink_merchantAddress_fkey" FOREIGN KEY ("merchantAddress") REFERENCES "Merchant" ("address") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "linkSlug" TEXT NOT NULL,
    "merchantAddress" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "payer" TEXT NOT NULL,
    "reference" TEXT,
    "token" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "paidAt" DATETIME NOT NULL,
    CONSTRAINT "Deposit_linkSlug_fkey" FOREIGN KEY ("linkSlug") REFERENCES "DepositLink" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Deposit_merchantAddress_fkey" FOREIGN KEY ("merchantAddress") REFERENCES "Merchant" ("address") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantAddress" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Webhook_merchantAddress_fkey" FOREIGN KEY ("merchantAddress") REFERENCES "Merchant" ("address") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "webhookId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" DATETIME,
    "successAt" DATETIME,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IndexerState" (
    "chainId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lastBlock" BIGINT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Invoice_merchantAddress_idx" ON "Invoice"("merchantAddress");

-- CreateIndex
CREATE INDEX "Invoice_creator_idx" ON "Invoice"("creator");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "DepositLink_merchantAddress_idx" ON "DepositLink"("merchantAddress");

-- CreateIndex
CREATE INDEX "Deposit_merchantAddress_idx" ON "Deposit"("merchantAddress");

-- CreateIndex
CREATE INDEX "Deposit_linkSlug_idx" ON "Deposit"("linkSlug");

-- CreateIndex
CREATE INDEX "Webhook_merchantAddress_idx" ON "Webhook"("merchantAddress");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_idx" ON "WebhookDelivery"("webhookId");
