/**
 * Chunking Service for Transcript RAG Processing
 * Divides transcript cues into optimal chunks for embedding
 */

import { VTTCue } from './vtt-parser.service';

export interface ChunkConfig {
  minTokens: number;       // Minimum chunk size (default: 150)
  targetTokens: number;    // Target chunk size (default: 300)
  maxTokens: number;       // Maximum chunk size (default: 500)
  minTimeWindow: number;   // Minimum time window in seconds (default: 10)
  maxTimeWindow: number;   // Maximum time window in seconds (default: 60)
  overlapSentences: number; // Number of sentences to overlap (default: 2)
}

export interface TranscriptChunk {
  id: string;
  sequenceIndex: number;
  startTime: number;
  endTime: number;
  text: string;
  tokenCount: number;
  previousChunkId?: string;
  nextChunkId?: string;
}

export interface ChunkMetadata {
  chunkId: string;
  lessonId: string;
  courseId: string;
  courseAssetId: string;
  vttAssetId: string;
  courseName: string;
  chapterTitle: string;
  chapterIndex: number;
  lessonTitle: string;
  lessonIndex: number;
  startTime: number;
  endTime: number;
  startTimestamp: string;
  endTimestamp: string;
  tokenCount: number;
  language: string;
  vttVersion: string;
  processedAt: string;
}

export class ChunkingService {
  private static readonly DEFAULT_CONFIG: ChunkConfig = {
    minTokens: 150,
    targetTokens: 380,
    maxTokens: 500,
    minTimeWindow: 10,
    maxTimeWindow: 60,
    overlapSentences: 1,
  };

  /**
   * Chunk transcript cues into optimal segments for embedding
   */
  static chunkTranscript(
    cues: VTTCue[],
    config: Partial<ChunkConfig> = {}
  ): TranscriptChunk[] {
    const fullConfig: ChunkConfig = { ...this.DEFAULT_CONFIG, ...config };
    const chunks: TranscriptChunk[] = [];

    if (cues.length === 0) {
      return chunks;
    }

    let currentChunkCues: VTTCue[] = [];
    let currentChunkText: string[] = [];
    let chunkStartTime = cues[0].startTime;
    let tokenCount = 0;

    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      const cueTokens = this.estimateTokens(cue.text);
      const cueEndTime = cue.endTime;
      const timeWindow = cueEndTime - chunkStartTime;

      // Check if adding this cue would exceed limits
      const exceedsTokenLimit = tokenCount + cueTokens > fullConfig.maxTokens;
      const exceedsTimeLimit = timeWindow > fullConfig.maxTimeWindow;
      const meetsMinimums =
        tokenCount >= fullConfig.minTokens &&
        timeWindow >= fullConfig.minTimeWindow;

      if ((exceedsTokenLimit || exceedsTimeLimit) && meetsMinimums) {
        // Finalize current chunk
        const chunk = this.createChunk(
          currentChunkCues,
          currentChunkText.join(' '),
          chunkStartTime,
          currentChunkCues[currentChunkCues.length - 1].endTime,
          chunks.length,
          tokenCount
        );
        chunks.push(chunk);

        // Start new chunk with overlap
        const overlapCues = this.getOverlapCues(currentChunkCues, fullConfig.overlapSentences);
        const overlapText = overlapCues.map(c => c.text);

        currentChunkCues = [...overlapCues, cue];
        currentChunkText = [...overlapText, cue.text];
        chunkStartTime = overlapCues.length > 0 ? overlapCues[0].startTime : cue.startTime;
        tokenCount = this.estimateTokens(currentChunkText.join(' '));
      } else {
        // Add cue to current chunk
        currentChunkCues.push(cue);
        currentChunkText.push(cue.text);
        tokenCount += cueTokens;
      }
    }

    // Finalize last chunk
    if (currentChunkCues.length > 0) {
      const chunk = this.createChunk(
        currentChunkCues,
        currentChunkText.join(' '),
        chunkStartTime,
        currentChunkCues[currentChunkCues.length - 1].endTime,
        chunks.length,
        tokenCount
      );
      chunks.push(chunk);
    }

