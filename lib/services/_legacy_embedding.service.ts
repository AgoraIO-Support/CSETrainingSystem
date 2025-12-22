/**
 * Embedding Service
 * Generates vector embeddings using OpenAI API for RAG
 */

import OpenAI from 'openai';
import { log } from '@/lib/logger';

export interface EmbeddingConfig {
  model: string;
  batchSize: number;
  maxConcurrency: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface EmbeddedChunk {
  id: string;
  text: string;
  embedding: number[];
  metadata?: object;
}

export interface EmbeddingResult {
  chunks: EmbeddedChunk[];
  totalTokens: number;
  model: string;
}

export interface EmbeddingProgress {
  processed: number;
  total: number;
  percentage: number;
  currentBatch: number;
  totalBatches: number;
}

type ProgressCallback = (progress: EmbeddingProgress) => void;

export interface EmbeddingBatchEvent {
  type: 'batch_start' | 'batch_success' | 'batch_error' | 'batch_retry';
  batchIndex: number;
  totalBatches: number;
  attempt: number;
  batchSize: number;
  totalChars: number;
  durationMs?: number;
  tokensUsed?: number;
  model?: string;
  error?: {
    message: string;
    status?: number;
    code?: string;
  };
}

export interface EmbeddingRunOptions {
  logContext?: Record<string, unknown>;
  onBatchEvent?: (event: EmbeddingBatchEvent) => void;
}

export class EmbeddingService {
  private static readonly DEFAULT_CONFIG: EmbeddingConfig = {
    model: 'text-embedding-3-small',
    batchSize: 256,
    maxConcurrency: 6,
    retryAttempts: 3,
    retryDelay: 1000,
  };

  private openai: OpenAI;
  private config: EmbeddingConfig;

  constructor(apiKey?: string, config: Partial<EmbeddingConfig> = {}) {
    this.openai = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
    const envOverrides: Partial<EmbeddingConfig> = {
      model: process.env.OPENAI_EMBEDDING_MODEL || undefined,
      batchSize: process.env.OPENAI_EMBEDDING_BATCH_SIZE ? parseInt(process.env.OPENAI_EMBEDDING_BATCH_SIZE, 10) : undefined,
      maxConcurrency: process.env.OPENAI_EMBEDDING_MAX_CONCURRENCY ? parseInt(process.env.OPENAI_EMBEDDING_MAX_CONCURRENCY, 10) : undefined,
      retryAttempts: process.env.OPENAI_EMBEDDING_RETRY_ATTEMPTS ? parseInt(process.env.OPENAI_EMBEDDING_RETRY_ATTEMPTS, 10) : undefined,
      retryDelay: process.env.OPENAI_EMBEDDING_RETRY_DELAY_MS ? parseInt(process.env.OPENAI_EMBEDDING_RETRY_DELAY_MS, 10) : undefined,
    };

    const merged = { ...EmbeddingService.DEFAULT_CONFIG, ...envOverrides, ...config };
    // Basic validation/safety
    this.config = {
      ...merged,
      batchSize: Number.isFinite(merged.batchSize) && merged.batchSize! > 0 ? merged.batchSize! : EmbeddingService.DEFAULT_CONFIG.batchSize,
      maxConcurrency: Number.isFinite(merged.maxConcurrency) && merged.maxConcurrency! > 0 ? merged.maxConcurrency! : EmbeddingService.DEFAULT_CONFIG.maxConcurrency,
      retryAttempts: Number.isFinite(merged.retryAttempts) && merged.retryAttempts! > 0 ? merged.retryAttempts! : EmbeddingService.DEFAULT_CONFIG.retryAttempts,
      retryDelay: Number.isFinite(merged.retryDelay) && merged.retryDelay! > 0 ? merged.retryDelay! : EmbeddingService.DEFAULT_CONFIG.retryDelay,
      model: merged.model || EmbeddingService.DEFAULT_CONFIG.model,
    };
  }

