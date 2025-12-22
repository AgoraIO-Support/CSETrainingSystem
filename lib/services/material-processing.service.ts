/**
 * Material Processing Service
 * Orchestrates the RAG processing pipeline for exam materials
 * Handles document extraction, chunking, embedding, and storage
 */

import prisma from '@/lib/prisma';
import { MaterialAssetStatus, MaterialAssetType, Prisma } from '@prisma/client';
import { DocumentExtractionService, ExtractionResult } from './document-extraction.service';
import { EmbeddingService, EmbeddedChunk } from './_legacy_embedding.service';
import { ChunkingService, ChunkConfig } from './_legacy_chunking.service';
import { VTTParserService } from './vtt-parser.service';

export interface DocumentChunk {
  id: string;
  sequenceIndex: number;
  text: string;
  tokenCount: number;
  pageNumber?: number;
  sectionTitle?: string;
  startTime?: number;  // For VTT files
  endTime?: number;    // For VTT files
}

export interface MaterialChunkMetadata {
  chunkId: string;
  materialId: string;
  examId?: string;
  courseId?: string;
  materialTitle: string;
  filename: string;
  assetType: MaterialAssetType;
  pageNumber?: number;
  sectionTitle?: string;
  startTime?: number;
  endTime?: number;
  startTimestamp?: string;
  endTimestamp?: string;
  tokenCount: number;
  processedAt: string;
}

export interface ProcessingConfig {
  chunkConfig?: Partial<ChunkConfig>;
  skipEmbedding?: boolean;
  onProgress?: (progress: ProcessingProgress) => void;
}

export interface ProcessingProgress {
  stage: 'extracting' | 'chunking' | 'embedding' | 'storing';
  percentage: number;
  message: string;
}

export interface ProcessingResult {
  materialId: string;
  status: MaterialAssetStatus;
  extractedText?: string;
  wordCount?: number;
  pageCount?: number;
  chunkCount: number;
  totalTokens: number;
  errorMessage?: string;
}

export class MaterialProcessingService {
  private embeddingService: EmbeddingService;

  constructor() {
    this.embeddingService = new EmbeddingService();
  }

