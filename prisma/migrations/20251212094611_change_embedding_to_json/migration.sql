/*
  Warnings:

  - You are about to alter the column `embedding` on the `transcript_chunks` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("vector")` to `JsonB`.

*/
-- DropIndex
DROP INDEX IF EXISTS "transcript_chunks_embedding_idx";

-- AlterTable
ALTER TABLE "transcript_chunks"
ALTER COLUMN "embedding" DROP NOT NULL,
ALTER COLUMN "embedding" SET DATA TYPE JSONB USING embedding::text::jsonb;
