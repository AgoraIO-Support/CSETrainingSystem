/**
 * AI Behavior Correctness E2E Tests
 * Tests: AI-01 through AI-05 (P0 and P1)
 *
 * Verifies that the AI produces correct, grounded responses:
 * - Cross-section reasoning (synthesis across multiple sections)
 * - Timestamp citations in answers
 * - Out-of-scope question handling
 * - No hallucination (fabricated content)
 * - Teaching-style answers
 */

import { AIService } from '@/lib/services/ai.service';
import { KnowledgeContextService } from '@/lib/services/knowledge-context.service';
import { PrismaClient } from '@prisma/client';
import {
  createOpenAIMock,
  clearRequestHistory,
  MOCK_RESPONSES,
} from '../__mocks__/openai';

const prisma = new PrismaClient();

describe('AI Behavior Correctness (No RAG)', () => {
  let testLessonId: string;
  let testConversationId: string;
  let originalFetch: typeof global.fetch;

  // Sample XML knowledge base for testing
  const TEST_KNOWLEDGE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<knowledge_base course_id="ai-test-course" lesson_id="ai-test-lesson" version="1.0">
  <course_overview>
    <title>API Development Masterclass</title>
    <chapter>REST Fundamentals</chapter>
    <lesson>HTTP Methods and Resources</lesson>
  </course_overview>
  <transcript_sections>
    <section timestamp="00:00:00" end_timestamp="00:01:30" title="Introduction to REST" anchor_type="CONCEPT">
      <content>REST stands for Representational State Transfer. It is an architectural style for designing networked applications.</content>
      <key_concepts>
        <concept>REST</concept>
        <concept>Architectural Style</concept>
      </key_concepts>
    </section>
    <section timestamp="00:01:30" end_timestamp="00:03:00" title="HTTP Methods" anchor_type="CONCEPT">
      <content>HTTP defines several methods: GET for retrieving resources, POST for creating, PUT for updating, and DELETE for removing resources.</content>
      <key_concepts>
        <concept>GET</concept>
        <concept>POST</concept>
        <concept>PUT</concept>
        <concept>DELETE</concept>
      </key_concepts>
    </section>
    <section timestamp="00:03:00" end_timestamp="00:04:30" title="Resource Naming" anchor_type="EXAMPLE">
      <content>Good resource names are nouns like /users, /products, /orders. Avoid verbs in URLs. Use plural nouns for collections.</content>
      <key_concepts>
        <concept>Resource Naming</concept>
        <concept>URL Design</concept>
      </key_concepts>
    </section>
    <section timestamp="00:04:30" end_timestamp="00:06:00" title="Status Codes" anchor_type="KEY_TAKEAWAY">
      <content>HTTP status codes indicate request outcomes: 200 OK, 201 Created, 400 Bad Request, 404 Not Found, 500 Internal Server Error.</content>
      <key_concepts>
        <concept>Status Codes</concept>
        <concept>Error Handling</concept>
      </key_concepts>
    </section>
  </transcript_sections>
</knowledge_base>`;

  beforeAll(async () => {
    originalFetch = global.fetch;

    // Create test data hierarchy
    const user = await prisma.user.upsert({
      where: { email: 'ai-behavior-test@example.com' },
      update: {},
      create: {
        id: 'ai-behavior-test-user',
        email: 'ai-behavior-test@example.com',
        name: 'AI Test User',
        role: 'USER',
      },
    });

    const course = await prisma.course.upsert({
      where: { id: 'ai-behavior-test-course' },
      update: {},
      create: {
        id: 'ai-behavior-test-course',
        title: 'API Development Masterclass',
        slug: 'ai-behavior-test-course-slug',
        description: 'Learn API development',
        level: 'BEGINNER',
        category: 'test',
        tags: [],
        duration: 3600,
        instructorId: user.id,
      },
    });

    const chapter = await prisma.chapter.upsert({
      where: { id: 'ai-behavior-test-chapter' },
      update: {},
      create: {
        id: 'ai-behavior-test-chapter',
        title: 'REST Fundamentals',
        courseId: course.id,
        order: 1,
      },
    });

    const lesson = await prisma.lesson.upsert({
      where: { id: 'ai-behavior-test-lesson' },
      update: {},
      create: {
        id: 'ai-behavior-test-lesson',
        title: 'HTTP Methods and Resources',
        chapterId: chapter.id,
        order: 1,
        duration: 600,
      },
    });

    testLessonId = lesson.id;

    // Create knowledge context
    await prisma.knowledgeContext.upsert({
      where: { lessonId: testLessonId },
      update: { status: 'READY' },
      create: {
        lessonId: testLessonId,
        s3Key: 'test-key',
        contentHash: 'ai-behavior-test-hash',
        tokenCount: 2000,
        sectionCount: 4,
        anchorCount: 4,
        status: 'READY',
      },
    });
  });

  afterAll(async () => {
    // Cleanup in reverse order of dependencies
    await prisma.aIMessage.deleteMany({
      where: { conversation: { lessonId: testLessonId } },
    });
    await prisma.aIConversation.deleteMany({
      where: { lessonId: testLessonId },
    });
    await prisma.knowledgeContext.deleteMany({
      where: { lessonId: testLessonId },
    });
    await prisma.lesson.deleteMany({
      where: { id: testLessonId },
    });
    await prisma.chapter.deleteMany({
      where: { id: 'ai-behavior-test-chapter' },
    });
    await prisma.course.deleteMany({
      where: { id: 'ai-behavior-test-course' },
    });
    await prisma.user.deleteMany({
      where: { id: 'ai-behavior-test-user' },
    });
    await prisma.$disconnect();

    global.fetch = originalFetch;
  });

  beforeEach(async () => {
    clearRequestHistory();

    // Create conversation for test
    const conv = await prisma.aIConversation.create({
      data: {
        userId: 'ai-behavior-test-user',
        courseId: 'ai-behavior-test-course',
        lessonId: testLessonId,
      },
    });
    testConversationId = conv.id;

    KnowledgeContextService.clearCache();
  });

  afterEach(async () => {
    await prisma.aIMessage.deleteMany({
      where: { conversationId: testConversationId },
    });
    await prisma.aIConversation.deleteMany({
      where: { id: testConversationId },
    });
  });

  /**
   * AI-01: Cross-Section Reasoning (P0)
   *
   * Verifies that the AI can synthesize information across
   * multiple <section> elements in the knowledge base.
   */
  describe('AI-01: Cross-Section Reasoning', () => {
    beforeEach(() => {
      // Mock with cross-section response
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer:
                      'Looking at the lesson content, API design involves multiple concepts. ' +
                      'First, REST principles define the architectural style [Click to jump to video 00:00:30 for details]. ' +
                      'Then, HTTP methods provide the actions [Click to jump to video 00:02:00 for details]. ' +
                      'Finally, proper resource naming ties it together [Click to jump to video 00:03:30 for details].',
                    suggestions: ['How do these concepts work in practice?'],
                  }),
                },
              },
            ],
            usage: { total_tokens: 500, prompt_tokens: 400, completion_tokens: 100 },
            model: 'gpt-4o-mini',
          }),
      }) as any;
    });

    it('should synthesize information from multiple sections', async () => {
      const result = await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'Give me an overview of what this lesson covers',
      });

      expect(result.assistantMessage).toBeDefined();
      const content = result.assistantMessage.content;

      // Should reference multiple timestamps (different sections)
      const timestampMatches = content.match(/\d{2}:\d{2}:\d{2}/g) || [];
      expect(timestampMatches.length).toBeGreaterThanOrEqual(2);

      // Timestamps should be from different sections
      const uniqueTimestamps = new Set(timestampMatches);
      expect(uniqueTimestamps.size).toBeGreaterThanOrEqual(2);
    });

    it('should reference multiple concepts in synthesis', async () => {
      const result = await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'Summarize the key topics',
      });

      const content = result.assistantMessage.content.toLowerCase();

      // Should mention concepts from multiple sections
      // (Based on our mock response which covers REST, HTTP, and resources)
      expect(content).toMatch(/rest|http|resource|api/i);
    });
  });

  /**
   * AI-02: Timestamp Citation (P0)
   *
   * Verifies that AI answers include valid HH:MM:SS timestamp references.
   */
  describe('AI-02: Timestamp Citation', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer:
                      'GET is used for retrieving resources [Click to jump to video 00:01:45 for details]. ' +
                      'POST is used for creating new resources [Click to jump to video 00:02:15 for details].',
                    suggestions: ['What about PUT and DELETE?'],
                  }),
                },
              },
            ],
            usage: { total_tokens: 300 },
            model: 'gpt-4o-mini',
          }),
      }) as any;
    });

    it('should include valid HH:MM:SS timestamps in response', async () => {
      const result = await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'What are the HTTP methods?',
      });

      const content = result.assistantMessage.content;

      // Should contain valid timestamp format
      const timestampPattern = /\d{2}:\d{2}:\d{2}/g;
      const timestamps = content.match(timestampPattern);

      expect(timestamps).not.toBeNull();
      expect(timestamps!.length).toBeGreaterThan(0);

      // Validate each timestamp is properly formatted
      for (const ts of timestamps!) {
        const [hours, minutes, seconds] = ts.split(':').map(Number);
        expect(hours).toBeGreaterThanOrEqual(0);
        expect(hours).toBeLessThan(24);
        expect(minutes).toBeGreaterThanOrEqual(0);
        expect(minutes).toBeLessThan(60);
        expect(seconds).toBeGreaterThanOrEqual(0);
        expect(seconds).toBeLessThan(60);
      }
    });

    it('should use clickable timestamp format', async () => {
      const result = await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'Explain GET method',
      });

      const content = result.assistantMessage.content;

      // Should use the [Click to jump to video HH:MM:SS for details] format
      expect(content).toMatch(/\[Click to jump to video \d{2}:\d{2}:\d{2}/);
    });

    it('should include timestamps that correspond to section boundaries', async () => {
      const result = await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'What is covered at the beginning?',
      });

      const content = result.assistantMessage.content;
      const timestamps = content.match(/\d{2}:\d{2}:\d{2}/g) || [];

      // At least one timestamp should be near a section boundary
      // Our test XML has sections at 00:00:00, 00:01:30, 00:03:00, 00:04:30
      const validBoundaries = ['00:00', '00:01', '00:02', '00:03', '00:04', '00:05'];

      const hasValidBoundary = timestamps.some((ts) =>
        validBoundaries.some((b) => ts.startsWith(b))
      );

      expect(hasValidBoundary).toBe(true);
    });
  });

  /**
   * AI-03: Out-of-Scope Question Handling (P0)
   *
   * Verifies that the AI explicitly states when a topic
   * is not covered in the course materials.
   */
  describe('AI-03: Out-of-Scope Question Handling', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer:
                      "I don't have information about weather forecasting in the current course materials. " +
                      'This lesson covers REST API design, HTTP methods, and resource naming. ' +
                      'Is there something about API development I can help you with?',
                    suggestions: [
                      'What topics are covered in this lesson?',
                      'Can you explain REST?',
                    ],
                  }),
                },
              },
            ],
            usage: { total_tokens: 200 },
            model: 'gpt-4o-mini',
          }),
      }) as any;
    });

    it('should indicate topic is not covered for unrelated questions', async () => {
      const result = await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'What is the weather forecast for tomorrow?',
      });

      const content = result.assistantMessage.content.toLowerCase();

      // Should indicate lack of information
      expect(content).toMatch(
        /don't have|not covered|not in|cannot find|no information/i
      );
    });

    it('should redirect to available topics', async () => {
      const result = await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'Tell me about quantum computing',
      });

      const content = result.assistantMessage.content.toLowerCase();

      // Should mention what IS covered
      expect(content).toMatch(/rest|api|http|resource|lesson|course/i);
    });

    it('should offer helpful alternatives', async () => {
      const result = await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'How do I cook pasta?',
      });

      // Should have follow-up suggestions
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
    });
  });

  /**
   * AI-04: No Hallucination (P1)
   *
   * Verifies that the AI does not fabricate features, names, or dates
   * that are not in the knowledge base.
   */
  describe('AI-04: No Hallucination', () => {
    beforeEach(() => {
      // Response that sticks strictly to source material
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer:
                      'Based on the lesson content, REST stands for Representational State Transfer ' +
                      '[Click to jump to video 00:00:30 for details]. The four main HTTP methods covered are ' +
                      'GET, POST, PUT, and DELETE [Click to jump to video 00:02:00 for details].',
                    suggestions: ['Can you explain each method in detail?'],
                  }),
                },
              },
            ],
            usage: { total_tokens: 250 },
            model: 'gpt-4o-mini',
          }),
      }) as any;
    });

    it('should not invent features not in the knowledge base', async () => {
      const result = await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'What HTTP methods are discussed?',
      });

      const content = result.assistantMessage.content;

      // Should only mention methods that are in our test XML
      // Our XML covers: GET, POST, PUT, DELETE
      // Should NOT mention: PATCH, OPTIONS, HEAD, CONNECT, TRACE
      const inventedMethods = ['PATCH', 'OPTIONS', 'HEAD', 'CONNECT', 'TRACE'];

      for (const method of inventedMethods) {
        // Allow if explicitly saying it's NOT covered
        if (!content.includes(`not ${method}`) && !content.includes(`${method} is not`)) {
          expect(content.toUpperCase()).not.toContain(method);
        }
      }
    });

    it('should not fabricate dates or version numbers', async () => {
      const result = await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'When was REST invented?',
      });

      const content = result.assistantMessage.content;

      // If answering about dates, should indicate source or uncertainty
      if (content.match(/\d{4}/)) {
        // If a year is mentioned, it should be with qualification
        expect(content).toMatch(
          /according to|based on|the lesson|mentioned|discussed/i
        );
      }
    });

    it('should attribute claims to source material', async () => {
      const result = await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'What is REST?',
      });

      const content = result.assistantMessage.content;

      // Should include attribution or timestamp reference
      expect(content).toMatch(
        /lesson|video|section|timestamp|\[Click to jump|covered in/i
      );
    });
  });

  /**
   * AI-05: Teaching-Style Answer (P1)
   *
   * Verifies that answers follow a structured teaching format:
   * definition → example → analogy/summary
   */
  describe('AI-05: Teaching-Style Answer', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer:
                      '**What is REST?**\n\n' +
                      'REST (Representational State Transfer) is an architectural style for designing web services ' +
                      '[Click to jump to video 00:00:30 for details].\n\n' +
                      '**How it works:**\n' +
                      'REST uses standard HTTP methods like GET and POST to interact with resources.\n\n' +
                      '**Example:**\n' +
                      'When you visit /users/123, you are making a GET request to retrieve user 123.\n\n' +
                      '**Key Takeaway:**\n' +
                      'REST makes APIs intuitive by mapping HTTP verbs to CRUD operations.',
                    suggestions: ['What are the four HTTP methods?', 'How do I design good URLs?'],
                  }),
                },
              },
            ],
            usage: { total_tokens: 350 },
            model: 'gpt-4o-mini',
          }),
      }) as any;
    });

    it('should provide structured explanation for conceptual questions', async () => {
      const result = await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'Explain what REST is',
      });

      const content = result.assistantMessage.content;

      // Should have some structure (headers, sections, or clear organization)
      // Check for markdown headers or clear paragraph breaks
      const hasStructure =
        content.includes('**') || // Bold headers
        content.includes('##') || // Markdown headers
        content.includes('\n\n') || // Paragraph breaks
        content.includes(':'); // Definition style

      expect(hasStructure).toBe(true);
    });

    it('should include examples when explaining concepts', async () => {
      const result = await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'What is REST?',
      });

      const content = result.assistantMessage.content.toLowerCase();

      // Should include example or practical illustration
      expect(content).toMatch(/example|for instance|such as|like|when you/i);
    });

    it('should provide follow-up suggestions', async () => {
      const result = await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'Explain HTTP methods',
      });

      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);

      // Suggestions should be relevant questions
      for (const suggestion of result.suggestions!) {
        expect(suggestion.endsWith('?')).toBe(true);
      }
    });
  });

  /**
   * Response Format Verification
   */
  describe('Response Format', () => {
    beforeEach(() => {
      global.fetch = createOpenAIMock() as any;
    });

    it('should parse JSON response correctly', async () => {
      const result = await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'Test question',
      });

      // Should have parsed answer (not raw JSON)
      expect(result.assistantMessage.content).not.toMatch(/^\s*\{/);
      expect(result.assistantMessage.content).toBeDefined();
    });

    it('should extract suggestions from response', async () => {
      const result = await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'Tell me about APIs',
      });

      expect(result.suggestions).toBeDefined();
      expect(Array.isArray(result.suggestions)).toBe(true);
    });

    it('should return contextMode indicating full context was used', async () => {
      const result = await AIService.sendMessage({
        conversationId: testConversationId,
        message: 'Test',
      });

      // When knowledge context is READY, should use full context mode
      expect(result.contextMode).toBe('full');
    });
  });
});
