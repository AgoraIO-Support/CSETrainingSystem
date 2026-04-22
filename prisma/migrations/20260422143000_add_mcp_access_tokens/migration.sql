-- CreateEnum
CREATE TYPE "McpAccessTokenScope" AS ENUM ('SME_MCP');

-- CreateEnum
CREATE TYPE "McpAccessTokenStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "mcp_access_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scope" "McpAccessTokenScope" NOT NULL DEFAULT 'SME_MCP',
    "status" "McpAccessTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "lastUsedUserAgent" TEXT,

    CONSTRAINT "mcp_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_access_tokens_tokenPrefix_key" ON "mcp_access_tokens"("tokenPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_access_tokens_tokenHash_key" ON "mcp_access_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "mcp_access_tokens_userId_status_idx" ON "mcp_access_tokens"("userId", "status");

-- CreateIndex
CREATE INDEX "mcp_access_tokens_expiresAt_idx" ON "mcp_access_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "mcp_access_tokens_lastUsedAt_idx" ON "mcp_access_tokens"("lastUsedAt");

-- AddForeignKey
ALTER TABLE "mcp_access_tokens" ADD CONSTRAINT "mcp_access_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
