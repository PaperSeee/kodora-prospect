-- CreateTable
CREATE TABLE "EarlyAccessSignup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "url" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "EarlyAccessSignup_email_key" ON "EarlyAccessSignup"("email");
