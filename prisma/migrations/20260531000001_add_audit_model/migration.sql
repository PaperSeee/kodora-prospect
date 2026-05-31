-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prospectId" INTEGER NOT NULL,
    "publicSlug" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "problemesJson" TEXT NOT NULL,
    "rapportJson" TEXT,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstViewedAt" DATETIME,
    "lastViewedAt" DATETIME,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "ctaClicked" BOOLEAN NOT NULL DEFAULT false,
    "ctaClickedAt" DATETIME,
    "emailCapturedAt" DATETIME,
    "emailCaptured" TEXT,
    CONSTRAINT "Audit_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Audit_publicSlug_key" ON "Audit"("publicSlug");
