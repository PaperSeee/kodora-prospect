-- CreateTable
CREATE TABLE "WhatsappContact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "prospectId" INTEGER NOT NULL,
    "contactedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsappContact_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappContact_prospectId_key" ON "WhatsappContact"("prospectId");

-- CreateIndex
CREATE INDEX "WhatsappContact_prospectId_idx" ON "WhatsappContact"("prospectId");
