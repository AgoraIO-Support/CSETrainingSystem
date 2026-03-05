ALTER TABLE "users"
ADD COLUMN "wecomUserId" TEXT;

CREATE UNIQUE INDEX "users_wecomUserId_key"
ON "users"("wecomUserId");
