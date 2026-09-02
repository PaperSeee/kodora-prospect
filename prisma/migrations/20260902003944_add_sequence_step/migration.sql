-- AlterTable: sequenceStep pour la séquence de suivi à 4 messages
ALTER TABLE "Prospect" ADD COLUMN "sequenceStep" INTEGER NOT NULL DEFAULT 0;
