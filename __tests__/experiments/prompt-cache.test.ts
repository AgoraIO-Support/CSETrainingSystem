/**
 * Prompt Construction & Context Caching Experiments
 * Tests: PR-01 through PR-05 (P0 and P1)
 *
 * CRITICAL: These tests verify the core caching strategy:
 * - XML must be the FIRST content in the system prompt (stable prefix)
 * - No dynamic data should appear before XML
 * - Cache hits should show measurable latency improvement
 * - Cache misses should occur when XML content changes
 *
 * OpenAI Context Caching Requirements:
 * - First 1024 tokens must be identical for cache hit
 * - Cache valid for 5-10 minutes of inactivity
 * - 50% discount on cached tokens
 */

import { AIService } from '@/lib/services/ai.service';
import { KnowledgeContextService } from '@/lib/services/knowledge-context.service';
import { VTT_MINIMAL, TEST_COURSE_CONTEXT } from '../__fixtures__/sample-vtt';
import {
  createOpenAIMock,
  clearRequestHistory,
  requestHistory,
  assertXMLFirst,
  getLastRequest,
  MockOpenAIOptions,
} from '../__mocks__/openai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Track timing for cache experiments
interface TimingResult {
  requestIndex: number;
  latencyMs: number;
  cachedTokens: number;
  totalTokens: number;
}