  private static toPrismaJsonObject(value: object): Prisma.InputJsonObject {
    const obj: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, val] of Object.entries(value)) {
      if (val === undefined) continue;
      obj[key] = val as Prisma.InputJsonValue;
    }
    return obj;
  }

  /**
   * Process a material asset for RAG
   * Downloads content, extracts text, chunks, generates embeddings, and stores
   */
  async processMaterial(
    materialId: string,
    content: Buffer,
    config: ProcessingConfig = {}
  ): Promise<ProcessingResult> {
    const { onProgress } = config;

    try {
      // Get material record
      const material = await prisma.examMaterial.findUnique({
        where: { id: materialId },
      });

      if (!material) {
        throw new Error(`Material not found: ${materialId}`);
      }

      // Update status to PROCESSING
      await prisma.examMaterial.update({
        where: { id: materialId },
        data: { status: MaterialAssetStatus.PROCESSING },
      });

      onProgress?.({
        stage: 'extracting',
        percentage: 10,
        message: 'Extracting text from document...',
      });

      // Step 1: Extract text based on asset type
      let extractionResult: ExtractionResult;
      let chunks: DocumentChunk[];

      if (material.assetType === MaterialAssetType.VTT) {
        // Use VTT parser for subtitle files
        const result = await this.processVTTContent(content.toString('utf-8'), config);
        extractionResult = {
          text: result.text,
          wordCount: result.wordCount,
          metadata: {},
        };
        chunks = result.chunks;
      } else {
        // Use document extraction for PDF, DOCX, TXT
        extractionResult = await DocumentExtractionService.extract(
          content,
          material.mimeType
        );

        onProgress?.({
          stage: 'chunking',
          percentage: 30,
          message: 'Chunking document into segments...',
        });

        // Step 2: Chunk the extracted text
        chunks = this.chunkDocumentText(
          extractionResult.text,
          config.chunkConfig,
          extractionResult.pageCount
        );
      }

      // Update material with extracted text
      await prisma.examMaterial.update({
        where: { id: materialId },
        data: {
          extractedText: extractionResult.text,
          wordCount: extractionResult.wordCount,
          pageCount: extractionResult.pageCount,
        },
      });

      if (chunks.length === 0) {
        // No content to process
        await prisma.examMaterial.update({
          where: { id: materialId },
          data: {
            status: MaterialAssetStatus.READY,
            processedAt: new Date(),
          },
        });

        return {
          materialId,
          status: MaterialAssetStatus.READY,
          extractedText: extractionResult.text,
          wordCount: extractionResult.wordCount,
          pageCount: extractionResult.pageCount,
          chunkCount: 0,
          totalTokens: 0,
        };
      }

      onProgress?.({
        stage: 'embedding',
        percentage: 50,
        message: `Generating embeddings for ${chunks.length} chunks...`,
      });

      // Step 3: Generate embeddings (unless skipped)
      let embeddedChunks: EmbeddedChunk[] = [];
      let totalTokens = 0;

      if (!config.skipEmbedding) {
        const embeddingResult = await this.embeddingService.generateEmbeddings(
          chunks.map(chunk => ({
            id: chunk.id,
            text: chunk.text,
            metadata: this.createChunkMetadata(chunk, material),
          })),
          progress => {
            onProgress?.({
              stage: 'embedding',
              percentage: 50 + Math.round(progress.percentage * 0.4),
              message: `Generating embeddings: ${progress.processed}/${progress.total}`,
            });
          }
        );

        embeddedChunks = embeddingResult.chunks;
        totalTokens = embeddingResult.totalTokens;
      }

      onProgress?.({
        stage: 'storing',
        percentage: 90,
        message: 'Storing chunks in database...',
      });

      // Step 4: Store chunks in database
      await this.storeChunks(materialId, chunks, embeddedChunks);

      // Update material status to READY
      await prisma.examMaterial.update({
        where: { id: materialId },
        data: {
          status: MaterialAssetStatus.READY,
          processedAt: new Date(),
        },
      });

      onProgress?.({
        stage: 'storing',
        percentage: 100,
        message: 'Processing complete!',
      });

      return {
        materialId,
        status: MaterialAssetStatus.READY,
        extractedText: extractionResult.text,
        wordCount: extractionResult.wordCount,
        pageCount: extractionResult.pageCount,
        chunkCount: chunks.length,
        totalTokens,
      };
    } catch (error) {
      console.error('Material processing error:', error);

      // Update status to FAILED
      await prisma.examMaterial.update({
        where: { id: materialId },
        data: {
          status: MaterialAssetStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      return {
        materialId,
        status: MaterialAssetStatus.FAILED,
        chunkCount: 0,
        totalTokens: 0,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Process VTT content using the existing VTT parser
   */
  private async processVTTContent(
    vttContent: string,
    config: ProcessingConfig
  ): Promise<{ text: string; wordCount: number; chunks: DocumentChunk[] }> {
    // Parse VTT file
    const { cues } = VTTParserService.parse(vttContent);

    // Use the transcript chunking service
    const transcriptChunks = ChunkingService.chunkTranscript(cues, config.chunkConfig);

    // Convert to DocumentChunk format
    const chunks: DocumentChunk[] = transcriptChunks.map(tc => ({
      id: tc.id,
      sequenceIndex: tc.sequenceIndex,
      text: tc.text,
      tokenCount: tc.tokenCount,
      startTime: tc.startTime,
      endTime: tc.endTime,
    }));

    // Combine all text
    const fullText = cues.map(c => c.text).join(' ');
    const wordCount = fullText.split(/\s+/).filter(w => w.length > 0).length;

    return { text: fullText, wordCount, chunks };
  }

  /**
   * Chunk document text into segments for embedding
   * Uses paragraph-based chunking for documents (different from VTT time-based)
   */
  private chunkDocumentText(
    text: string,
    config?: Partial<ChunkConfig>,
    pageCount?: number
  ): DocumentChunk[] {
    const fullConfig: ChunkConfig = {
      minTokens: 100,
      targetTokens: 350,
      maxTokens: 500,
      minTimeWindow: 0,      // Not used for documents
      maxTimeWindow: 0,      // Not used for documents
      overlapSentences: 1,
      ...config,
    };

    const chunks: DocumentChunk[] = [];

    // Split text into paragraphs
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    let currentChunkText: string[] = [];
    let currentTokens = 0;
    let sequenceIndex = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      const paragraphTokens = ChunkingService.estimateTokens(paragraph);

      // Check if adding this paragraph would exceed the max
      if (currentTokens + paragraphTokens > fullConfig.maxTokens && currentTokens >= fullConfig.minTokens) {
        // Finalize current chunk
        chunks.push(this.createDocumentChunk(
          currentChunkText.join('\n\n'),
          sequenceIndex,
          currentTokens,
          pageCount ? this.estimatePageNumber(sequenceIndex, chunks.length, pageCount) : undefined
        ));
        sequenceIndex++;

        // Start new chunk with overlap (last paragraph if it fits)
        if (fullConfig.overlapSentences > 0 && currentChunkText.length > 0) {
          const lastParagraph = currentChunkText[currentChunkText.length - 1];
          const lastTokens = ChunkingService.estimateTokens(lastParagraph);

          currentChunkText = [lastParagraph, paragraph];
          currentTokens = lastTokens + paragraphTokens;
        } else {
          currentChunkText = [paragraph];
          currentTokens = paragraphTokens;
        }
      } else {
        // Add paragraph to current chunk
        currentChunkText.push(paragraph);
        currentTokens += paragraphTokens;
      }
    }

    // Finalize last chunk
    if (currentChunkText.length > 0) {
      chunks.push(this.createDocumentChunk(
        currentChunkText.join('\n\n'),
        sequenceIndex,
        currentTokens,
        pageCount ? this.estimatePageNumber(sequenceIndex, chunks.length, pageCount) : undefined
      ));
    }

    return chunks;
  }

  /**
   * Create a document chunk
   */
  private createDocumentChunk(
    text: string,
    sequenceIndex: number,
    tokenCount: number,
    pageNumber?: number
  ): DocumentChunk {
    return {
      id: `chunk_${sequenceIndex.toString().padStart(4, '0')}`,
      sequenceIndex,
      text: text.trim(),
      tokenCount,
      pageNumber,
    };
  }

  /**
   * Estimate page number based on chunk position
   */
  private estimatePageNumber(
    chunkIndex: number,
    totalChunks: number,
    pageCount: number
  ): number {
    if (totalChunks === 0) return 1;
    const ratio = chunkIndex / totalChunks;
    return Math.min(Math.floor(ratio * pageCount) + 1, pageCount);
  }

  /**
   * Create metadata for a chunk
   */
  private createChunkMetadata(
    chunk: DocumentChunk,
    material: {
      id: string;
      examId: string | null;
      courseId: string | null;
      title: string;
      filename: string;
      assetType: MaterialAssetType;
    }
  ): MaterialChunkMetadata {
    return {
      chunkId: chunk.id,
      materialId: material.id,
      examId: material.examId || undefined,
      courseId: material.courseId || undefined,
      materialTitle: material.title,
      filename: material.filename,
      assetType: material.assetType,
      pageNumber: chunk.pageNumber,
      sectionTitle: chunk.sectionTitle,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      startTimestamp: chunk.startTime !== undefined
        ? ChunkingService.formatTimestamp(chunk.startTime)
        : undefined,
      endTimestamp: chunk.endTime !== undefined
        ? ChunkingService.formatTimestamp(chunk.endTime)
        : undefined,
      tokenCount: chunk.tokenCount,
      processedAt: new Date().toISOString(),
    };
  }

  /**
   * Store chunks in the database
   */
  private async storeChunks(
    materialId: string,
    chunks: DocumentChunk[],
    embeddedChunks: EmbeddedChunk[]
  ): Promise<void> {
    // Delete existing chunks for this material
    await prisma.materialChunk.deleteMany({
      where: { materialId },
    });

    // Create a map of embeddings by ID
    const embeddingMap = new Map<string, number[]>();
    for (const ec of embeddedChunks) {
      embeddingMap.set(ec.id, ec.embedding);
    }

    // Get material for metadata
    const material = await prisma.examMaterial.findUnique({
      where: { id: materialId },
    });

    if (!material) {
      throw new Error('Material not found');
    }

    // Insert chunks in batches
    const batchSize = 100;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      await prisma.materialChunk.createMany({
        data: batch.map(chunk => ({
          materialId,
          sequenceIndex: chunk.sequenceIndex,
          text: chunk.text,
          tokenCount: chunk.tokenCount,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          pageNumber: chunk.pageNumber,
          sectionTitle: chunk.sectionTitle,
          embedding: embeddingMap.get(chunk.id) || [],
          metadata: MaterialProcessingService.toPrismaJsonObject(
            this.createChunkMetadata(chunk, material)
          ),
        })),
      });
    }
  }

  /**
   * Reprocess a material (delete existing chunks and reprocess)
   */
  async reprocessMaterial(
    materialId: string,
    content: Buffer,
    config: ProcessingConfig = {}
  ): Promise<ProcessingResult> {
    // Delete existing chunks
    await prisma.materialChunk.deleteMany({
      where: { materialId },
    });

    // Reprocess
    return this.processMaterial(materialId, content, config);
  }

  /**
   * Get processing status for a material
   */
  static async getProcessingStatus(materialId: string): Promise<{
    status: MaterialAssetStatus;
    chunkCount: number;
    errorMessage?: string;
  }> {
    const material = await prisma.examMaterial.findUnique({
      where: { id: materialId },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
    });

    if (!material) {
      throw new Error('Material not found');
    }

    return {
      status: material.status,
      chunkCount: material._count.chunks,
      errorMessage: material.errorMessage || undefined,
    };
  }

  /**
   * Search chunks by similarity for a given query
   */
  async searchChunks(
    query: string,
    options: {
      examId?: string;
      courseId?: string;
      materialId?: string;
      topK?: number;
      threshold?: number;
    }
  ): Promise<Array<{
    chunk: {
      id: string;
      text: string;
      metadata: MaterialChunkMetadata;
    };
    similarity: number;
  }>> {
    const { examId, courseId, materialId, topK = 5, threshold = 0.7 } = options;

    // Generate query embedding
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);

    // Build where clause
    const whereClause: any = {};
    if (materialId) {
      whereClause.materialId = materialId;
    } else {
      whereClause.material = {};
      if (examId) {
        whereClause.material.examId = examId;
      }
      if (courseId) {
        whereClause.material.courseId = courseId;
      }
    }

    // Get all chunks that match the filter
    const chunks = await prisma.materialChunk.findMany({
      where: whereClause,
      select: {
        id: true,
        text: true,
        embedding: true,
        metadata: true,
      },
    });

    // Calculate similarities
    const results = chunks.map(chunk => {
      const embedding = chunk.embedding as number[];
      const similarity = EmbeddingService.cosineSimilarity(queryEmbedding, embedding);
      return {
        chunk: {
          id: chunk.id,
          text: chunk.text,
          metadata: chunk.metadata as unknown as MaterialChunkMetadata,
        },
        similarity,
      };
    });

    // Filter and sort by similarity
    return results
      .filter(r => r.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }
}
