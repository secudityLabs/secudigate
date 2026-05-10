-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WebhookDelivery" (
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
    CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WebhookDelivery" ("attempts", "createdAt", "eventType", "id", "lastAttemptAt", "payload", "responseBody", "responseStatus", "successAt", "webhookId") SELECT "attempts", "createdAt", "eventType", "id", "lastAttemptAt", "payload", "responseBody", "responseStatus", "successAt", "webhookId" FROM "WebhookDelivery";
DROP TABLE "WebhookDelivery";
ALTER TABLE "new_WebhookDelivery" RENAME TO "WebhookDelivery";
CREATE INDEX "WebhookDelivery_webhookId_idx" ON "WebhookDelivery"("webhookId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
