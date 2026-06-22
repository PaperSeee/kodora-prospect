-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "sourced" INTEGER NOT NULL DEFAULT 0,
    "generated" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "capUsed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',
    "error" TEXT
);

-- RedefineTables
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Prospect" ("angle", "avis", "createdAt", "diagnostic", "email", "emailCorps", "emailHtml", "emailObjet", "goldStar", "id", "nom", "note", "notes", "score", "secteur", "siteWeb", "statut", "telephone", "updatedAt", "ville") SELECT "angle", "avis", "createdAt", "diagnostic", "email", "emailCorps", "emailHtml", "emailObjet", "goldStar", "id", "nom", "note", "notes", "score", "secteur", "siteWeb", "statut", "telephone", "updatedAt", "ville" FROM "Prospect";
DROP TABLE "Prospect";
ALTER TABLE "new_Prospect" RENAME TO "Prospect";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