  /**
   * Generate embeddings for multiple chunks
   */
  async generateEmbeddings(
    chunks: Array<{ id: string; text: string; metadata?: object }>,
    onProgress?: ProgressCallback,
    options: EmbeddingRunOptions = {}
  ): Promise<EmbeddingResult> {
    const overallStartTime = Date.now();
    const batches = this.createBatches(chunks, this.config.batchSize);
    const totalBatches = batches.length;
    const embeddedChunks: EmbeddedChunk[] = [];
    let totalTokens = 0;
    const logContext = options.logContext ?? {};

    console.log(`[OpenAI Embeddings] BATCH PROCESSING START`, {
      ...logContext,
      totalChunks: chunks.length,
      batchSize: this.config.batchSize,
      totalBatches,
      maxConcurrency: this.config.maxConcurrency,
      model: this.config.model,
      estimatedDuration: `${Math.round(totalBatches * 1.5 / this.config.maxConcurrency)}s`
    });

    // Process batches with concurrency control
    const batchQueue = [...batches];
    const activeBatches: Promise<void>[] = [];
    const batchTimings: number[] = [];

    let processedCount = 0;
    let completedBatches = 0;

    while (batchQueue.length > 0 || activeBatches.length > 0) {
      // Start new batches up to concurrency limit
      while (batchQueue.length > 0 && activeBatches.length < this.config.maxConcurrency) {
        const batch = batchQueue.shift()!;
        const batchIndex = batches.indexOf(batch);
        const batchStartTime = Date.now();

        console.log(`[OpenAI Embeddings] BATCH ${batchIndex + 1}/${totalBatches} STARTED`, {
          ...logContext,
          chunksInBatch: batch.length,
          activeBatches: activeBatches.length + 1,
          queueRemaining: batchQueue.length
        });

        const batchPromise = this.processBatch(batch, batchIndex, totalBatches, options).then(result => {
          const batchDuration = Date.now() - batchStartTime;
          batchTimings.push(batchDuration);
          completedBatches++;

          embeddedChunks.push(...result.chunks);
          totalTokens += result.tokens;
          processedCount += batch.length;

          const elapsed = Date.now() - overallStartTime;
          const avgBatchTime = batchTimings.reduce((a, b) => a + b, 0) / batchTimings.length;
          const remainingBatches = totalBatches - completedBatches;
          const estimatedRemaining = Math.round((remainingBatches * avgBatchTime) / this.config.maxConcurrency / 1000);

          console.log(`[OpenAI Embeddings] BATCH ${batchIndex + 1}/${totalBatches} COMPLETED`, {
            ...logContext,
            batchDuration: `${batchDuration}ms`,
            chunksProcessed: `${processedCount}/${chunks.length}`,
            tokensUsed: result.tokens,
            totalTokensSoFar: totalTokens,
            elapsedTime: `${Math.round(elapsed / 1000)}s`,
            avgBatchTime: `${Math.round(avgBatchTime)}ms`,
            estimatedRemaining: `${estimatedRemaining}s`
          });

          // Report progress
          if (onProgress) {
            onProgress({
              processed: processedCount,
              total: chunks.length,
              percentage: Math.round((processedCount / chunks.length) * 100),
              currentBatch: batchIndex + 1,
              totalBatches,
            });
          }

          // Remove from active batches
          const index = activeBatches.indexOf(batchPromise);
          if (index > -1) {
            activeBatches.splice(index, 1);
          }
        });

        activeBatches.push(batchPromise);
      }

      // Wait for at least one batch to complete
      if (activeBatches.length > 0) {
        await Promise.race(activeBatches);
      }
    }

    const totalDuration = Date.now() - overallStartTime;
    const avgTokensPerSecond = Math.round(totalTokens / (totalDuration / 1000));
    const cost = this.estimateCost(totalTokens);

    console.log(`[OpenAI Embeddings] BATCH PROCESSING COMPLETE`, {
      ...logContext,
      totalChunks: chunks.length,
      totalTokens,
      totalDuration: `${Math.round(totalDuration / 1000)}s`,
      avgBatchTime: `${Math.round(batchTimings.reduce((a, b) => a + b, 0) / batchTimings.length)}ms`,
      tokensPerSecond: avgTokensPerSecond,
      estimatedCost: `$${cost.toFixed(5)}`,
      model: this.config.model
    });

    return {
      chunks: embeddedChunks,
      totalTokens,
      model: this.config.model,
    };
  }