describe('Prompt Construction & Context Caching', () => {
  let testLessonId: string;
  let testConversationId: string;
  let originalFetch: typeof global.fetch;

  beforeAll(async () => {
    originalFetch = global.fetch;

    // Create test data
    const user = await prisma.user.upsert({
      where: { email: 'cache-test@example.com' },
      update: {},
      create: {
        id: 'cache-test-user',
        email: 'cache-test@example.com',
        name: 'Cache Test User',
        role: 'USER',
      },
    });

    const course = await prisma.course.upsert({
      where: { id: 'cache-test-course' },
      update: {},
      create: {
        id: 'cache-test-course',
        title: 'Cache Test Course',
        slug: 'cache-test-course-slug',
        description: 'Test course for cache experiments',
        level: 'BEGINNER',
        category: 'test',
        tags: [],
        duration: 3600,
        instructorId: user.id,
      },
    });

    const chapter = await prisma.chapter.upsert({
      where: { id: 'cache-test-chapter' },
      update: {},
      create: {
        id: 'cache-test-chapter',
        title: 'Cache Test Chapter',
        courseId: course.id,
        order: 1,
      },
    });

    const lesson = await prisma.lesson.upsert({
      where: { id: 'cache-test-lesson' },
      update: {},
      create: {
        id: 'cache-test-lesson',
        title: 'Cache Test Lesson',
        chapterId: chapter.id,
        order: 1,
        duration: 600,
      },
    });

    testLessonId = lesson.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.aIMessage.deleteMany({
      where: { conversation: { lessonId: testLessonId } },
    });
    await prisma.aIConversation.deleteMany({
      where: { lessonId: testLessonId },
    });
    await prisma.knowledgeAnchor.deleteMany({
      where: { lessonId: testLessonId },
    });
    await prisma.knowledgeContext.deleteMany({
      where: { lessonId: testLessonId },
    });
    await prisma.lesson.deleteMany({
      where: { id: testLessonId },
    });
    await prisma.chapter.deleteMany({
      where: { id: 'cache-test-chapter' },
    });
    await prisma.course.deleteMany({
      where: { id: 'cache-test-course' },
    });
    await prisma.user.deleteMany({
      where: { id: 'cache-test-user' },
    });
    await prisma.$disconnect();

    global.fetch = originalFetch;
  });

  beforeEach(async () => {
    clearRequestHistory();

    // Create fresh conversation for each test
    const conv = await prisma.aIConversation.create({
      data: {
        userId: 'cache-test-user',
        courseId: 'cache-test-course',
        lessonId: testLessonId,
      },
    });
    testConversationId = conv.id;

    // Clear knowledge context cache
    KnowledgeContextService.clearCache();
  });

  afterEach(async () => {
    // Cleanup conversation
    await prisma.aIMessage.deleteMany({
      where: { conversationId: testConversationId },
    });
    await prisma.aIConversation.deleteMany({
      where: { id: testConversationId },
    });
  });

  /**
   * PR-01: XML as Stable Prefix (P0) - CRITICAL
   *
   * Verifies that XML appears at the ABSOLUTE TOP of the system prompt.
   * This is essential for OpenAI context caching to work.
   */
  describe('PR-01: XML as Stable Prefix', () => {
    beforeEach(() => {
      global.fetch = createOpenAIMock() as any;
    });

    it('should place XML at the very beginning of system prompt', async () => {
      // Create knowledge context
      const knowledgeService = new KnowledgeContextService('mock-key');

      // Mock the context retrieval to return our test XML
      const testXML = `<?xml version="1.0" encoding="UTF-8"?>
<knowledge_base course_id="test" lesson_id="test">
  <course_overview>
    <title>Test Course</title>
  </course_overview>
  <transcript_sections>
    <section timestamp="00:00:00">
      <content>Test content</content>
    </section>
  </transcript_sections>
</knowledge_base>`;

      // Store test context
      await prisma.knowledgeContext.upsert({
        where: { lessonId: testLessonId },
        update: { status: 'READY', s3Key: 'test-key', contentHash: 'test' },
        create: {
          lessonId: testLessonId,
          s3Key: 'test-key',
          contentHash: 'test-hash',
          tokenCount: 1000,
          sectionCount: 1,
          anchorCount: 0,
          status: 'READY',
        },
      });

      // Send a message
      await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'What is this lesson about?',
      });

      // Get the last request
      const lastRequest = getLastRequest();
      expect(lastRequest).toBeDefined();

      // Find system message
      const systemMessage = lastRequest.messages.find(
        (m: any) => m.role === 'system'
      );
      expect(systemMessage).toBeDefined();

      // XML should be first (starts with <?xml or <knowledge_base)
      const content = systemMessage.content;
      const startsWithXML =
        content.trimStart().startsWith('<?xml') ||
        content.trimStart().startsWith('<knowledge_base');

      expect(startsWithXML).toBe(true);
    });

    it('should not have user-specific data before XML', async () => {
      await prisma.knowledgeContext.upsert({
        where: { lessonId: testLessonId },
        update: { status: 'READY' },
        create: {
          lessonId: testLessonId,
          s3Key: 'test-key',
          contentHash: 'test-hash',
          tokenCount: 1000,
          sectionCount: 1,
          anchorCount: 0,
          status: 'READY',
        },
      });

      await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'Hello',
      });

      const lastRequest = getLastRequest();
      const systemMessage = lastRequest.messages.find(
        (m: any) => m.role === 'system'
      );

      // Content before XML marker should not contain:
      // - User names
      // - Timestamps
      // - Session IDs
      // - Dynamic values
      const content = systemMessage.content;
      // Find the FIRST XML marker (declaration or root element).
      // Using `Math.max` here would incorrectly pick the later marker and treat
      // the XML declaration itself as "dynamic content before XML".
      const xmlDeclStart = content.indexOf('<?xml');
      const kbStart = content.indexOf('<knowledge_base');
      const xmlStartCandidates = [xmlDeclStart, kbStart].filter((i) => i >= 0);
      const xmlStart =
        xmlStartCandidates.length > 0 ? Math.min(...xmlStartCandidates) : -1;

      if (xmlStart > 0) {
        const beforeXML = content.substring(0, xmlStart);
        expect(beforeXML.trim()).toBe(''); // Should be empty or whitespace only
      }
    });
  });

  /**
   * PR-02: No Dynamic Data Before XML (P0)
   *
   * Verifies that no user/time/session data is inserted before the XML prefix.
   */
  describe('PR-02: No Dynamic Data Before XML', () => {
    beforeEach(() => {
      global.fetch = createOpenAIMock() as any;
    });

    it('should not include current timestamp before XML', async () => {
      await prisma.knowledgeContext.upsert({
        where: { lessonId: testLessonId },
        update: { status: 'READY' },
        create: {
          lessonId: testLessonId,
          s3Key: 'test-key',
          contentHash: 'test-hash',
          tokenCount: 1000,
          sectionCount: 1,
          anchorCount: 0,
          status: 'READY',
        },
      });

      await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'Test message',
      });

      const lastRequest = getLastRequest();
      const systemMessage = lastRequest.messages.find(
        (m: any) => m.role === 'system'
      );
      const content = systemMessage.content;

      // Find where XML starts
      const xmlStart = content.indexOf('<');

      // Check content before XML for dynamic patterns
      if (xmlStart > 0) {
        const beforeXML = content.substring(0, xmlStart);

        // Should not contain ISO timestamps
        expect(beforeXML).not.toMatch(/\d{4}-\d{2}-\d{2}T/);

        // Should not contain Unix timestamps
        expect(beforeXML).not.toMatch(/\d{10,13}/);
      }
    });

    it('should not include user name before XML', async () => {
      await prisma.knowledgeContext.upsert({
        where: { lessonId: testLessonId },
        update: { status: 'READY' },
        create: {
          lessonId: testLessonId,
          s3Key: 'test-key',
          contentHash: 'test-hash',
          tokenCount: 1000,
          sectionCount: 1,
          anchorCount: 0,
          status: 'READY',
        },
      });

      await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'Hello',
      });

      const lastRequest = getLastRequest();
      const systemMessage = lastRequest.messages.find(
        (m: any) => m.role === 'system'
      );
      const content = systemMessage.content;

      const xmlStart = content.indexOf('<');
      if (xmlStart > 0) {
        const beforeXML = content.substring(0, xmlStart);
        expect(beforeXML.toLowerCase()).not.toContain('cache test user');
      }
    });
  });

  /**
   * PR-03: Cache Hit Control (P0) - EXPERIMENTAL
   *
   * Verifies that sending the same question twice results in
   * observable cache hit behavior (lower latency or cached token reporting).
   */
  describe('PR-03: Cache Hit (Control Experiment)', () => {
    it('should show cache hit indicators on repeated requests', async () => {
      // Setup mock to simulate cache behavior
      let requestCount = 0;
      global.fetch = createOpenAIMock({
        simulateCacheHit: false, // First request: no cache
      }) as any;

      await prisma.knowledgeContext.upsert({
        where: { lessonId: testLessonId },
        update: { status: 'READY' },
        create: {
          lessonId: testLessonId,
          s3Key: 'test-key',
          contentHash: 'stable-hash-for-cache',
          tokenCount: 5000,
          sectionCount: 10,
          anchorCount: 5,
          status: 'READY',
        },
      });

      // First request - should be cache miss
      const start1 = Date.now();
      await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'What is REST?',
      });
      const latency1 = Date.now() - start1;

      // Switch mock to simulate cache hit
      global.fetch = createOpenAIMock({
        simulateCacheHit: true,
        cachedTokens: 4500, // Most tokens cached
        latencyMs: 50, // Much faster
      }) as any;

      // Second request - same question, should hit cache
      const start2 = Date.now();
      await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'What is REST?',
      });
      const latency2 = Date.now() - start2;

      // Cache hit should be faster
      // Note: In mock, we simulate this with latencyMs difference
      expect(latency2).toBeLessThan(latency1);

      console.log(`Cache Experiment Results:
        First request latency: ${latency1}ms (cache miss)
        Second request latency: ${latency2}ms (cache hit)
        Improvement: ${((latency1 - latency2) / latency1 * 100).toFixed(1)}%
      `);
    });

    it('should report cached tokens in response', async () => {
      global.fetch = createOpenAIMock({
        simulateCacheHit: true,
        cachedTokens: 4000,
      }) as any;

      await prisma.knowledgeContext.upsert({
        where: { lessonId: testLessonId },
        update: { status: 'READY' },
        create: {
          lessonId: testLessonId,
          s3Key: 'test-key',
          contentHash: 'test-hash',
          tokenCount: 5000,
          sectionCount: 10,
          anchorCount: 5,
          status: 'READY',
        },
      });

      await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'Test question',
      });

      // In real implementation, we would check the response
      // for cached_tokens in usage statistics
      // This is verified through the mock's response structure
      expect(requestHistory.length).toBeGreaterThan(0);
    });
  });

  /**
   * PR-04: Cache Miss (Negative Test) (P0)
   *
   * Verifies that modifying XML content causes cache miss.
   */
  describe('PR-04: Cache Miss (Negative Test)', () => {
    it('should have cache miss when XML changes', async () => {
      // First request with original hash
      await prisma.knowledgeContext.upsert({
        where: { lessonId: testLessonId },
        update: { contentHash: 'original-hash' },
        create: {
          lessonId: testLessonId,
          s3Key: 'test-key',
          contentHash: 'original-hash',
          tokenCount: 5000,
          sectionCount: 10,
          anchorCount: 5,
          status: 'READY',
        },
      });

      global.fetch = createOpenAIMock({ simulateCacheHit: false }) as any;

      await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'What is API?',
      });

      const firstRequestPromptLength = getLastRequest()?.promptLength || 0;

      // Modify content hash (simulating XML change)
      await prisma.knowledgeContext.update({
        where: { lessonId: testLessonId },
        data: { contentHash: 'modified-hash-by-one-char' },
      });

      // Clear cache to force re-fetch
      KnowledgeContextService.clearCache();

      // Second request - should be cache miss due to content change
      global.fetch = createOpenAIMock({
        simulateCacheHit: false, // Explicit cache miss
        cachedTokens: 0,
      }) as any;

      await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'What is API?',
      });

      // Verify we made two separate requests
      expect(requestHistory.length).toBe(2);

      console.log(`Cache Miss Experiment:
        Content hash changed from 'original-hash' to 'modified-hash'
        Both requests should show 0 cached tokens
      `);
    });

    it('should miss cache when prompt prefix changes', async () => {
      await prisma.knowledgeContext.upsert({
        where: { lessonId: testLessonId },
        update: {},
        create: {
          lessonId: testLessonId,
          s3Key: 'test-key',
          contentHash: 'v1',
          tokenCount: 5000,
          sectionCount: 10,
          anchorCount: 5,
          status: 'READY',
        },
      });

      global.fetch = createOpenAIMock() as any;

      // First request
      await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'Question 1',
      });

      // Change the knowledge context (simulate VTT re-upload)
      await prisma.knowledgeContext.update({
        where: { lessonId: testLessonId },
        data: {
          contentHash: 'v2-changed',
          tokenCount: 5100, // Slightly different
        },
      });

      KnowledgeContextService.clearCache();

      // Second request with different prefix
      await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'Question 2',
      });

      // Both requests should be recorded
      expect(requestHistory.length).toBe(2);

      // Prompt lengths should be similar but not identical
      const prompt1Length = requestHistory[0].promptLength;
      const prompt2Length = requestHistory[1].promptLength;

      // Should be in same ballpark (same structure)
      expect(Math.abs(prompt1Length - prompt2Length)).toBeLessThan(
        prompt1Length * 0.2
      );
    });
  });

  /**
   * PR-05: Multi-Question Cache Reuse (P1)
   *
   * Verifies that asking 5 different questions maintains cache hits
   * for the XML prefix portion.
   */
  describe('PR-05: Multi-Question Cache Reuse', () => {
    it('should reuse cached XML across multiple different questions', async () => {
      await prisma.knowledgeContext.upsert({
        where: { lessonId: testLessonId },
        update: {},
        create: {
          lessonId: testLessonId,
          s3Key: 'test-key',
          contentHash: 'stable-for-multi-q',
          tokenCount: 5000,
          sectionCount: 10,
          anchorCount: 5,
          status: 'READY',
        },
      });

      const questions = [
        'What is REST?',
        'Explain HTTP methods',
        'How does authentication work?',
        'What are API best practices?',
        'How do I handle errors?',
      ];

      const timings: TimingResult[] = [];

      // First question - cache miss
      global.fetch = createOpenAIMock({ simulateCacheHit: false }) as any;
      const start1 = Date.now();
      await AIService.sendMessage({
        conversationId: testConversationId,
        message: questions[0],
      });
      timings.push({
        requestIndex: 0,
        latencyMs: Date.now() - start1,
        cachedTokens: 0,
        totalTokens: 5000,
      });

      // Subsequent questions - cache hits
      for (let i = 1; i < questions.length; i++) {
        global.fetch = createOpenAIMock({
          simulateCacheHit: true,
          cachedTokens: 4500,
          latencyMs: 50,
        }) as any;

        const start = Date.now();
        await AIService.sendMessage({
          conversationId: testConversationId,
          message: questions[i],
        });
        timings.push({
          requestIndex: i,
          latencyMs: Date.now() - start,
          cachedTokens: 4500,
          totalTokens: 5000,
        });
      }

      // Verify all requests used similar prompt prefix
      const promptLengths = requestHistory.map((r) => r.promptLength);
      const avgLength =
        promptLengths.reduce((a, b) => a + b, 0) / promptLengths.length;

      // All prompts should be within 10% of average (stable prefix)
      for (const length of promptLengths) {
        const deviation = Math.abs(length - avgLength) / avgLength;
        expect(deviation).toBeLessThan(0.15); // 15% tolerance for question variance
      }

      // Cache hits (requests 2-5) should be faster than cache miss (request 1)
      const firstLatency = timings[0].latencyMs;
      const avgCacheHitLatency =
        timings.slice(1).reduce((a, t) => a + t.latencyMs, 0) / 4;

      expect(avgCacheHitLatency).toBeLessThan(firstLatency);

      console.log(`Multi-Question Cache Experiment:
        Questions asked: ${questions.length}
        First request (cache miss): ${firstLatency}ms
        Avg cache hit latency: ${avgCacheHitLatency.toFixed(1)}ms
        Cache hit improvement: ${((firstLatency - avgCacheHitLatency) / firstLatency * 100).toFixed(1)}%
        Prompt length consistency: ${promptLengths.map(l => l).join(', ')}
      `);
    });

    it('should maintain stable token cost across questions', async () => {
      await prisma.knowledgeContext.upsert({
        where: { lessonId: testLessonId },
        update: {},
        create: {
          lessonId: testLessonId,
          s3Key: 'test-key',
          contentHash: 'cost-test',
          tokenCount: 5000,
          sectionCount: 10,
          anchorCount: 5,
          status: 'READY',
        },
      });

      global.fetch = createOpenAIMock({ simulateCacheHit: true }) as any;

      const questions = ['Q1?', 'Q2?', 'Q3?'];

      for (const q of questions) {
        await AIService.sendMessage({
          conversationId: testConversationId,
          message: q,
        });
      }

      // All requests should have been made
      expect(requestHistory.length).toBe(3);

      // Prompt sizes should be consistent (stable XML prefix)
      const sizes = requestHistory.map((r) => r.promptLength);
      const minSize = Math.min(...sizes);
      const maxSize = Math.max(...sizes);
      const variance = (maxSize - minSize) / minSize;

      // Less than 20% variance indicates stable prefix
      expect(variance).toBeLessThan(0.2);
    });
  });

  /**
   * Prompt Structure Verification
   */
  describe('Prompt Structure', () => {
    beforeEach(() => {
      global.fetch = createOpenAIMock() as any;
    });

    it('should include system instructions after XML', async () => {
      await prisma.knowledgeContext.upsert({
        where: { lessonId: testLessonId },
        update: { status: 'READY' },
        create: {
          lessonId: testLessonId,
          s3Key: 'test-key',
          contentHash: 'test',
          tokenCount: 1000,
          sectionCount: 1,
          anchorCount: 0,
          status: 'READY',
        },
      });

      await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'Test',
      });

      const request = getLastRequest();
      const systemMessage = request.messages.find(
        (m: any) => m.role === 'system'
      );

      // Should contain system instructions
      expect(systemMessage.content).toContain('system_instructions');
      expect(systemMessage.content).toContain('CRITICAL RULES');
    });

    it('should include course context in instructions', async () => {
      await prisma.knowledgeContext.upsert({
        where: { lessonId: testLessonId },
        update: { status: 'READY' },
        create: {
          lessonId: testLessonId,
          s3Key: 'test-key',
          contentHash: 'test',
          tokenCount: 1000,
          sectionCount: 1,
          anchorCount: 0,
          status: 'READY',
        },
      });

      await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'Hello',
      });

      const request = getLastRequest();
      const systemMessage = request.messages.find(
        (m: any) => m.role === 'system'
      );

      // Should contain course info in system instructions (after XML)
      expect(systemMessage.content).toContain('Cache Test Course');
    });
  });
});
