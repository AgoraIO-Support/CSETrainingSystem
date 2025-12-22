/**
 * Vector Store Service
 * Manages vector storage and similarity search using pgvector
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { ChunkMetadata } from './_legacy_chunking.service';
import { randomUUID } from 'crypto';

export interface VectorSearchOptions {
  lessonId?: string;
  courseId?: string;
  topK?: number;
  threshold?: number;
  filter?: Record<string, any>;
}

export interface SearchResult {
  chunkId: string;
  transcriptId: string;
  text: string;
  similarity: number;
  metadata: ChunkMetadata;
  startTime: number;
  endTime: number;
}

export interface IndexStats {
  totalChunks: number;
  avgEmbeddingSize: number;
  indexHealth: 'healthy' | 'degraded' | 'needs_rebuild';
}

export class VectorStoreService {
  private prisma: PrismaClient;
  private embeddingColumnTypePromise?: Promise<'vector' | 'jsonb' | 'unknown'>;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
  }

  /**
   * Convert an embedding array to a pgvector literal string
   */
  private toVectorLiteral(embedding: number[]): string {
    const sanitized = embedding.map(value => {
      const num =
        typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? parseFloat(value)
            : typeof (value as any)?.valueOf === 'function'
              ? parseFloat(String((value as any).valueOf()))
              : 0;

      return Number.isFinite(num) ? num : 0;
    });

    return `[${sanitized.join(',')}]`;
  }

  /**
   * Round time values to the DECIMAL(10,3) scale used in the DB
   */
  private roundTime(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Number(parseFloat(value.toString()).toFixed(3));
  }

  /**
   * Detect the column type for transcript_chunks.embedding (vector vs jsonb)
   * Cached after first lookup.
   */
  private async getEmbeddingColumnType(): Promise<'vector' | 'jsonb' | 'unknown'> {
    if (!this.embeddingColumnTypePromise) {
      this.embeddingColumnTypePromise = this.prisma.$queryRaw<Array<{ data_type: string; udt_name: string }>>`
        SELECT data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'transcript_chunks'
          AND column_name = 'embedding'
      `
        .then(rows => {
          const row = rows?.[0];
          if (!row) return 'unknown';
          if (row.data_type === 'USER-DEFINED' && row.udt_name === 'vector') return 'vector';
          if (row.data_type === 'jsonb') return 'jsonb';
          return 'unknown';
        })
        .catch(() => 'unknown');
    }
    return this.embeddingColumnTypePromise;
  }

  /**
   * Store chunk embeddings in the database
   */
  async storeChunks(
    transcriptId: string,
    chunks: Array<{
      sequenceIndex: number;
      startTime: number;
      endTime: number;
      text: string;
      tokenCount: number;
      embedding: number[];
      metadata: ChunkMetadata;
    }>
  ): Promise<void> {
    const startTime = Date.now();

    console.log(`[Vector Store] STORE CHUNKS START`, {
      transcriptId,
      totalChunks: chunks.length,
    });

    try {
      // Delete existing chunks for this transcript
      await this.prisma.$transaction(async tx => {
        await tx.transcriptChunk.deleteMany({
          where: { transcriptId },
        });

        console.log(`[Vector Store] DELETED OLD CHUNKS`, {
          transcriptId,
        });

        // Normalize embeddings to ensure they're plain JavaScript numbers
        const normalizedChunks = chunks.map(chunk => {
          // Convert embedding array to plain numbers
          const plainEmbedding = Array.isArray(chunk.embedding)
            ? chunk.embedding.map(num => {
                // Convert any numeric type to plain JavaScript number
                if (typeof num === 'number') return num;
                if (typeof num === 'string') return parseFloat(num);
                if (num === null || num === undefined) return 0;
                const numAny = num as any;
                if (typeof numAny.valueOf === 'function') {
                  return parseFloat(String(numAny.valueOf()));
                }
                return parseFloat(String(numAny));
              })
            : [];

          return {
            ...chunk,
            embedding: plainEmbedding,
          };
        });

        if (normalizedChunks.length === 0) {
          console.log(`[Vector Store] NO CHUNKS TO STORE`, { transcriptId });
          return;
        }

        const embeddingColumnType = await this.getEmbeddingColumnType();

        const values = normalizedChunks.map(chunk => {
          const embeddingVector = this.toVectorLiteral(chunk.embedding);
          const embeddingJson = JSON.stringify(chunk.embedding);
          const metadata = chunk.metadata as unknown as Prisma.JsonObject;

          const embeddingValue =
            embeddingColumnType === 'vector'
              ? Prisma.sql`${embeddingVector}::vector`
              : Prisma.sql`${embeddingJson}::jsonb`;

          return Prisma.sql`(
            ${randomUUID()},
            ${transcriptId},
            ${chunk.sequenceIndex},
            ${this.roundTime(chunk.startTime)},
            ${this.roundTime(chunk.endTime)},
            ${chunk.text},
            ${chunk.tokenCount},
            ${embeddingValue},
            ${metadata}::jsonb
          )`;
        });

        await tx.$executeRaw(
          Prisma.sql`
            INSERT INTO "transcript_chunks" (
              "id",
              "transcriptId",
              "sequenceIndex",
              "startTime",
              "endTime",
              "text",
              "tokenCount",
              "embedding",
              "metadata"
            )
            VALUES ${Prisma.join(values)}
          `
        );
      });

      const duration = Date.now() - startTime;

      console.log(`[Vector Store] STORE CHUNKS SUCCESS`, {
        transcriptId,
        totalChunks: chunks.length,
        duration: `${duration}ms`,
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      console.error(`[Vector Store] STORE CHUNKS ERROR`, {
        transcriptId,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Perform vector similarity search
   */
  async search(
    queryEmbedding: number[],
    options: VectorSearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      lessonId,
      courseId,
      topK = 5,
      threshold = 0.0,
    } = options;

    const embeddingColumnType = await this.getEmbeddingColumnType();
    const embeddingExpr =
      embeddingColumnType === 'vector'
        ? 'tc.embedding'
        : 'tc.embedding::text::vector';

    // Build the query with filters
    let whereClause = '';
    const params: any[] = [];
    let paramIndex = 1;

    if (lessonId) {
      whereClause += ` AND ta."lessonId" = $${paramIndex}`;
      params.push(lessonId);
      paramIndex++;
    }

    if (courseId) {
      whereClause += ` AND l."chapterId" IN (SELECT id FROM chapters WHERE "courseId" = $${paramIndex})`;
      params.push(courseId);
      paramIndex++;
    }

    // Convert embedding to pgvector format
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // Raw SQL query for vector similarity search using cosine distance
    // Note: pgvector uses <=> for cosine distance (lower is more similar)
    // Cast JSON embedding to vector type for similarity calculation
    const query = `
      SELECT
        tc.id as "chunkId",
        tc."transcriptId",
        tc.text,
        tc."startTime",
        tc."endTime",
        tc.metadata,
        1 - (${embeddingExpr} <=> $${paramIndex}::vector) as similarity
      FROM transcript_chunks tc
      JOIN transcript_assets ta ON tc."transcriptId" = ta.id
      JOIN lessons l ON ta."lessonId" = l.id
      WHERE 1=1 ${whereClause}
        AND tc.embedding IS NOT NULL
        AND (1 - (${embeddingExpr} <=> $${paramIndex}::vector)) >= $${paramIndex + 1}
      ORDER BY ${embeddingExpr} <=> $${paramIndex}::vector
      LIMIT $${paramIndex + 2}
    `;

    params.push(embeddingStr, threshold, topK);

    const results = await this.prisma.$queryRawUnsafe<any[]>(query, ...params);

    return results.map(row => ({
      chunkId: row.chunkId,
      transcriptId: row.transcriptId,
      text: row.text,
      similarity: parseFloat(row.similarity),
      metadata: row.metadata as ChunkMetadata,
      startTime: parseFloat(row.startTime),
      endTime: parseFloat(row.endTime),
    }));
  }

  /**
   * Search within a specific lesson
   */
  async searchLesson(
    lessonId: string,
    queryEmbedding: number[],
    topK: number = 5,
    threshold: number = 0.65
  ): Promise<SearchResult[]> {
    return this.search(queryEmbedding, { lessonId, topK, threshold });
  }

  /**
   * Search within a specific course
   */
  async searchCourse(
    courseId: string,
    queryEmbedding: number[],
    topK: number = 5,
    threshold: number = 0.65
  ): Promise<SearchResult[]> {
    return this.search(queryEmbedding, { courseId, topK, threshold });
  }

  /**
   * Get chunks by transcript ID
   */
  async getChunksByTranscript(transcriptId: string): Promise<any[]> {
    return this.prisma.transcriptChunk.findMany({
      where: { transcriptId },
      orderBy: { sequenceIndex: 'asc' },
    });
  }

  /**
   * Get chunk by ID
   */
  async getChunkById(chunkId: string): Promise<any | null> {
    return this.prisma.transcriptChunk.findUnique({
      where: { id: chunkId },
      include: {
        transcript: {
          include: {
            lesson: {
              include: {
                chapter: {
                  include: {
                    course: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Delete chunks for a transcript
   */
  async deleteChunks(transcriptId: string): Promise<void> {
    await this.prisma.transcriptChunk.deleteMany({
      where: { transcriptId },
    });
  }

  /**
   * Get index statistics
   */
  async getIndexStats(lessonId?: string): Promise<IndexStats> {
    let whereClause = '';
    const params: any[] = [];

    if (lessonId) {
      whereClause = `WHERE ta."lessonId" = $1`;
      params.push(lessonId);
    }

    const query = `
      SELECT
        COUNT(*) as "totalChunks",
        ${lessonId ? '0' : 'AVG(1536)'} as "avgEmbeddingSize"
      FROM transcript_chunks tc
      JOIN transcript_assets ta ON tc."transcriptId" = ta.id
      ${whereClause}
    `;

    const results = await this.prisma.$queryRawUnsafe<any[]>(query, ...params);
    const stats = results[0];

    return {
      totalChunks: parseInt(stats.totalChunks || '0', 10),
      avgEmbeddingSize: parseFloat(stats.avgEmbeddingSize || '0'),
      indexHealth: 'healthy', // Could be enhanced with actual health checks
    };
  }

  /**
   * Rebuild vector index (useful for maintenance)
   */
  async rebuildIndex(): Promise<void> {
    const embeddingColumnType = await this.getEmbeddingColumnType();
    if (embeddingColumnType !== 'vector') {
      console.warn('[Vector Store] rebuildIndex skipped: embedding column is not vector');
      return;
    }

    // Drop and recreate the IVFFlat index
    await this.prisma.$executeRawUnsafe(`
      DROP INDEX IF EXISTS transcript_chunks_embedding_idx;
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX transcript_chunks_embedding_idx ON transcript_chunks
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
    `);
  }

  /**
   * Get similar chunks (used for debugging/analysis)
   */
  async getSimilarChunks(
    chunkId: string,
    topK: number = 5
  ): Promise<SearchResult[]> {
    const chunk = await this.prisma.transcriptChunk.findUnique({
      where: { id: chunkId },
    });

    if (!chunk || !chunk.embedding) {
      return [];
    }

    return this.search(chunk.embedding as number[], { topK: topK + 1 });
  }

  /**
   * Batch upsert chunks (more efficient for large updates)
   */
  async batchUpsertChunks(
    chunks: Array<{
      transcriptId: string;
      sequenceIndex: number;
      startTime: number;
      endTime: number;
      text: string;
      tokenCount: number;
      embedding: number[];
      metadata: ChunkMetadata;
    }>,
    batchSize: number = 100
  ): Promise<void> {
    const embeddingColumnType = await this.getEmbeddingColumnType();

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      // Normalize embeddings to ensure they're plain JavaScript numbers
      const normalizedChunks = batch.map(chunk => {
        const plainEmbedding = Array.isArray(chunk.embedding)
          ? chunk.embedding.map(num => {
              // Convert any numeric type to plain JavaScript number
              if (typeof num === 'number') return num;
              if (typeof num === 'string') return parseFloat(num);
              if (num === null || num === undefined) return 0;
              const numAny = num as any;
              if (typeof numAny.valueOf === 'function') {
                return parseFloat(String(numAny.valueOf()));
              }
              return parseFloat(String(numAny));
            })
          : [];

        return {
          ...chunk,
          embedding: plainEmbedding,
        };
      });

      const values = normalizedChunks.map(chunk => {
        const embeddingVector = this.toVectorLiteral(chunk.embedding);
        const embeddingJson = JSON.stringify(chunk.embedding);
        const metadata = chunk.metadata as unknown as Prisma.JsonObject;

        const embeddingValue =
          embeddingColumnType === 'vector'
            ? Prisma.sql`${embeddingVector}::vector`
            : Prisma.sql`${embeddingJson}::jsonb`;

        return Prisma.sql`(
          ${randomUUID()},
          ${chunk.transcriptId},
          ${chunk.sequenceIndex},
          ${this.roundTime(chunk.startTime)},
          ${this.roundTime(chunk.endTime)},
          ${chunk.text},
          ${chunk.tokenCount},
          ${embeddingValue},
          ${metadata}::jsonb
        )`;
      });

      await this.prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO "transcript_chunks" (
            "id",
            "transcriptId",
            "sequenceIndex",
            "startTime",
            "endTime",
            "text",
            "tokenCount",
            "embedding",
            "metadata"
          )
          VALUES ${Prisma.join(values)}
          ON CONFLICT ("transcriptId", "sequenceIndex") DO UPDATE SET
            "startTime" = EXCLUDED."startTime",
            "endTime" = EXCLUDED."endTime",
            "text" = EXCLUDED."text",
            "tokenCount" = EXCLUDED."tokenCount",
            "embedding" = EXCLUDED."embedding",
            "metadata" = EXCLUDED."metadata"
        `
      );
    }
  }

  /**
   * Check if transcript has embeddings
   */
  async hasEmbeddings(transcriptId: string): Promise<boolean> {
    const result = await this.prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM "transcript_chunks"
      WHERE "transcriptId" = ${transcriptId}
      AND "embedding" IS NOT NULL
    ` as Array<{ count: bigint }>;

    const count = Number(result[0]?.count || 0);
    return count > 0;
  }

  /**
   * Get embedding coverage statistics
   */
  async getEmbeddingCoverage(lessonId: string): Promise<{
    total: number;
    withEmbeddings: number;
    percentage: number;
  }> {
    const result = await this.prisma.$queryRaw<any[]>`
      SELECT
        COUNT(*) as total,
        COUNT(tc.embedding) as "withEmbeddings"
      FROM transcript_chunks tc
      JOIN transcript_assets ta ON tc."transcriptId" = ta.id
      WHERE ta."lessonId" = ${lessonId}
    `;

    const stats = result[0];
    const total = parseInt(stats.total || '0', 10);
    const withEmbeddings = parseInt(stats.withEmbeddings || '0', 10);

    return {
      total,
      withEmbeddings,
      percentage: total > 0 ? (withEmbeddings / total) * 100 : 0,
    };
  }

  /**
   * Close database connection
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