  /**
   * Process a single batch of chunks
   */
  private async processBatch(
    batch: Array<{ id: string; text: string; metadata?: object }>,
    batchIndex: number,
    totalBatches: number,
    options: EmbeddingRunOptions
  ): Promise<{ chunks: EmbeddedChunk[]; tokens: number }> {
    let attempt = 0;
    let lastError: Error | null = null;
    const logContext = options.logContext ?? {};

    while (attempt < this.config.retryAttempts) {
      const startTime = Date.now();

      try {
        // Calculate total input characters
        const totalChars = batch.reduce((sum, chunk) => sum + chunk.text.length, 0);
        const avgCharsPerChunk = Math.round(totalChars / batch.length);

        console.log(`[OpenAI Embeddings] REQUEST - Batch ${batchIndex + 1}, Attempt ${attempt + 1}`, {
          ...logContext,
          model: this.config.model,
          batchSize: batch.length,
          totalChars,
          avgCharsPerChunk,
          encoding_format: 'float'
        });
        if (process.env.CSE_OPENAI_LOG_CONTENT === '1') {
          log('OpenAI', 'debug', 'embeddings request input', {
            model: this.config.model,
            batchIndex: batchIndex + 1,
            totalBatches,
            input: batch.map(chunk => ({ id: chunk.id, text: chunk.text, metadata: chunk.metadata })),
          });
        }

        options.onBatchEvent?.({
          type: 'batch_start',
          batchIndex: batchIndex + 1,
          totalBatches,
          attempt: attempt + 1,
          batchSize: batch.length,
          totalChars,
          model: this.config.model,
        });

        const response = await this.openai.embeddings.create({
          model: this.config.model,
          input: batch.map(chunk => chunk.text),
          encoding_format: 'float',
        });

        const duration = Date.now() - startTime;
        const tokensPerSecond = Math.round(response.usage.total_tokens / (duration / 1000));

        console.log(`[OpenAI Embeddings] RESPONSE - Batch ${batchIndex + 1} SUCCESS`, {
          ...logContext,
          duration: `${duration}ms`,
          tokensUsed: response.usage.total_tokens,
          promptTokens: response.usage.prompt_tokens,
          embeddingsReturned: response.data.length,
          embeddingDimensions: response.data[0]?.embedding.length || 0,
          tokensPerSecond,
          model: response.model
        });
        if (process.env.CSE_OPENAI_LOG_CONTENT === '1') {
          log('OpenAI', 'debug', 'embeddings response', {
            model: response.model,
            batchIndex: batchIndex + 1,
            totalBatches,
            usage: response.usage,
            embeddingsReturned: response.data.length,
            embeddingDimensions: response.data[0]?.embedding.length || 0,
          });
        }

        options.onBatchEvent?.({
          type: 'batch_success',
          batchIndex: batchIndex + 1,
          totalBatches,
          attempt: attempt + 1,
          batchSize: batch.length,
          totalChars,
          durationMs: duration,
          tokensUsed: response.usage.total_tokens,
          model: response.model,
        });

        const chunks: EmbeddedChunk[] = batch.map((chunk, i) => {
          // Normalize embedding to plain numbers (response.data[i].embedding might have special types)
          const embedding = response.data[i].embedding;

          // Aggressive conversion: ensure we get plain JavaScript numbers
          let normalizedEmbedding: number[] = [];
	          if (Array.isArray(embedding)) {
	            normalizedEmbedding = embedding.map(num => {
	              // Handle various numeric types
	              if (typeof num === 'number') return num;
	              if (typeof num === 'string') return parseFloat(num);
	              if (num === null || num === undefined) return 0;
	              // For BigDecimal or other objects with valueOf
	              if (typeof num === 'object' && 'valueOf' in num && typeof (num as { valueOf: unknown }).valueOf === 'function') {
	                const value = (num as { valueOf: () => unknown }).valueOf();
	                return parseFloat(String(value));
	              }
	              return parseFloat(String(num));
	            });
	          }

          return {
            id: chunk.id,
            text: chunk.text,
            embedding: normalizedEmbedding,
            metadata: chunk.metadata,
          };
        });

        return {
          chunks,
          tokens: response.usage.total_tokens,
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        lastError = error instanceof Error ? error : new Error('Unknown error');
        attempt++;

        const errorDetails: Record<string, unknown> = {
          ...logContext,
          batch: batchIndex + 1,
          attempt,
          duration: `${duration}ms`,
          message: lastError.message,
        };

        // Extract API error details if available
        const apiErr = EmbeddingService.getApiErrorDetails(error);
        if (apiErr.status !== undefined) errorDetails.status = apiErr.status;
        if (apiErr.code !== undefined) errorDetails.code = apiErr.code;

        console.error(`[OpenAI Embeddings] ERROR - Batch ${batchIndex + 1}`, errorDetails);

        options.onBatchEvent?.({
          type: 'batch_error',
          batchIndex: batchIndex + 1,
          totalBatches,
          attempt,
          batchSize: batch.length,
          totalChars: batch.reduce((sum, chunk) => sum + chunk.text.length, 0),
          durationMs: duration,
          model: this.config.model,
          error: {
            message: lastError.message,
            status: apiErr.status,
            code: apiErr.code,
          },
        });

        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          console.error(`[OpenAI Embeddings] NON-RETRYABLE ERROR - Aborting`, errorDetails);
          throw error;
        }

        // Wait before retry with exponential backoff
        if (attempt < this.config.retryAttempts) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
          console.log(`[OpenAI Embeddings] RETRY - Waiting ${delay}ms before attempt ${attempt + 1}`);
          options.onBatchEvent?.({
            type: 'batch_retry',
            batchIndex: batchIndex + 1,
            totalBatches,
            attempt,
            batchSize: batch.length,
            totalChars: batch.reduce((sum, chunk) => sum + chunk.text.length, 0),
            model: this.config.model,
            error: {
              message: lastError.message,
              status: apiErr.status,
              code: apiErr.code,
            },
          });
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `Failed to generate embeddings after ${this.config.retryAttempts} attempts: ${lastError?.message}`
    );
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const startTime = Date.now();

    try {
      console.log(`[OpenAI Embeddings] SINGLE REQUEST`, {
        model: this.config.model,
        textLength: text.length,
        preview: text.substring(0, 100) + '...'
      });

      const response = await this.openai.embeddings.create({
        model: this.config.model,
        input: text,
        encoding_format: 'float',
      });

      const duration = Date.now() - startTime;

      console.log(`[OpenAI Embeddings] SINGLE RESPONSE SUCCESS`, {
        duration: `${duration}ms`,
        tokensUsed: response.usage.total_tokens,
        embeddingDimensions: response.data[0].embedding.length
      });

      return response.data[0].embedding;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[OpenAI Embeddings] SINGLE REQUEST ERROR`, {
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new Error(
        `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create batches from chunks
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    const apiErr = EmbeddingService.getApiErrorDetails(error)
    // Rate limit errors
    if (apiErr.status === 429) {
      return true;
    }

    // Server errors
    if (apiErr.status !== undefined && apiErr.status >= 500 && apiErr.status < 600) {
      return true;
    }

    // Timeout errors
    if (apiErr.code === 'ETIMEDOUT' || apiErr.code === 'ECONNRESET') {
      return true;
    }

    return false;
  }

  private static getApiErrorDetails(error: unknown): { status?: number; code?: string } {
    if (!error || typeof error !== 'object') return {}
    const record = error as Record<string, unknown>
    const status = typeof record.status === 'number' ? record.status : undefined
    const code = typeof record.code === 'string' ? record.code : undefined
    return { status, code }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get embedding dimensions for current model
   */
  getEmbeddingDimensions(): number {
    const dimensionsMap: Record<string, number> = {
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536,
    };

    return dimensionsMap[this.config.model] || 1536;
  }

  /**
   * Estimate cost for embedding generation
   */
  estimateCost(totalTokens: number): number {
    const costPerMillionTokens: Record<string, number> = {
      'text-embedding-3-small': 0.02,
      'text-embedding-3-large': 0.13,
      'text-embedding-ada-002': 0.10,
    };

    const cost = costPerMillionTokens[this.config.model] || 0.02;
    return (totalTokens / 1_000_000) * cost;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Normalize embedding vector
   */
  static normalize(embedding: number[]): number[] {
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / norm);
  }
}
