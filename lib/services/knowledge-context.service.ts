/**
 * Knowledge Context Service
 * Manages storage, retrieval, and caching of XML knowledge contexts
 * for the full context injection AI system
 */

import prisma from '@/lib/prisma';
import s3Client, { ASSET_S3_BUCKET_NAME, CLOUDFRONT_DOMAIN, S3_ASSET_BASE_PREFIX } from '@/lib/aws-s3';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { VTTToXMLService, XMLGenerationResult, KnowledgeAnchorData, CourseContext } from './vtt-to-xml.service';
import { KnowledgeContextStatus, KnowledgeAnchorType } from '@prisma/client';
import { log } from '@/lib/logger';

// In-memory cache for XML contexts (reduces S3 reads)
const memoryCache = new Map<string, { xml: string; loadedAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface KnowledgeContextInfo {
  id: string;
  lessonId: string;
  status: KnowledgeContextStatus;
  tokenCount: number;
  sectionCount: number;
  anchorCount: number;
  contentHash: string;
  processedAt: Date | null;
  errorMessage: string | null;
}

export interface KnowledgeAnchorInfo {
  id: string;
  timestamp: number;
  timestampStr: string;
  title: string;
  summary: string;
  keyTerms: string[];
  anchorType: KnowledgeAnchorType;
  sequenceIndex: number;
}

export class KnowledgeContextService {
  private vttToXmlService: VTTToXMLService;

  constructor(openaiApiKey?: string) {
    this.vttToXmlService = new VTTToXMLService(openaiApiKey);
  }

  /**
   * Generate and store knowledge context from VTT content
   * This is the main entry point called during VTT upload
   */
  async generateAndStoreContext(
    lessonId: string,
    vttContent: string,
    context: CourseContext
  ): Promise<KnowledgeContextInfo> {
    const startTime = Date.now();

    try {
      // Mark as processing
      await this.updateStatus(lessonId, 'PROCESSING');

      // Generate XML from VTT
      log('KnowledgeContext', 'info', 'Starting XML generation', {
        lessonId,
        vttLength: vttContent.length,
      });

      const result = await this.vttToXmlService.processVTTToKnowledgeBase(
        vttContent,
        context
      );

      log('KnowledgeContext', 'info', 'XML generation complete', {
        lessonId,
        tokenCount: result.metadata.tokenCount,
        sectionCount: result.metadata.sectionCount,
        anchorCount: result.metadata.anchorCount,
        processingTimeMs: result.metadata.processingTimeMs,
      });

      // Store XML to S3
      const s3Key = await this.storeXMLToS3(context.courseId, lessonId, result.xml);

      // Store anchors in database
      await this.storeAnchors(lessonId, result.anchors);

      // Create or update context record
      const contextRecord = await this.upsertContextRecord(lessonId, {
        s3Key,
        contentHash: result.contentHash,
        tokenCount: result.metadata.tokenCount,
        sectionCount: result.metadata.sectionCount,
        anchorCount: result.metadata.anchorCount,
        status: 'READY',
      });

      // Warm memory cache
      memoryCache.set(lessonId, {
        xml: result.xml,
        loadedAt: Date.now(),
      });

      log('KnowledgeContext', 'info', 'Knowledge context stored successfully', {
        lessonId,
        totalTimeMs: Date.now() - startTime,
      });

      return {
        id: contextRecord.id,
        lessonId: contextRecord.lessonId,
        status: contextRecord.status,
        tokenCount: contextRecord.tokenCount,
        sectionCount: contextRecord.sectionCount,
        anchorCount: contextRecord.anchorCount,
        contentHash: contextRecord.contentHash,
        processedAt: contextRecord.processedAt,
        errorMessage: contextRecord.errorMessage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('KnowledgeContext', 'error', 'Failed to generate knowledge context', {
        lessonId,
        error: errorMessage,
      });

      await this.updateStatus(lessonId, 'FAILED', errorMessage);
      throw error;
    }
  }

  /**
   * Retrieve knowledge context XML for a lesson
   * Uses memory cache → S3 fallback
   */
  async getKnowledgeContext(lessonId: string): Promise<string | null> {
    // Check memory cache first
    const cached = memoryCache.get(lessonId);
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
      log('KnowledgeContext', 'debug', 'Cache hit', { lessonId });
      return cached.xml;
    }

    // Get context record from database
    const context = await prisma.knowledgeContext.findUnique({
      where: { lessonId },
    });

    if (!context || context.status !== 'READY') {
      return null;
    }

    // Fetch from S3
    try {
      const xml = await this.fetchXMLFromS3(context.s3Key);

      // Update memory cache
      memoryCache.set(lessonId, {
        xml,
        loadedAt: Date.now(),
      });

      return xml;
    } catch (error) {
      log('KnowledgeContext', 'error', 'Failed to fetch XML from S3', {
        lessonId,
        s3Key: context.s3Key,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return null;
    }
  }

  /**
   * Get knowledge anchors for a lesson (for frontend display)
   */
  async getAnchors(lessonId: string): Promise<KnowledgeAnchorInfo[]> {
    const anchors = await prisma.knowledgeAnchor.findMany({
      where: { lessonId },
      orderBy: { sequenceIndex: 'asc' },
    });

    return anchors.map((anchor) => ({
      id: anchor.id,
      timestamp: Number(anchor.timestamp),
      timestampStr: anchor.timestampStr,
      title: anchor.title,
      summary: anchor.summary,
      keyTerms: anchor.keyTerms,
      anchorType: anchor.anchorType,
      sequenceIndex: anchor.sequenceIndex,
    }));
  }

  /**
   * Get context status info for admin UI
   */
  async getContextInfo(lessonId: string): Promise<KnowledgeContextInfo | null> {
    const context = await prisma.knowledgeContext.findUnique({
      where: { lessonId },
    });

    if (!context) {
      return null;
    }

    return {
      id: context.id,
      lessonId: context.lessonId,
      status: context.status,
      tokenCount: context.tokenCount,
      sectionCount: context.sectionCount,
      anchorCount: context.anchorCount,
      contentHash: context.contentHash,
      processedAt: context.processedAt,
      errorMessage: context.errorMessage,
    };
  }

  /**
   * Invalidate context when VTT is re-uploaded
   */
  async invalidateContext(lessonId: string): Promise<void> {
    // Clear memory cache
    memoryCache.delete(lessonId);

    // Get existing context
    const context = await prisma.knowledgeContext.findUnique({
      where: { lessonId },
    });

    if (context) {
      // Delete S3 object
      try {
        await this.deleteXMLFromS3(context.s3Key);
      } catch (error) {
        log('KnowledgeContext', 'warn', 'Failed to delete S3 object', {
          lessonId,
          s3Key: context.s3Key,
        });
      }

      // Delete database records
      await prisma.$transaction([
        prisma.knowledgeAnchor.deleteMany({ where: { lessonId } }),
        prisma.knowledgeContext.delete({ where: { lessonId } }),
      ]);
    }

    log('KnowledgeContext', 'info', 'Context invalidated', { lessonId });
  }

  /**
   * Check if context needs regeneration (e.g., VTT changed)
   */
  async needsRegeneration(lessonId: string, newVttHash: string): Promise<boolean> {
    const context = await prisma.knowledgeContext.findUnique({
      where: { lessonId },
      select: { contentHash: true, status: true },
    });

    if (!context) {
      return true;
    }

    if (context.status !== 'READY') {
      return true;
    }

    // Compare hashes - note: contentHash is the XML hash, not VTT hash
    // For simplicity, we'll regenerate if this method is called
    // (typically after VTT upload which implies changes)
    return true;
  }

  // ============ Private Methods ============

  /**
   * Store XML content to S3
   */
  private async storeXMLToS3(courseId: string, lessonId: string, xml: string): Promise<string> {
    // Keep XML under the same asset prefix so it can also be served via CloudFront when needed:
    //   <AWS_S3_ASSET_PREFIX>/<courseId>/<lessonId>/context.xml
    const key = `${S3_ASSET_BASE_PREFIX}/${courseId}/${lessonId}/context.xml`;

    const command = new PutObjectCommand({
      Bucket: ASSET_S3_BUCKET_NAME,
      Key: key,
      Body: xml,
      ContentType: 'application/xml',
      ServerSideEncryption: 'AES256',
      // Cache for 1 year (immutable content, hash-based invalidation)
      CacheControl: 'public, max-age=31536000, immutable',
    });

    await s3Client.send(command);

    log('KnowledgeContext', 'debug', 'Stored XML to S3', { key, size: xml.length });

    return key;
  }

  /**
   * Fetch XML content from S3
   */
  private async fetchXMLFromS3(s3Key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: ASSET_S3_BUCKET_NAME,
      Key: s3Key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error('Empty response from S3');
    }

    // Convert stream to string
    const xml = await response.Body.transformToString('utf-8');
    return xml;
  }

  /**
   * Delete XML from S3
   */
  private async deleteXMLFromS3(s3Key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: ASSET_S3_BUCKET_NAME,
      Key: s3Key,
    });

    await s3Client.send(command);
  }

  /**
   * Store knowledge anchors in database
   */
  private async storeAnchors(
    lessonId: string,
    anchors: KnowledgeAnchorData[]
  ): Promise<void> {
    // Delete existing anchors first
    await prisma.knowledgeAnchor.deleteMany({
      where: { lessonId },
    });

    // Create new anchors
    if (anchors.length > 0) {
      await prisma.knowledgeAnchor.createMany({
        data: anchors.map((anchor) => ({
          lessonId,
          timestamp: anchor.timestamp,
          timestampStr: anchor.timestampStr,
          title: anchor.title,
          summary: anchor.summary,
          keyTerms: anchor.keyTerms,
          anchorType: anchor.anchorType,
          sequenceIndex: anchor.sequenceIndex,
        })),
      });
    }

    log('KnowledgeContext', 'debug', 'Stored anchors', {
      lessonId,
      count: anchors.length,
    });
  }

  /**
   * Create or update context record
   */
  private async upsertContextRecord(
    lessonId: string,
    data: {
      s3Key: string;
      contentHash: string;
      tokenCount: number;
      sectionCount: number;
      anchorCount: number;
      status: KnowledgeContextStatus;
    }
  ) {
    return prisma.knowledgeContext.upsert({
      where: { lessonId },
      create: {
        lessonId,
        ...data,
        processedAt: new Date(),
      },
      update: {
        ...data,
        processedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  /**
   * Update context status (for progress tracking)
   */
  private async updateStatus(
    lessonId: string,
    status: KnowledgeContextStatus,
    errorMessage?: string
  ): Promise<void> {
    await prisma.knowledgeContext.upsert({
      where: { lessonId },
      create: {
        lessonId,
        s3Key: '',
        contentHash: '',
        tokenCount: 0,
        sectionCount: 0,
        anchorCount: 0,
        status,
        errorMessage,
      },
      update: {
        status,
        errorMessage,
      },
    });
  }

  /**
   * Clear all memory caches (useful for testing)
   */
  static clearCache(): void {
    memoryCache.clear();
  }

  /**
   * Get cache stats (for monitoring)
   */
  static getCacheStats(): { size: number; entries: string[] } {
    return {
      size: memoryCache.size,
      entries: Array.from(memoryCache.keys()),
    };
  }
}
