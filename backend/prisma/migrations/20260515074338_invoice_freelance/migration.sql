-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantAddress" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "description" TEXT,
    "items" TEXT,
    "taxRateBps" INTEGER,
    "kind" TEXT NOT NULL DEFAULT 'invoice',
    "clientName" TEXT,
    "clientEmail" TEXT,
    "invoiceNumber" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "txHash" TEXT,
    "payer" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_merchantAddress_fkey" FOREIGN KEY ("merchantAddress") REFERENCES "Merchant" ("address") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("amount", "chainId", "createdAt", "creator", "description", "expiresAt", "id", "items", "merchantAddress", "paidAt", "payer", "status", "taxRateBps", "token", "txHash") SELECT "amount", "chainId", "createdAt", "creator", "description", "expiresAt", "id", "items", "merchantAddress", "paidAt", "payer", "status", "taxRateBps", "token", "txHash" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE INDEX "Invoice_merchantAddress_idx" ON "Invoice"("merchantAddress");
CREATE INDEX "Invoice_creator_idx" ON "Invoice"("creator");
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX "Invoice_kind_idx" ON "Invoice"("kind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
