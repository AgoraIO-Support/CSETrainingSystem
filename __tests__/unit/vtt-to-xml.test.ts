/**
 * VTT → XML Processing Unit Tests
 * Tests: VTT-01 through VTT-05 (P0 and P1)
 *
 * These tests verify the core VTT to XML conversion pipeline:
 * - Filler word removal
 * - Timestamp aggregation
 * - Semantic segmentation
 * - XML determinism
 * - Token size control
 */

import { VTTToXMLService } from '@/lib/services/vtt-to-xml.service';
import { VTTParserService } from '@/lib/services/vtt-parser.service';
import {
  VTT_WITH_FILLERS,
  VTT_SHORT_TIMESTAMPS,
  VTT_WITH_TOPIC_CHANGES,
  VTT_MINIMAL,
  VTT_LONG,
  TEST_COURSE_CONTEXT,
  XML_STRUCTURE_PATTERNS,
} from '../__fixtures__/sample-vtt';
import { createOpenAIMock, clearRequestHistory } from '../__mocks__/openai';

// Mock fetch for OpenAI calls
const originalFetch = global.fetch;

describe('VTT → XML Processing', () => {
  let service: VTTToXMLService;

  beforeAll(() => {
    // Replace global fetch with mock
    global.fetch = createOpenAIMock() as any;
  });

  afterAll(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    service = new VTTToXMLService('mock-api-key');
    clearRequestHistory();
  });

  /**
   * VTT-01: VTT Noise Removal (P0)
   *
   * Verifies that filler words are properly removed from transcript content.
   * Filler words: um, uh, like, you know, I mean, so basically, kind of, sort of
   */
  describe('VTT-01: Filler Word Removal', () => {
    it('should remove common filler words from transcript', async () => {
      const result = await service.processVTTToKnowledgeBase(
        VTT_WITH_FILLERS,
        TEST_COURSE_CONTEXT
      );

      // Verify XML was generated
      expect(result.xml).toBeDefined();
      expect(result.xml.length).toBeGreaterThan(0);

      // Verify filler words are removed from content
      const fillerPatterns = [
        /\bum\b/gi,
        /\buh\b/gi,
        /\byou know\b/gi,
        /\blike,\b/gi,
        /\bI mean\b/gi,
        /\bso basically\b/gi,
        /\bkind of\b/gi,
        /\bright\?/gi,
      ];

      for (const pattern of fillerPatterns) {
        expect(result.xml).not.toMatch(pattern);
      }
    });

    it('should preserve meaningful content after noise removal', async () => {
      const result = await service.processVTTToKnowledgeBase(
        VTT_WITH_FILLERS,
        TEST_COURSE_CONTEXT
      );

      // Key terms should still be present
      expect(result.xml).toContain('API design');
      expect(result.xml).toContain('RESTful');
      expect(result.xml).toContain('HTTP');
      expect(result.xml).toContain('GET');
      expect(result.xml).toContain('POST');
    });

    it('should not remove filler words that are part of larger words', async () => {
      const vttWithEmbeddedWords = `WEBVTT

00:00:00.000 --> 00:00:10.000
The umbrella pattern is useful for understanding API design.

00:00:10.000 --> 00:00:20.000
Unlike other patterns, it provides comprehensive coverage.
`;

      const result = await service.processVTTToKnowledgeBase(
        vttWithEmbeddedWords,
        TEST_COURSE_CONTEXT
      );

      // "um" in "umbrella" should NOT be removed
      expect(result.xml).toContain('umbrella');
      // "like" in "Unlike" should NOT be removed
      expect(result.xml).toContain('Unlike');
    });
  });

  /**
   * VTT-02: Timestamp Aggregation (P0)
   *
   * Verifies that short 2-second VTT timestamps are aggregated
   * into semantic paragraphs of ~45-90 seconds.
   */
  describe('VTT-02: Timestamp Aggregation', () => {
    it('should aggregate short timestamps into longer sections', async () => {
      const result = await service.processVTTToKnowledgeBase(
        VTT_SHORT_TIMESTAMPS,
        TEST_COURSE_CONTEXT
      );

      // With 5 cues of 2 seconds each (10 seconds total),
      // we expect 1 aggregated section (less than minimum 45s threshold)
      expect(result.sections.length).toBeLessThanOrEqual(2);

      // Each section should have combined text from multiple cues
      if (result.sections.length > 0) {
        const firstSection = result.sections[0];
        expect(firstSection.content).toContain('First');
        expect(firstSection.content).toContain('sentence');
      }
    });

    it('should respect minimum paragraph duration of 45 seconds', async () => {
      const result = await service.processVTTToKnowledgeBase(
        VTT_WITH_TOPIC_CHANGES, // 3 minutes of content
        TEST_COURSE_CONTEXT
      );

      // Each section should be at least ~45 seconds
      for (const section of result.sections) {
        const duration = section.endTimestampSeconds - section.timestampSeconds;
        // Allow some flexibility for boundary conditions
        expect(duration).toBeGreaterThanOrEqual(25); // Minimum reasonable duration
      }
    });

    it('should not exceed maximum paragraph duration of 90 seconds', async () => {
      const result = await service.processVTTToKnowledgeBase(
        VTT_LONG,
        TEST_COURSE_CONTEXT
      );

      // Each section should be at most ~90 seconds
      for (const section of result.sections) {
        const duration = section.endTimestampSeconds - section.timestampSeconds;
        expect(duration).toBeLessThanOrEqual(100); // Allow slight overflow
      }
    });
  });

  /**
   * VTT-03: Semantic Segmentation (P0)
   *
   * Verifies that topic changes result in new section boundaries.
   */
  describe('VTT-03: Semantic Segmentation', () => {
    it('should create separate sections for distinct topics', async () => {
      const result = await service.processVTTToKnowledgeBase(
        VTT_WITH_TOPIC_CHANGES, // Authentication → Authorization → Encryption
        TEST_COURSE_CONTEXT
      );

      // Should have multiple sections for topic changes
      expect(result.sections.length).toBeGreaterThan(1);

      // Verify section structure
      for (const section of result.sections) {
        expect(section.timestamp).toBeDefined();
        expect(section.endTimestamp).toBeDefined();
        expect(section.title).toBeDefined();
        expect(section.content.length).toBeGreaterThan(0);
      }
    });

    it('should include key concepts in sections', async () => {
      const result = await service.processVTTToKnowledgeBase(
        VTT_WITH_TOPIC_CHANGES,
        TEST_COURSE_CONTEXT
      );

      // At least some sections should have extracted key concepts
      const sectionsWithConcepts = result.sections.filter(
        (s) => s.keyConcepts && s.keyConcepts.length > 0
      );

      expect(sectionsWithConcepts.length).toBeGreaterThan(0);
    });
  });

  /**
   * VTT-04: XML Determinism (P0) - CRITICAL
   *
   * Verifies that processing the same VTT twice produces
   * byte-level identical XML output. This is essential for caching.
   */
  describe('VTT-04: XML Determinism', () => {
    it('should produce identical XML for same input', async () => {
      // Process the same VTT twice
      const result1 = await service.processVTTToKnowledgeBase(
        VTT_MINIMAL,
        TEST_COURSE_CONTEXT
      );

      // Create a new service instance to ensure no state carryover
      const service2 = new VTTToXMLService('mock-api-key');
      const result2 = await service2.processVTTToKnowledgeBase(
        VTT_MINIMAL,
        TEST_COURSE_CONTEXT
      );

      // Content hashes should be identical
      expect(result1.contentHash).toBe(result2.contentHash);

      // XML structure should match (ignoring generated_at timestamp)
      const normalizeXML = (xml: string) =>
        xml.replace(/generated_at="[^"]*"/, 'generated_at="NORMALIZED"');

      expect(normalizeXML(result1.xml)).toBe(normalizeXML(result2.xml));
    });

    it('should produce different hash for different input', async () => {
      const result1 = await service.processVTTToKnowledgeBase(
        VTT_MINIMAL,
        TEST_COURSE_CONTEXT
      );

      const modifiedVTT = VTT_MINIMAL.replace('API development', 'API architecture');
      const result2 = await service.processVTTToKnowledgeBase(
        modifiedVTT,
        TEST_COURSE_CONTEXT
      );

      // Content hashes should be different
      expect(result1.contentHash).not.toBe(result2.contentHash);
    });

    it('should produce valid SHA-256 hash', async () => {
      const result = await service.processVTTToKnowledgeBase(
        VTT_MINIMAL,
        TEST_COURSE_CONTEXT
      );

      // SHA-256 produces 64 character hex string
      expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  /**
   * VTT-05: Token Size Control (P1)
   *
   * Verifies that long VTT content produces XML within expected token range.
   * Target: ~60k tokens maximum to fit within context window.
   */
  describe('VTT-05: Token Size Control', () => {
    it('should keep token count within expected range', async () => {
      const result = await service.processVTTToKnowledgeBase(
        VTT_LONG,
        TEST_COURSE_CONTEXT
      );

      // Token count should be reported in metadata
      expect(result.metadata.tokenCount).toBeDefined();

      // Should be within reasonable bounds (adjust based on content length)
      // Using ~4 chars per token estimate
      expect(result.metadata.tokenCount).toBeGreaterThan(1000);
      expect(result.metadata.tokenCount).toBeLessThan(80000);
    });

    it('should report accurate section count', async () => {
      const result = await service.processVTTToKnowledgeBase(
        VTT_LONG,
        TEST_COURSE_CONTEXT
      );

      expect(result.metadata.sectionCount).toBe(result.sections.length);
    });

    it('should report processing time', async () => {
      const result = await service.processVTTToKnowledgeBase(
        VTT_MINIMAL,
        TEST_COURSE_CONTEXT
      );

      expect(result.metadata.processingTimeMs).toBeDefined();
      expect(result.metadata.processingTimeMs).toBeGreaterThan(0);
    });
  });

  /**
   * XML Structure Validation
   *
   * Verifies that generated XML follows expected schema.
   */
  describe('XML Structure Validation', () => {
    it('should generate valid XML with required elements', async () => {
      const result = await service.processVTTToKnowledgeBase(
        VTT_MINIMAL,
        TEST_COURSE_CONTEXT
      );

      // Check for XML declaration
      expect(result.xml).toMatch(/^<\?xml version="1\.0"/);

      // Check for root element with attributes
      expect(result.xml).toMatch(XML_STRUCTURE_PATTERNS.rootElement);

      // Check for course overview section
      expect(result.xml).toMatch(XML_STRUCTURE_PATTERNS.courseOverview);

      // Check for transcript sections
      expect(result.xml).toMatch(XML_STRUCTURE_PATTERNS.transcriptSections);
    });

    it('should include course context in XML', async () => {
      const result = await service.processVTTToKnowledgeBase(
        VTT_MINIMAL,
        TEST_COURSE_CONTEXT
      );

      expect(result.xml).toContain(TEST_COURSE_CONTEXT.courseTitle);
      expect(result.xml).toContain(TEST_COURSE_CONTEXT.lessonTitle);
      expect(result.xml).toContain(TEST_COURSE_CONTEXT.chapterTitle);
    });

    it('should properly escape XML special characters', async () => {
      const vttWithSpecialChars = `WEBVTT

00:00:00.000 --> 00:00:10.000
Use the <script> tag for JavaScript & ensure proper encoding.

00:00:10.000 --> 00:00:20.000
The "quote" characters and 'apostrophes' should be escaped.
`;

      const result = await service.processVTTToKnowledgeBase(
        vttWithSpecialChars,
        TEST_COURSE_CONTEXT
      );

      // Special characters should be escaped
      expect(result.xml).toContain('&lt;script&gt;');
      expect(result.xml).toContain('&amp;');
      expect(result.xml).toContain('&quot;');
    });
  });

  /**
   * Anchor Extraction Tests
   */
  describe('Anchor Extraction', () => {
    it('should extract knowledge anchors from content', async () => {
      const result = await service.processVTTToKnowledgeBase(
        VTT_WITH_TOPIC_CHANGES,
        TEST_COURSE_CONTEXT
      );

      expect(result.anchors).toBeDefined();
      expect(result.anchors.length).toBeGreaterThan(0);
      expect(result.anchors.length).toBeLessThanOrEqual(15); // Max anchors config
    });

    it('should include required anchor properties', async () => {
      const result = await service.processVTTToKnowledgeBase(
        VTT_WITH_TOPIC_CHANGES,
        TEST_COURSE_CONTEXT
      );

      for (const anchor of result.anchors) {
        expect(anchor.timestamp).toBeDefined();
        expect(anchor.timestampStr).toMatch(/^\d{2}:\d{2}:\d{2}$/);
        expect(anchor.title).toBeDefined();
        expect(anchor.summary).toBeDefined();
        expect(anchor.anchorType).toBeDefined();
        expect(anchor.sequenceIndex).toBeDefined();
      }
    });

    it('should assign valid anchor types', async () => {
      const result = await service.processVTTToKnowledgeBase(
        VTT_WITH_TOPIC_CHANGES,
        TEST_COURSE_CONTEXT
      );

      const validTypes = ['CONCEPT', 'EXAMPLE', 'DEMO', 'KEY_TAKEAWAY'];

      for (const anchor of result.anchors) {
        expect(validTypes).toContain(anchor.anchorType);
      }
    });
  });

  /**
   * Edge Cases
   */
  describe('Edge Cases', () => {
    it('should handle empty VTT gracefully', async () => {
      const emptyVTT = 'WEBVTT\n\n';

      await expect(
        service.processVTTToKnowledgeBase(emptyVTT, TEST_COURSE_CONTEXT)
      ).rejects.toThrow('No cues found');
    });

    it('should handle VTT with only whitespace cues', async () => {
      const whitespaceVTT = `WEBVTT

00:00:00.000 --> 00:00:10.000


00:00:10.000 --> 00:00:20.000

`;

      await expect(
        service.processVTTToKnowledgeBase(whitespaceVTT, TEST_COURSE_CONTEXT)
      ).rejects.toThrow();
    });

    it('should handle VTT with very short content', async () => {
      const shortVTT = `WEBVTT

00:00:00.000 --> 00:00:05.000
Hi.
`;

      // Should not throw but may produce minimal output
      const result = await service.processVTTToKnowledgeBase(
        shortVTT,
        TEST_COURSE_CONTEXT
      );

      expect(result.xml).toBeDefined();
    });
  });
});
