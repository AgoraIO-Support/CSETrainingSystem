-- Adds managed exact-match aliases. Historical associations remain unchanged;
-- Course and Exam effective Domains are governed through Event relationships.

CREATE TABLE "product_domain_aliases" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_domain_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_domain_aliases_normalizedAlias_key"
ON "product_domain_aliases"("normalizedAlias");

CREATE INDEX "product_domain_aliases_domainId_idx"
ON "product_domain_aliases"("domainId");

ALTER TABLE "product_domain_aliases"
ADD CONSTRAINT "product_domain_aliases_domainId_fkey"
FOREIGN KEY ("domainId") REFERENCES "product_domains"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
