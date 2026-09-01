-- CreateTable
CREATE TABLE "EmailEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "prospectId" INTEGER,
    "messageId" TEXT,
    "event" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailEvent_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EmailEvent_messageId_idx" ON "EmailEvent"("messageId");

-- CreateIndex
CREATE INDEX "EmailEvent_prospectId_idx" ON "EmailEvent"("prospectId");

-- CreateTable
CREATE TABLE "SendAttempt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "prospectId" INTEGER NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "httpStatus" INTEGER,
    "messageId" TEXT,
    "error" TEXT,
    CONSTRAINT "SendAttempt_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SendAttempt_prospectId_idx" ON "SendAttempt"("prospectId");

-- CreateIndex
CREATE INDEX "SendAttempt_messageId_idx" ON "SendAttempt"("messageId");

-- AlterTable: add rdvAt to Prospect (manual RDV only, date required)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Prospect" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nom" TEXT NOT NULL,
    "secteur" TEXT NOT NULL,
    "ville" TEXT NOT NULL DEFAULT 'Bruxelles',
    "telephone" TEXT,
    "email" TEXT,
    "siteWeb" TEXT,
    "note" REAL,
    "avis" INTEGER,
    "statut" TEXT NOT NULL DEFAULT 'a_contacter',
    "score" INTEGER NOT NULL DEFAULT 0,
    "angle" TEXT,
    "goldStar" BOOLEAN NOT NULL DEFAULT false,
    "diagnostic" TEXT,
    "emailObjet" TEXT,
    "emailCorps" TEXT,
    "emailHtml" TEXT,
    "notes" TEXT,
    "emailOuvert" BOOLEAN NOT NULL DEFAULT false,
    "emailOuvertAt" DATETIME,
    "relancee" BOOLEAN NOT NULL DEFAULT false,
    "relanceeAt" DATETIME,
    "rdvAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Prospect" ("id", "nom", "secteur", "ville", "telephone", "email", "siteWeb", "note", "avis", "statut", "score", "angle", "goldStar", "diagnostic", "emailObjet", "emailCorps", "emailHtml", "notes", "emailOuvert", "emailOuvertAt", "relancee", "relanceeAt", "createdAt", "updatedAt")
SELECT "id", "nom", "secteur", "ville", "telephone", "email", "siteWeb", "note", "avis", "statut", "score", "angle", "goldStar", "diagnostic", "emailObjet", "emailCorps", "emailHtml", "notes", "emailOuvert", "emailOuvertAt", "relancee", "relanceeAt", "createdAt", "updatedAt" FROM "Prospect";
DROP TABLE "Prospect";
ALTER TABLE "new_Prospect" RENAME TO "Prospect";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- AlterTable: add eligible/failed to PipelineRun (silent-failure visibility)
ALTER TABLE "PipelineRun" ADD COLUMN "eligible" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PipelineRun" ADD COLUMN "failed" INTEGER NOT NULL DEFAULT 0;