    // Link chunks together
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        chunks[i].previousChunkId = chunks[i - 1].id;
      }
      if (i < chunks.length - 1) {
        chunks[i].nextChunkId = chunks[i + 1].id;
      }
    }

    return chunks;
  }

  /**
   * Create a chunk from cues
   */
  private static createChunk(
    cues: VTTCue[],
    text: string,
    startTime: number,
    endTime: number,
    sequenceIndex: number,
    tokenCount: number
  ): TranscriptChunk {
    return {
      id: this.generateChunkId(sequenceIndex),
      sequenceIndex,
      startTime,
      endTime,
      text: text.trim(),
      tokenCount,
    };
  }

  /**
   * Get last N cues for overlap (based on sentence boundaries)
   */
  private static getOverlapCues(cues: VTTCue[], sentenceCount: number): VTTCue[] {
    if (cues.length === 0 || sentenceCount === 0) {
      return [];
    }

    // Simple approach: take last N cues
    // More sophisticated: detect sentence boundaries
    const overlapCount = Math.min(sentenceCount, Math.floor(cues.length / 2));
    return cues.slice(-overlapCount);
  }

  /**
   * Estimate token count for text
   * Rough approximation: ~1.3 tokens per word for English
   */
  static estimateTokens(text: string): number {
    const words = text.split(/\s+/).filter(word => word.length > 0);
    return Math.ceil(words.length * 1.3);
  }

  /**
   * Generate unique chunk ID
   */
  private static generateChunkId(sequenceIndex: number): string {
    return `chunk_${sequenceIndex.toString().padStart(4, '0')}`;
  }

  /**
   * Format timestamp for display
   */
  static formatTimestamp(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Create chunk metadata for storage
   */
  static createChunkMetadata(
    chunk: TranscriptChunk,
    context: {
      lessonId: string;
      courseId: string;
      courseAssetId: string;
      vttAssetId: string;
      courseName: string;
      chapterTitle: string;
      chapterIndex: number;
      lessonTitle: string;
      lessonIndex: number;
      language: string;
      vttVersion: string;
    }
  ): ChunkMetadata {
    return {
      chunkId: chunk.id,
      lessonId: context.lessonId,
      courseId: context.courseId,
      courseAssetId: context.courseAssetId,
      vttAssetId: context.vttAssetId,
      courseName: context.courseName,
      chapterTitle: context.chapterTitle,
      chapterIndex: context.chapterIndex,
      lessonTitle: context.lessonTitle,
      lessonIndex: context.lessonIndex,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      startTimestamp: this.formatTimestamp(chunk.startTime),
      endTimestamp: this.formatTimestamp(chunk.endTime),
      tokenCount: chunk.tokenCount,
      language: context.language,
      vttVersion: context.vttVersion,
      processedAt: new Date().toISOString(),
    };
  }

  /**
   * Get statistics about chunks
   */
  static getChunkStatistics(chunks: TranscriptChunk[]): {
    totalChunks: number;
    avgTokens: number;
    minTokens: number;
    maxTokens: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
  } {
    if (chunks.length === 0) {
      return {
        totalChunks: 0,
        avgTokens: 0,
        minTokens: 0,
        maxTokens: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
      };
    }

    const tokens = chunks.map(c => c.tokenCount);
    const durations = chunks.map(c => c.endTime - c.startTime);

    return {
      totalChunks: chunks.length,
      avgTokens: tokens.reduce((a, b) => a + b, 0) / tokens.length,
      minTokens: Math.min(...tokens),
      maxTokens: Math.max(...tokens),
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
    };
  }

  /**
   * Validate chunks meet requirements
   */
  static validateChunks(chunks: TranscriptChunk[], config: Partial<ChunkConfig> = {}): {
    valid: boolean;
    issues: string[];
  } {
    const fullConfig: ChunkConfig = { ...this.DEFAULT_CONFIG, ...config };
    const issues: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Check token count
      if (chunk.tokenCount > fullConfig.maxTokens) {
        issues.push(`Chunk ${i} exceeds max tokens: ${chunk.tokenCount} > ${fullConfig.maxTokens}`);
      }

      // Check time window
      const duration = chunk.endTime - chunk.startTime;
      if (duration > fullConfig.maxTimeWindow) {
        issues.push(`Chunk ${i} exceeds max time window: ${duration}s > ${fullConfig.maxTimeWindow}s`);
      }

      // Check sequence
      if (chunk.sequenceIndex !== i) {
        issues.push(`Chunk ${i} has incorrect sequence index: ${chunk.sequenceIndex}`);
      }

      // Check timestamps
      if (chunk.startTime >= chunk.endTime) {
        issues.push(`Chunk ${i} has invalid timestamps: ${chunk.startTime} >= ${chunk.endTime}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
