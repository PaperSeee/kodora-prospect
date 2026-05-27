-- CreateTable
CREATE TABLE "Prospect" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nom" TEXT NOT NULL,
    "secteur" TEXT NOT NULL,
    "ville" TEXT NOT NULL DEFAULT 'Bruxelles',
    "telephone" TEXT,
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
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
