/**
 * Fallback & Failure Scenarios Integration Tests
 * Tests: FB-01 through FB-04 (P0 and P1)
 *
 * These tests validate that the system fails gracefully and/or falls back when:
 * - XML long-context is missing or not READY
 * - OpenAI times out or returns an error (e.g., context length exceeded)
 *
 * Notes:
 * - We keep tests deterministic by mocking `global.fetch` (OpenAI) and S3 (via global mocks).
 * - We avoid invoking the full legacy RAG pipeline by spying on AIService’s internal
 *   `getRAGContext` method (private at type-level, accessible at runtime).
 */

import { PrismaClient } from '@prisma/client';
import { AIService } from '@/lib/services/ai.service';
import { KnowledgeContextService } from '@/lib/services/knowledge-context.service';
import { clearRequestHistory, createOpenAIMock, getLastRequest } from '../__mocks__/openai';

const prisma = new PrismaClient();

describe('Fallback & Failure Scenarios', () => {
  const originalFetch = global.fetch;

  const ids = {
    userId: 'fb-test-user',
    courseId: 'fb-test-course',
    chapterId: 'fb-test-chapter',
    lessonId: 'fb-test-lesson',
    courseAssetId: 'fb-test-video-asset',
  };

  let conversationId: string;

  beforeAll(async () => {
    // Base hierarchy shared across cases.
    await prisma.user.upsert({
      where: { id: ids.userId },
      update: {},
      create: {
        id: ids.userId,
        email: 'fb-test@example.com',
        name: 'Fallback Test User',
        role: 'USER',
      },
    });

    await prisma.course.upsert({
      where: { id: ids.courseId },
      update: {},
      create: {
        id: ids.courseId,
        title: 'Fallback Test Course',
        slug: 'fb-test-course-slug',
        description: 'Course used for fallback tests',
        level: 'BEGINNER',
        category: 'test',
        tags: [],
        duration: 3600,
        instructorId: ids.userId,
      },
    });

    await prisma.chapter.upsert({
      where: { id: ids.chapterId },
      update: {},
      create: {
        id: ids.chapterId,
        title: 'Fallback Test Chapter',
        courseId: ids.courseId,
        order: 1,
      },
    });

    await prisma.lesson.upsert({
      where: { id: ids.lessonId },
      update: {},
      create: {
        id: ids.lessonId,
        title: 'Fallback Test Lesson',
        chapterId: ids.chapterId,
        order: 1,
        duration: 600,
        transcript: 'Legacy transcript content for fallback tests.',
      },
    });

    // CourseAsset is needed to create TranscriptAsset (RAG availability gate).
    await prisma.courseAsset.upsert({
      where: { id: ids.courseAssetId },
      update: {},
      create: {
        id: ids.courseAssetId,
        courseId: ids.courseId,
        title: 'Test Video Asset',
        type: 'VIDEO',
        url: 'https://example.com/video.mp4',
        s3Key: 'test/video.mp4',
        contentType: 'video/mp4',
        mimeType: 'video/mp4',
      },
    });
  });

  afterAll(async () => {
    global.fetch = originalFetch;

    await prisma.aIMessage.deleteMany({
      where: { conversation: { lessonId: ids.lessonId } },
    });
    await prisma.aIConversation.deleteMany({ where: { lessonId: ids.lessonId } });

    await prisma.transcriptChunk.deleteMany({
      where: { transcript: { lessonId: ids.lessonId } },
    });
    await prisma.transcriptAsset.deleteMany({ where: { lessonId: ids.lessonId } });

    await prisma.knowledgeAnchor.deleteMany({ where: { lessonId: ids.lessonId } });
    await prisma.knowledgeContext.deleteMany({ where: { lessonId: ids.lessonId } });

    await prisma.lesson.deleteMany({ where: { id: ids.lessonId } });
    await prisma.chapter.deleteMany({ where: { id: ids.chapterId } });
    await prisma.courseAsset.deleteMany({ where: { id: ids.courseAssetId } });
    await prisma.course.deleteMany({ where: { id: ids.courseId } });
    await prisma.user.deleteMany({ where: { id: ids.userId } });

    await prisma.$disconnect();
  });

  beforeEach(async () => {
    clearRequestHistory();
    KnowledgeContextService.clearCache();

    // New conversation per test keeps message history isolated/deterministic.
    const conv = await prisma.aIConversation.create({
      data: {
        userId: ids.userId,
        courseId: ids.courseId,
        lessonId: ids.lessonId,
      },
    });
    conversationId = conv.id;
  });

  afterEach(async () => {
    await prisma.aIMessage.deleteMany({ where: { conversationId } });
    await prisma.aIConversation.deleteMany({ where: { id: conversationId } });

    // Clean up per-test KB state.
    await prisma.knowledgeAnchor.deleteMany({ where: { lessonId: ids.lessonId } });
    await prisma.knowledgeContext.deleteMany({ where: { lessonId: ids.lessonId } });
    await prisma.transcriptAsset.deleteMany({ where: { lessonId: ids.lessonId } });

    KnowledgeContextService.clearCache();
  });

  /**
   * FB-01: Missing XML (P0)
   *
   * If no READY KnowledgeContext exists, the system should fall back to legacy RAG
   * (when RAG is available) rather than pretending the XML is present.
   */
  describe('FB-01: Missing XML', () => {
    it('should trigger RAG fallback when XML context is missing', async () => {
      // Make RAG "available" by creating a READY transcript asset.
      await prisma.transcriptAsset.create({
        data: {
          lessonId: ids.lessonId,
          videoAssetId: ids.courseAssetId,
          filename: 'test.vtt',
          s3Key: 'test/transcript.vtt',
          status: 'READY',
        },
      });

      // Avoid invoking the full legacy pipeline: stub internal RAG context assembly.
      const ragSpy = jest
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .spyOn(AIService as any, 'getRAGContext')
        .mockResolvedValue({
          enabled: true,
          context: '[Source: Test Chapter > Test Lesson, 00:00:00-00:00:10]\nRAG fallback context.',
          sources: [],
          confidence: 'HIGH',
        });

      global.fetch = createOpenAIMock() as any;

      const result = await AIService.sendMessage({
        conversationId,
        message: 'What does the lesson cover?',
      });

      expect(ragSpy).toHaveBeenCalled();
      expect(result.contextMode).toBe('rag');

      const lastRequest = getLastRequest();
      const systemMessage = lastRequest.messages.find((m: any) => m.role === 'system');
      expect(systemMessage.content).toContain('<retrieved_context>');
      expect(systemMessage.content).not.toContain('<knowledge_base');

      ragSpy.mockRestore();
    });
  });

  /**
   * FB-02: Processing state (P0)
   *
   * When KnowledgeContext exists but is not READY, the system must not build a full-context
   * prompt (no XML prefix). It should fall back (RAG if available; otherwise legacy).
   */
  describe('FB-02: Processing state', () => {
    it('should not use full-context mode when KnowledgeContext status is PENDING', async () => {
      await prisma.knowledgeContext.create({
        data: {
          lessonId: ids.lessonId,
          s3Key: 'test-key',
          contentHash: 'pending-hash',
          tokenCount: 1000,
          sectionCount: 1,
          anchorCount: 0,
          status: 'PENDING',
        },
      });

      // Ensure RAG is not available so the expected fallback is legacy.
      global.fetch = createOpenAIMock() as any;

      const result = await AIService.sendMessage({
        conversationId,
        message: 'Explain what this lesson is about',
      });

      expect(result.contextMode).toBe('legacy');

      const lastRequest = getLastRequest();
      const systemMessage = lastRequest.messages.find((m: any) => m.role === 'system');
      expect(systemMessage.content).not.toContain('<knowledge_base');
      expect(systemMessage.content).toContain('Lesson Context:');
    });
  });

  /**
   * FB-03: OpenAI timeout (P1)
   *
   * The UI must not crash; backend should return a safe fallback response.
   */
  describe('FB-03: OpenAI timeout', () => {
    it('should return a deterministic fallback answer when OpenAI times out', async () => {
      // Force full context path so we cover the "XML-first prompt" call site too.
      await prisma.knowledgeContext.create({
        data: {
          lessonId: ids.lessonId,
          s3Key: 'test-key',
          contentHash: 'ready-hash',
          tokenCount: 1000,
          sectionCount: 1,
          anchorCount: 0,
          status: 'READY',
        },
      });

      global.fetch = jest.fn().mockImplementation(async () => {
        throw new Error('Request timeout');
      }) as any;

      const result = await AIService.sendMessage({
        conversationId,
        message: 'What is REST?',
      });

      // Even on timeout, we should not throw; AIService falls back to a mock response.
      expect(result.assistantMessage.content).toContain('I understand you\'re asking about');
      expect(result.contextMode).toBe('full');
    });
  });

  /**
   * FB-04: Token overflow (P1)
   *
   * Simulates an OpenAI "request too large / context length exceeded" style failure.
   * The backend must fail safely (no uncaught exception / blank response).
   */
  describe('FB-04: Token overflow', () => {
    it('should fail safely when OpenAI rejects an oversized prompt', async () => {
      await prisma.knowledgeContext.create({
        data: {
          lessonId: ids.lessonId,
          s3Key: 'test-key',
          contentHash: 'huge-xml-hash',
          tokenCount: 200000, // forces "oversized" semantics in metadata
          sectionCount: 999,
          anchorCount: 0,
          status: 'READY',
        },
      });

      // Simulate OpenAI rejecting the request (e.g., 400/413).
      global.fetch = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'context_length_exceeded' } }), {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        })
      ) as any;

      const result = await AIService.sendMessage({
        conversationId,
        message: 'Summarize the lesson',
      });

      // Safe fallback content (no throw / no blank screen).
      expect(result.assistantMessage.content).toContain('I understand you\'re asking about');
      expect(result.contextMode).toBe('full');
    });
  });
});

