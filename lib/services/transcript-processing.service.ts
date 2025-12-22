/**
 * Transcript Processing Service
 * Orchestrates the end-to-end RAG processing pipeline
 */

import { PrismaClient, TranscriptStatus } from '@prisma/client';
import { VTTValidationService } from './vtt.service';
import { VTTParserService } from './vtt-parser.service';
import { ChunkingService, ChunkMetadata } from './_legacy_chunking.service';
import { EmbeddingRunOptions, EmbeddingService } from './_legacy_embedding.service';
import { VectorStoreService } from './_legacy_vector-store.service';
import crypto from 'crypto';

export interface ProcessingProgress {
  status: TranscriptStatus;
  progress: number;
  currentStep: string;
  totalChunks?: number;
  processedChunks?: number;
  totalTokens?: number;
  error?: string;
}

export interface ProcessingOptions {
  videoDuration?: number;
  skipValidation?: boolean;
  embeddingRunOptions?: EmbeddingRunOptions;
  logContext?: Record<string, unknown>;
  chunkConfig?: {
    minTokens?: number;
    targetTokens?: number;
    maxTokens?: number;
  };
}

export interface ProcessingContext {
  lessonId: string;
  courseId: string;
  courseAssetId: string;
  vttAssetId: string;
  courseName: string;
  chapterTitle: string;
  chapterIndex: number;
  lessonTitle: string;
  lessonIndex: number;
  language?: string;
}

type ProgressCallback = (progress: ProcessingProgress) => void;

export class TranscriptProcessingService {
  private prisma: PrismaClient;
  private embeddingService: EmbeddingService;
  private vectorStore: VectorStoreService;

  constructor(prisma?: PrismaClient, openaiApiKey?: string) {
    this.prisma = prisma || new PrismaClient();
    this.embeddingService = new EmbeddingService(openaiApiKey);
    this.vectorStore = new VectorStoreService(this.prisma);
  }

