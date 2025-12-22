/**
 * VTT to XML Service
 * Converts VTT transcripts to structured XML knowledge bases for full context injection
 * Replaces the chunking + embedding RAG pipeline with deterministic XML generation
 */

import { VTTParserService, VTTCue } from './vtt-parser.service';
import { createHash } from 'crypto';
import { KnowledgeAnchorType } from '@prisma/client';

// Filler word patterns for moderate denoising
const FILLER_PATTERNS = [
  /\b(um|uh|er|ah)\b/gi,
  /\b(you know|like|I mean|so basically|kind of|sort of)\b/gi,
  /\b(right\?|okay\?|yeah\?)\s*$/gi, // Trailing confirmations
];

export interface VTTToXMLConfig {
  // Paragraph aggregation
  minParagraphDuration: number; // Default: 45 seconds
  maxParagraphDuration: number; // Default: 90 seconds
  targetParagraphTokens: number; // Default: 500 tokens

  // Anchor extraction
  maxAnchorsPerLesson: number; // Default: 15
}

const DEFAULT_CONFIG: VTTToXMLConfig = {
  minParagraphDuration: 45,
  maxParagraphDuration: 90,
  targetParagraphTokens: 500,
  maxAnchorsPerLesson: 15,
};

export interface AggregatedParagraph {
  startTime: number;
  endTime: number;
  text: string;
  tokenCount: number;
}

export interface EnrichedSection {
  timestamp: string; // "HH:MM:SS"
  timestampSeconds: number;
  endTimestamp: string;
  endTimestampSeconds: number;
  title: string;
  content: string;
  keyConcepts: string[];
  isAnchor: boolean;
  anchorType?: KnowledgeAnchorType;
  anchorSummary?: string;
}

export interface KnowledgeAnchorData {
  timestamp: number;
  timestampStr: string;
  title: string;
  summary: string;
  keyTerms: string[];
  anchorType: KnowledgeAnchorType;
  sequenceIndex: number;
}

export interface XMLGenerationResult {
  xml: string;
  contentHash: string;
  sections: EnrichedSection[];
  anchors: KnowledgeAnchorData[];
  metadata: {
    tokenCount: number;
    sectionCount: number;
    anchorCount: number;
    processingTimeMs: number;
  };
}

export interface CourseContext {
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  chapterTitle: string;
  lessonDescription?: string;
}

export class VTTToXMLService {
  private openaiApiKey: string;

  constructor(openaiApiKey?: string) {
    this.openaiApiKey = openaiApiKey || process.env.OPENAI_API_KEY || '';
  }