  /**
   * Process VTT file end-to-end: validate → parse → chunk → embed → store
   */
  async processTranscript(
    transcriptId: string,
    vttContent: string,
    context: ProcessingContext,
    options: ProcessingOptions = {},
    onProgress?: ProgressCallback
  ): Promise<void> {
    const pipelineStart = Date.now();
    const logContext = options.logContext ?? {};

    const logStep = (label: string, start: number, extra: Record<string, unknown> = {}) => {
      console.log(`[Transcript Processing] ${label}`, {
        ...logContext,
        duration: `${Date.now() - start}ms`,
        transcriptId,
        ...extra,
      });
    };

    try {
      const vttVersion = this.calculateVTTHash(vttContent);

      // Update status to VALIDATING
      await this.updateTranscriptStatus(transcriptId, 'VALIDATING', 0);
      onProgress?.({ status: 'VALIDATING', progress: 0, currentStep: 'Validating VTT file' });

      // Short-circuit if VTT unchanged and chunks already exist
      const existingChunk = await this.prisma.transcriptChunk.findFirst({
        where: { transcriptId },
        select: { metadata: true },
      });
      const existingMetadata = (existingChunk?.metadata ?? null) as unknown as Partial<ChunkMetadata> | null;
      if (existingMetadata?.vttVersion === vttVersion) {
        console.log(`[Transcript Processing] Skipping reprocess - VTT hash unchanged`, {
          ...logContext,
          transcriptId,
          vttVersion,
        });
        await this.updateTranscriptStatus(transcriptId, 'READY', 100);
        await this.prisma.transcriptAsset.update({
          where: { id: transcriptId },
          data: { processedAt: new Date() },
        });
        onProgress?.({ status: 'READY', progress: 100, currentStep: 'No changes detected; using existing knowledge base' });
        return;
      }

      const validationStart = Date.now();

      // 1. Validation
      if (!options.skipValidation) {
        const validation = await VTTValidationService.validate(vttContent, options.videoDuration);

        if (!validation.valid) {
          const errorMessage = validation.errors.map(e => e.message).join('; ');
          await this.updateTranscriptStatus(transcriptId, 'FAILED', 0, errorMessage);
          throw new Error(`VTT validation failed: ${errorMessage}`);
        }

        // Log warnings if any
        if (validation.warnings.length > 0) {
          console.warn('VTT validation warnings:', { ...logContext, transcriptId, warnings: validation.warnings });
        }
      }
      logStep('Validation complete', validationStart);

      // Update status to CHUNKING
      await this.updateTranscriptStatus(transcriptId, 'CHUNKING', 20);
      onProgress?.({ status: 'CHUNKING', progress: 20, currentStep: 'Parsing and chunking transcript' });

      const parseStart = Date.now();

      // 2. Parse VTT
      const { cues } = VTTParserService.parse(vttContent);

      if (cues.length === 0) {
        await this.updateTranscriptStatus(transcriptId, 'FAILED', 0, 'No cues found in VTT file');
        throw new Error('No cues found in VTT file');
      }

      logStep('Parsing complete', parseStart, { totalCues: cues.length });

      const chunkStart = Date.now();

      // 3. Chunk transcript
      const chunks = ChunkingService.chunkTranscript(cues, options.chunkConfig);

      if (chunks.length === 0) {
        await this.updateTranscriptStatus(transcriptId, 'FAILED', 0, 'Failed to create chunks');
        throw new Error('Failed to create chunks from transcript');
      }

      const chunkStats = ChunkingService.getChunkStatistics(chunks);
      logStep('Chunking complete', chunkStart, {
        chunks: chunkStats.totalChunks,
        avgTokens: Math.round(chunkStats.avgTokens),
        maxTokens: chunkStats.maxTokens,
        avgDuration: Math.round(chunkStats.avgDuration * 1000) / 1000,
      });

      // Update status to EMBEDDING
      await this.updateTranscriptStatus(transcriptId, 'EMBEDDING', 40);
      onProgress?.({
        status: 'EMBEDDING',
        progress: 40,
        currentStep: `Generating embeddings for ${chunks.length} chunks`,
        totalChunks: chunks.length,
        processedChunks: 0,
      });

      const embeddingStart = Date.now();

      // 4. Generate embeddings
      const embeddingInput = chunks.map(chunk => ({
        id: chunk.id,
        text: chunk.text,
        metadata: ChunkingService.createChunkMetadata(chunk, {
          ...context,
          vttAssetId: context.vttAssetId,
          language: context.language || 'en',
          vttVersion,
        }),
      }));

      const embeddingResult = await this.embeddingService.generateEmbeddings(
        embeddingInput,
        (embeddingProgress) => {
          const overallProgress = 40 + (embeddingProgress.percentage * 0.4); // 40-80%
          onProgress?.({
            status: 'EMBEDDING',
            progress: overallProgress,
            currentStep: `Generating embeddings: ${embeddingProgress.processed}/${embeddingProgress.total} chunks`,
            totalChunks: embeddingProgress.total,
            processedChunks: embeddingProgress.processed,
          });
        },
        options.embeddingRunOptions ?? { logContext }
      );

      logStep('Embedding complete', embeddingStart, {
        totalChunks: chunks.length,
        totalTokens: embeddingResult.totalTokens,
      });

      // Update status to INDEXING
      await this.updateTranscriptStatus(transcriptId, 'INDEXING', 80);
      onProgress?.({
        status: 'INDEXING',
        progress: 80,
        currentStep: 'Storing embeddings in vector database',
        totalChunks: chunks.length,
        processedChunks: chunks.length,
        totalTokens: embeddingResult.totalTokens,
      });

      const storeStart = Date.now();

      // 5. Store in vector database
      const chunksWithEmbeddings = chunks.map(chunk => {
        const embeddedChunk = embeddingResult.chunks.find(ec => ec.id === chunk.id);
        if (!embeddedChunk) {
          throw new Error(`Embedding not found for chunk ${chunk.id}`);
        }

        // Normalize embedding to plain numbers - aggressive conversion
        let normalizedEmbedding: number[] = [];
        if (Array.isArray(embeddedChunk.embedding)) {
          normalizedEmbedding = embeddedChunk.embedding.map(num => {
            // Convert any numeric type to plain JavaScript number
            if (typeof num === 'number') return num;
            if (typeof num === 'string') return parseFloat(num);
            if (num === null || num === undefined) return 0;
            // For objects with valueOf method (BigDecimal, Decimal, etc.)
            if (typeof num === 'object' && 'valueOf' in num && typeof (num as { valueOf: unknown }).valueOf === 'function') {
              const value = (num as { valueOf: () => unknown }).valueOf();
              return parseFloat(String(value));
            }
            return parseFloat(String(num));
          });
        }

        return {
          transcriptId,
          sequenceIndex: chunk.sequenceIndex,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          text: chunk.text,
          tokenCount: chunk.tokenCount,
          embedding: normalizedEmbedding,
          metadata: embeddedChunk.metadata as ChunkMetadata,
        };
      });

      console.log(`[Transcript Processing] PREPARED CHUNKS FOR STORAGE`, {
        totalChunks: chunksWithEmbeddings.length,
        sampleEmbedding: chunksWithEmbeddings[0]?.embedding?.slice(0, 5),
        sampleEmbeddingType: typeof chunksWithEmbeddings[0]?.embedding?.[0],
      });

      await this.vectorStore.storeChunks(transcriptId, chunksWithEmbeddings);

      logStep('Storage complete', storeStart, { totalChunks: chunksWithEmbeddings.length });

      // Update status to READY
      await this.updateTranscriptStatus(transcriptId, 'READY', 100);
      await this.prisma.transcriptAsset.update({
        where: { id: transcriptId },
        data: { processedAt: new Date() },
      });

      onProgress?.({
        status: 'READY',
        progress: 100,
        currentStep: 'Processing complete',
        totalChunks: chunks.length,
        processedChunks: chunks.length,
        totalTokens: embeddingResult.totalTokens,
      });

      console.log(`Successfully processed transcript ${transcriptId}: ${chunks.length} chunks, ${embeddingResult.totalTokens} tokens`, {
        ...logContext,
        totalDuration: `${Date.now() - pipelineStart}ms`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.updateTranscriptStatus(transcriptId, 'FAILED', 0, errorMessage);

      console.error('Transcript processing error:', { ...logContext, transcriptId, error: errorMessage });
      throw error;
    }
  }

  /**
   * Update transcript status
   */
  private async updateTranscriptStatus(
    transcriptId: string,
    status: TranscriptStatus,
    progress: number,
    errorMessage?: string
  ): Promise<void> {
    await this.prisma.transcriptAsset.update({
      where: { id: transcriptId },
      data: {
        status,
        errorMessage: errorMessage || null,
      },
    });
  }

  /**
   * Calculate hash of VTT content for versioning
   */
  private calculateVTTHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Get processing status
   */
  async getProcessingStatus(transcriptId: string): Promise<{
    status: TranscriptStatus;
    progress: number;
    totalChunks: number;
    processedChunks: number;
    error?: string;
  }> {
    const transcript = await this.prisma.transcriptAsset.findUnique({
      where: { id: transcriptId },
      include: {
        chunks: {
          select: { id: true },
        },
      },
    });

    if (!transcript) {
      throw new Error('Transcript not found');
    }

    const totalChunks = transcript.chunks.length;
    // Count chunks that have embeddings (non-null)
    const processedChunksResult = await this.prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM "transcript_chunks"
      WHERE "transcriptId" = ${transcriptId}
      AND "embedding" IS NOT NULL
    ` as Array<{ count: bigint }>;
    const processedChunks = Number(processedChunksResult[0]?.count || 0);

    let progress = 0;
    switch (transcript.status) {
      case 'PENDING':
        progress = 0;
        break;
      case 'VALIDATING':
        progress = 10;
        break;
      case 'CHUNKING':
        progress = 30;
        break;
      case 'EMBEDDING':
        progress = 50 + (totalChunks > 0 ? (processedChunks / totalChunks) * 30 : 0);
        break;
      case 'INDEXING':
        progress = 90;
        break;
      case 'READY':
        progress = 100;
        break;
      case 'FAILED':
        progress = 0;
        break;
      default:
        progress = 0;
    }

    return {
      status: transcript.status,
      progress,
      totalChunks,
      processedChunks,
      error: transcript.errorMessage || undefined,
    };
  }

  /**
   * Re-process existing transcript
   */
  async reprocessTranscript(
    transcriptId: string,
    vttContent: string,
    context: ProcessingContext,
    options: ProcessingOptions = {},
    onProgress?: ProgressCallback
  ): Promise<void> {
    // Delete existing chunks
    await this.vectorStore.deleteChunks(transcriptId);

    // Reset status
    await this.updateTranscriptStatus(transcriptId, 'PENDING', 0);

    // Process
    await this.processTranscript(transcriptId, vttContent, context, options, onProgress);
  }

  /**
   * Delete transcript and all associated chunks
   */
  async deleteTranscript(transcriptId: string): Promise<void> {
    await this.vectorStore.deleteChunks(transcriptId);
    await this.prisma.transcriptAsset.delete({
      where: { id: transcriptId },
    });
  }

  /**
   * Get transcript statistics
   */
  async getTranscriptStats(transcriptId: string): Promise<{
    totalChunks: number;
    totalTokens: number;
    avgChunkSize: number;
    duration: number;
    hasEmbeddings: boolean;
  }> {
    const chunks = await this.vectorStore.getChunksByTranscript(transcriptId);

    if (chunks.length === 0) {
      return {
        totalChunks: 0,
        totalTokens: 0,
        avgChunkSize: 0,
        duration: 0,
        hasEmbeddings: false,
      };
    }

    const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0);
    const maxEndTime = Math.max(...chunks.map(c => parseFloat(c.endTime)));
    const hasEmbeddings = chunks.every(chunk => chunk.embedding !== null);

    return {
      totalChunks: chunks.length,
      totalTokens,
      avgChunkSize: totalTokens / chunks.length,
      duration: maxEndTime,
      hasEmbeddings,
    };
  }

  /**
   * Close connections
   */
  async cleanup(): Promise<void> {
    await this.vectorStore.disconnect();
    await this.prisma.$disconnect();
  }
}