  /**
   * Main entry point: Convert VTT content to structured XML
   */
  async processVTTToKnowledgeBase(
    vttContent: string,
    context: CourseContext,
    config: Partial<VTTToXMLConfig> = {}
  ): Promise<XMLGenerationResult> {
    const startTime = Date.now();
    const cfg = { ...DEFAULT_CONFIG, ...config };

    // Step 1: Parse VTT
    const { cues } = VTTParserService.parse(vttContent);

    if (cues.length === 0) {
      throw new Error('No cues found in VTT content');
    }

    // Step 2: Denoise and aggregate into paragraphs
    const paragraphs = this.denoiseAndAggregate(cues, cfg);
    if (paragraphs.length === 0) {
      // No meaningful content after denoising (e.g., whitespace-only cues).
      throw new Error('No usable transcript content found');
    }

    // Step 3: Enrich with AI-generated titles and concepts
    const sections = await this.enrichWithAI(paragraphs, context);

    // Step 4: Extract knowledge anchors
    const anchors = this.extractAnchors(sections, cfg.maxAnchorsPerLesson);

    // Step 5: Generate deterministic XML
    const xml = this.generateXML(sections, context);

    // Calculate hash for idempotency
    const contentHash = this.calculateHash(xml);

    // Estimate token count (~4 chars per token)
    const tokenCount = Math.ceil(xml.length / 4);

    return {
      xml,
      contentHash,
      sections,
      anchors,
      metadata: {
        tokenCount,
        sectionCount: sections.length,
        anchorCount: anchors.length,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Step 1: Parse, denoise, and aggregate VTT cues into semantic paragraphs
   */
  private denoiseAndAggregate(
    cues: VTTCue[],
    config: VTTToXMLConfig
  ): AggregatedParagraph[] {
    const paragraphs: AggregatedParagraph[] = [];

    let currentParagraph: AggregatedParagraph = {
      startTime: cues[0].startTime,
      endTime: cues[0].endTime,
      text: '',
      tokenCount: 0,
    };

    for (const cue of cues) {
      // Denoise the cue text
      const cleanedText = this.denoiseText(cue.text);
      if (!cleanedText.trim()) continue;

      const tokenCount = this.estimateTokens(cleanedText);
      const paragraphDuration = cue.endTime - currentParagraph.startTime;

      // Check if we should start a new paragraph
      const shouldSplit =
        paragraphDuration >= config.maxParagraphDuration ||
        (paragraphDuration >= config.minParagraphDuration &&
          currentParagraph.tokenCount + tokenCount > config.targetParagraphTokens);

      if (shouldSplit && currentParagraph.text.trim()) {
        paragraphs.push({ ...currentParagraph });
        currentParagraph = {
          startTime: cue.startTime,
          endTime: cue.endTime,
          text: cleanedText,
          tokenCount,
        };
      } else {
        currentParagraph.endTime = cue.endTime;
        currentParagraph.text += (currentParagraph.text ? ' ' : '') + cleanedText;
        currentParagraph.tokenCount += tokenCount;
      }
    }

    // Add final paragraph
    if (currentParagraph.text.trim()) {
      paragraphs.push(currentParagraph);
    }

    return paragraphs;
  }

  /**
   * Remove filler words and clean up text
   */
  private denoiseText(text: string): string {
    let cleaned = text;

    for (const pattern of FILLER_PATTERNS) {
      cleaned = cleaned.replace(pattern, '');
    }

    // Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  /**
   * Estimate token count (~4 characters per token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Step 2: Use GPT-4o-mini to generate section titles and extract concepts
   */
  private async enrichWithAI(
    paragraphs: AggregatedParagraph[],
    context: CourseContext
  ): Promise<EnrichedSection[]> {
    if (!this.openaiApiKey) {
      // Fallback: generate titles without AI
      return this.enrichWithoutAI(paragraphs);
    }

    // Batch paragraphs into groups of 10 for efficient API calls
    const batchSize = 10;
    const enrichedSections: EnrichedSection[] = [];

    for (let i = 0; i < paragraphs.length; i += batchSize) {
      const batch = paragraphs.slice(i, i + batchSize);
      const batchResults = await this.enrichBatchWithAI(batch, context, i);
      enrichedSections.push(...batchResults);
    }

    return enrichedSections;
  }

  /**
   * Enrich a batch of paragraphs with AI
   */
  private async enrichBatchWithAI(
    paragraphs: AggregatedParagraph[],
    context: CourseContext,
    startIndex: number
  ): Promise<EnrichedSection[]> {
    const prompt = this.buildEnrichmentPrompt(paragraphs, context);

    try {
      const controller = new AbortController();
      const timeoutMs = parseInt(process.env.VTT_TO_XML_ENRICH_TIMEOUT_MS || '20000', 10);
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are an educational content analyzer. Generate concise section titles and extract key concepts from transcript segments. Respond ONLY with valid JSON.`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!response.ok) {
        console.error('[VTTToXML] OpenAI API error:', response.status);
        return this.enrichWithoutAI(paragraphs);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      // Parse JSON response
      const parsed = this.parseAIResponse(content);

      return paragraphs.map((para, idx) => {
        const aiResult = parsed[idx] || {};
        const timestamp = VTTParserService.formatTimestamp(para.startTime, true);
        const endTimestamp = VTTParserService.formatTimestamp(para.endTime, true);

        return {
          timestamp,
          timestampSeconds: para.startTime,
          endTimestamp,
          endTimestampSeconds: para.endTime,
          title: aiResult.title || `Section ${startIndex + idx + 1}`,
          content: para.text,
          keyConcepts: aiResult.concepts || [],
          isAnchor: aiResult.isKeyMoment || false,
          anchorType: aiResult.anchorType
            ? this.mapAnchorType(aiResult.anchorType)
            : undefined,
          anchorSummary: aiResult.summary,
        };
      });
    } catch (error) {
      console.error('[VTTToXML] AI enrichment error:', error);
      return this.enrichWithoutAI(paragraphs);
    }
  }

  /**
   * Build prompt for AI enrichment
   */
  private buildEnrichmentPrompt(
    paragraphs: AggregatedParagraph[],
    context: CourseContext
  ): string {
    const sections = paragraphs.map((p, i) => ({
      index: i,
      timestamp: VTTParserService.formatTimestamp(p.startTime, true),
      text: p.text.substring(0, 500), // Limit text length for prompt
    }));

    return `Course: ${context.courseTitle}
Chapter: ${context.chapterTitle}
Lesson: ${context.lessonTitle}

Analyze these transcript sections and for each one provide:
1. A concise title (max 6 words)
2. 2-4 key concepts/terms
3. Whether it's a "key moment" (important concept, example, or takeaway)
4. If it's a key moment, the type: CONCEPT, EXAMPLE, DEMO, or KEY_TAKEAWAY
5. If it's a key moment, a 1-sentence summary

Sections:
${JSON.stringify(sections, null, 2)}

Respond with JSON array:
[
  {
    "title": "...",
    "concepts": ["concept1", "concept2"],
    "isKeyMoment": true/false,
    "anchorType": "CONCEPT|EXAMPLE|DEMO|KEY_TAKEAWAY" (only if isKeyMoment),
    "summary": "..." (only if isKeyMoment)
  }
]`;
  }

  /**
   * Parse AI response JSON
   */
  private parseAIResponse(content: string): any[] {
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }
      // Try direct JSON parse
      return JSON.parse(content);
    } catch {
      console.error('[VTTToXML] Failed to parse AI response:', content);
      return [];
    }
  }

  /**
   * Map string anchor type to enum
   */
  private mapAnchorType(type: string): KnowledgeAnchorType {
    const typeMap: Record<string, KnowledgeAnchorType> = {
      CONCEPT: 'CONCEPT',
      EXAMPLE: 'EXAMPLE',
      DEMO: 'DEMO',
      KEY_TAKEAWAY: 'KEY_TAKEAWAY',
    };
    return typeMap[type.toUpperCase()] || 'CONCEPT';
  }

  /**
   * Fallback: generate titles without AI
   */
  private enrichWithoutAI(paragraphs: AggregatedParagraph[]): EnrichedSection[] {
    return paragraphs.map((para, idx) => {
      const timestamp = VTTParserService.formatTimestamp(para.startTime, true);
      const endTimestamp = VTTParserService.formatTimestamp(para.endTime, true);

      // Extract first few words as title
      const words = para.text.split(/\s+/).slice(0, 6);
      const title = words.join(' ') + (words.length >= 6 ? '...' : '');

      return {
        timestamp,
        timestampSeconds: para.startTime,
        endTimestamp,
        endTimestampSeconds: para.endTime,
        title: `Section ${idx + 1}: ${title}`,
        content: para.text,
        keyConcepts: [],
        isAnchor: false,
      };
    });
  }

  /**
   * Step 3: Extract knowledge anchors (high-value moments)
   */
  private extractAnchors(
    sections: EnrichedSection[],
    maxAnchors: number
  ): KnowledgeAnchorData[] {
    // Filter sections marked as anchors
    const anchorSections = sections.filter((s) => s.isAnchor);

    // If no AI-identified anchors, select evenly distributed sections
    if (anchorSections.length === 0) {
      const step = Math.max(1, Math.floor(sections.length / maxAnchors));
      for (let i = 0; i < sections.length && anchorSections.length < maxAnchors; i += step) {
        anchorSections.push(sections[i]);
      }
    }

    // Limit to max anchors
    const finalAnchors = anchorSections.slice(0, maxAnchors);

    return finalAnchors.map((section, idx) => ({
      timestamp: section.timestampSeconds,
      timestampStr: section.timestamp,
      title: section.title,
      summary: section.anchorSummary || section.content.substring(0, 200) + '...',
      keyTerms: section.keyConcepts,
      anchorType: section.anchorType || 'CONCEPT',
      sequenceIndex: idx,
    }));
  }

  /**
   * Step 4: Generate deterministic XML output
   */
  private generateXML(sections: EnrichedSection[], context: CourseContext): string {
    // Build sections XML
    const sectionsXml = sections
      .map((section) => {
        const conceptsXml = section.keyConcepts
          .sort() // Sort for determinism
          .map((c) => `        <concept>${this.escapeXml(c)}</concept>`)
          .join('\n');

        const anchorAttr = section.isAnchor
          ? ` anchor_type="${section.anchorType}"`
          : '';

        return `    <section timestamp="${section.timestamp}" end_timestamp="${section.endTimestamp}" title="${this.escapeXml(section.title)}"${anchorAttr}>
      <content>${this.escapeXml(section.content)}</content>
      <key_concepts>
${conceptsXml}
      </key_concepts>
    </section>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<knowledge_base course_id="${context.courseId}" lesson_id="${context.lessonId}" version="1.0">
  <course_overview>
    <title>${this.escapeXml(context.courseTitle)}</title>
    <chapter>${this.escapeXml(context.chapterTitle)}</chapter>
    <lesson>${this.escapeXml(context.lessonTitle)}</lesson>
${context.lessonDescription ? `    <description>${this.escapeXml(context.lessonDescription)}</description>` : ''}
  </course_overview>
  <transcript_sections>
${sectionsXml}
  </transcript_sections>
</knowledge_base>`;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Calculate SHA-256 hash of content
   */
  private calculateHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
