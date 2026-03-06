/**
 * VTT to XML Service
 * Converts VTT transcripts to structured XML knowledge bases for full context injection
 * Replaces the chunking + embedding RAG pipeline with deterministic XML generation
 */

import { VTTParserService, VTTCue } from './vtt-parser.service';
import { createHash } from 'crypto';
import { AIPromptUseCase, KnowledgeAnchorType } from '@prisma/client';
import { log, timeAsync } from '@/lib/logger';
import { AIPromptResolverService } from './ai-prompt-resolver.service';
import { extractChatCompletionsText, getChatCompletionsTokenBudget } from '@/lib/services/openai-models';

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
  maxAnchorsPerLesson: number; // Default: 25
}

const DEFAULT_CONFIG: VTTToXMLConfig = {
  minParagraphDuration: 45,
  maxParagraphDuration: 90,
  targetParagraphTokens: 500,
  maxAnchorsPerLesson: 25,
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
    /** True if AI enrichment was skipped or failed and fallback was used */
    usedFallbackEnrichment: boolean;
    /** Reason for fallback, if applicable */
    fallbackReason?: string;
  };
}

export interface CourseContext {
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  chapterTitle: string;
  lessonDescription?: string;
  /**
   * Per-run prompt override (UI-selected template) for VTT→XML enrichment.
   * If omitted, the resolver applies Course → Exam → Default fallback rules.
   */
  promptTemplateIdOverride?: string;
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
    const step1Start = Date.now();
    const { cues } = VTTParserService.parse(vttContent);

    if (cues.length === 0) {
      throw new Error('No cues found in VTT content');
    }

    log('KnowledgeContext', 'info', 'VTTToXML Step 1: parsed VTT cues', {
      courseId: context.courseId,
      lessonId: context.lessonId,
      cuesCount: cues.length,
      firstStartSec: cues[0]?.startTime,
      lastEndSec: cues[cues.length - 1]?.endTime,
      vttChars: vttContent.length,
      durationMs: Date.now() - step1Start,
    });

    // Step 2: Denoise and aggregate into paragraphs
    const step2Start = Date.now();
    const paragraphs = this.denoiseAndAggregate(cues, cfg);
    if (paragraphs.length === 0) {
      // No meaningful content after denoising (e.g., whitespace-only cues).
      throw new Error('No usable transcript content found');
    }

    const paragraphTokenTotal = paragraphs.reduce((sum, p) => sum + (p.tokenCount || 0), 0);
    log('KnowledgeContext', 'info', 'VTTToXML Step 2: aggregated paragraphs', {
      courseId: context.courseId,
      lessonId: context.lessonId,
      paragraphsCount: paragraphs.length,
      tokenTotalApprox: paragraphTokenTotal,
      minParagraphDurationSec: cfg.minParagraphDuration,
      maxParagraphDurationSec: cfg.maxParagraphDuration,
      targetParagraphTokens: cfg.targetParagraphTokens,
      firstParagraphStartSec: paragraphs[0]?.startTime,
      firstParagraphEndSec: paragraphs[0]?.endTime,
      durationMs: Date.now() - step2Start,
    });

    // Step 3: Enrich with AI-generated titles and concepts
    const step3Start = Date.now();
    const sections = await this.enrichWithAI(paragraphs, context);

    const anchorsMarked = sections.filter((s) => s.isAnchor).length;
    const conceptsTotal = sections.reduce((sum, s) => sum + (s.keyConcepts?.length || 0), 0);
    log('KnowledgeContext', 'info', 'VTTToXML Step 3: enriched sections', {
      courseId: context.courseId,
      lessonId: context.lessonId,
      openaiEnabled: Boolean(this.openaiApiKey),
      sectionsCount: sections.length,
      anchorsMarkedByAI: anchorsMarked,
      conceptsTotal,
      durationMs: Date.now() - step3Start,
    });

    // Step 4: Extract knowledge anchors
    const step4Start = Date.now();
    const anchors = this.extractAnchors(sections, cfg.maxAnchorsPerLesson);

    log('KnowledgeContext', 'info', 'VTTToXML Step 4: extracted anchors', {
      courseId: context.courseId,
      lessonId: context.lessonId,
      maxAnchorsPerLesson: cfg.maxAnchorsPerLesson,
      anchorsCount: anchors.length,
      anchorsPreview: anchors.slice(0, 10).map((a) => ({
        t: a.timestampStr,
        type: a.anchorType,
        title: a.title,
        keyTermsCount: a.keyTerms?.length || 0,
      })),
      durationMs: Date.now() - step4Start,
    });

    // Step 5: Generate deterministic XML
    const step5Start = Date.now();
    const xml = this.generateXML(sections, context);

    // Calculate hash for idempotency
    const contentHash = this.calculateHash(xml);

    // Estimate token count (~4 chars per token)
    const tokenCount = Math.ceil(xml.length / 4);

    log('KnowledgeContext', 'info', 'VTTToXML Step 5: generated XML knowledge base', {
      courseId: context.courseId,
      lessonId: context.lessonId,
      xmlChars: xml.length,
      contentHash,
      tokenCountApprox: tokenCount,
      durationMs: Date.now() - step5Start,
    });

    log('KnowledgeContext', 'info', 'VTTToXML complete', {
      courseId: context.courseId,
      lessonId: context.lessonId,
      totalDurationMs: Date.now() - startTime,
      sectionsCount: sections.length,
      anchorsCount: anchors.length,
      tokenCountApprox: tokenCount,
    });

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
        usedFallbackEnrichment: this.enrichmentResult.usedFallback,
        fallbackReason: this.enrichmentResult.fallbackReason,
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

  /** Internal result type for enrichment that tracks fallback usage */
  private enrichmentResult: { usedFallback: boolean; fallbackReason?: string } = {
    usedFallback: false,
    fallbackReason: undefined,
  };

  /**
   * Step 2: Use GPT-4o-mini to generate section titles and extract concepts
   */
  private async enrichWithAI(
    paragraphs: AggregatedParagraph[],
    context: CourseContext
  ): Promise<EnrichedSection[]> {
    // Reset enrichment tracking
    this.enrichmentResult = { usedFallback: false, fallbackReason: undefined };

    if (!this.openaiApiKey) {
      // Fallback: generate titles without AI
      this.enrichmentResult = {
        usedFallback: true,
        fallbackReason: 'OPENAI_API_KEY not configured',
      };
      log('KnowledgeContext', 'warn', 'AI enrichment skipped: no API key', {
        courseId: context.courseId,
        lessonId: context.lessonId,
      });
      return this.enrichWithoutAI(paragraphs);
    }

    const promptConfig = await AIPromptResolverService.resolve({
      useCase: AIPromptUseCase.VTT_TO_XML_ENRICHMENT,
      courseId: context.courseId,
      templateId: context.promptTemplateIdOverride ?? null,
    });

    // Batch paragraphs into groups of 10 for efficient API calls
    const batchSize = 10;
    const enrichedSections: EnrichedSection[] = [];
    let batchFallbackCount = 0;

    for (let i = 0; i < paragraphs.length; i += batchSize) {
      const batch = paragraphs.slice(i, i + batchSize);
      const { sections: batchResults, usedFallback } = await this.enrichBatchWithAI(batch, context, i, promptConfig);
      enrichedSections.push(...batchResults);
      if (usedFallback) {
        batchFallbackCount++;
      }
    }

    // If any batch used fallback, mark overall result
    if (batchFallbackCount > 0) {
      const totalBatches = Math.ceil(paragraphs.length / batchSize);
      this.enrichmentResult = {
        usedFallback: true,
        fallbackReason: `AI enrichment failed for ${batchFallbackCount}/${totalBatches} batches`,
      };
    }

    return enrichedSections;
  }

  /**
   * Enrich a batch of paragraphs with AI
   */
  private async enrichBatchWithAI(
    paragraphs: AggregatedParagraph[],
    context: CourseContext,
    startIndex: number,
    promptConfig: Awaited<ReturnType<typeof AIPromptResolverService.resolve>>
  ): Promise<{ sections: EnrichedSection[]; usedFallback: boolean }> {
    const sections = paragraphs.map((p, i) => ({
      index: i,
      timestamp: VTTParserService.formatTimestamp(p.startTime, true),
      text: p.text.substring(0, 500), // Limit text length for prompt
    }));

    const vars = {
      courseTitle: context.courseTitle,
      chapterTitle: context.chapterTitle,
      lessonTitle: context.lessonTitle,
      sectionsJson: JSON.stringify(sections, null, 2),
    };

    const systemPrompt = AIPromptResolverService.render(promptConfig.systemPrompt, vars);
    const userPromptTemplate = promptConfig.userPrompt ?? this.buildEnrichmentPrompt(paragraphs, context);
    const userPrompt = AIPromptResolverService.render(userPromptTemplate, vars);

    try {
      const logOpenAiContent = process.env.CSE_OPENAI_LOG_CONTENT === '1';
      const controller = new AbortController();
      const timeoutMs = parseInt(process.env.VTT_TO_XML_ENRICH_TIMEOUT_MS || '20000', 10);
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const budget = getChatCompletionsTokenBudget(promptConfig.model, promptConfig.maxTokens);
      const requestBody = {
        model: promptConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: promptConfig.temperature,
        ...budget.param,
      };

      log('OpenAI', 'info', 'vtt-to-xml chat.completions request', {
        templateSource: promptConfig.source,
        templateId: promptConfig.templateId,
        templateName: promptConfig.templateName,
        model: promptConfig.model,
        temperature: promptConfig.temperature,
        tokenParam: budget.tokenParam,
        requestedMaxTokens: budget.requestedMaxTokens,
        effectiveMaxTokens: budget.effectiveMaxTokens,
        clamped: budget.clamped,
        batchStartIndex: startIndex,
        batchSize: paragraphs.length,
        systemPromptChars: systemPrompt.length,
        userPromptChars: userPrompt.length,
      });
      if (logOpenAiContent) {
        log('OpenAI', 'debug', 'vtt-to-xml chat.completions request body', { body: requestBody });
      }

      const response = await timeAsync(
        'OpenAI',
        'vtt-to-xml chat.completions response',
        { url: 'https://api.openai.com/v1/chat/completions', model: promptConfig.model, batchStartIndex: startIndex },
        () =>
          fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.openaiApiKey}`,
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          })
      ).finally(() => clearTimeout(timeout));

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        log('OpenAI', 'error', 'vtt-to-xml chat.completions error', {
          status: response.status,
          bodyPreview: errorText.slice(0, 500),
          batchStartIndex: startIndex,
        });
        if (logOpenAiContent) {
          log('OpenAI', 'error', 'vtt-to-xml chat.completions error body', { status: response.status, body: errorText });
        }
        return { sections: this.enrichWithoutAI(paragraphs), usedFallback: true };
      }

      const data = await response.json();
      if (logOpenAiContent) {
        log('OpenAI', 'debug', 'vtt-to-xml chat.completions raw response', { response: data });
      }
      log('OpenAI', 'info', 'vtt-to-xml chat.completions usage', {
        model: data.model || promptConfig.model,
        totalTokens: data.usage?.total_tokens,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        batchStartIndex: startIndex,
      });

      const extracted = extractChatCompletionsText(data);
      const content = extracted.text || '';
      if (logOpenAiContent) {
        log('OpenAI', 'debug', 'vtt-to-xml chat.completions message.content', { content, source: extracted.source });
      }

      // Parse JSON response
      const parsed = this.parseAIResponse(content);

      const sections = paragraphs.map((para, idx) => {
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
      return { sections, usedFallback: false };
    } catch (error) {
      log('OpenAI', 'error', 'vtt-to-xml chat.completions exception', {
        batchStartIndex: startIndex,
        error: error instanceof Error ? error.message : String(error),
      });
      return { sections: this.enrichWithoutAI(paragraphs), usedFallback: true };
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
    if (sections.length === 0 || maxAnchors <= 0) {
      return [];
    }

    // Ensure timeline coverage: pick at most one section per bucket across the
    // full lesson duration. Inside each bucket, prefer AI-marked key moments.
    const bucketCount = Math.min(maxAnchors, sections.length);
    const finalAnchors: EnrichedSection[] = [];
    const used = new Set<number>();

    for (let i = 0; i < bucketCount; i++) {
      const startIdx = Math.floor((i * sections.length) / bucketCount);
      const endExclusive = Math.floor(((i + 1) * sections.length) / bucketCount);
      const bucket = sections.slice(startIdx, Math.max(startIdx + 1, endExclusive));
      const withOriginalIndex = bucket.map((section, offset) => ({
        section,
        index: startIdx + offset,
      }));

      const preferred = withOriginalIndex.find((item) => item.section.isAnchor && !used.has(item.index));
      const fallback = withOriginalIndex[Math.floor(withOriginalIndex.length / 2)];
      const chosen = preferred ?? fallback;

      if (!chosen || used.has(chosen.index)) continue;
      used.add(chosen.index);
      finalAnchors.push(chosen.section);
    }

    const normalizeAnchorTitle = (value: string) => {
      const raw = (value || '').trim();
      const withoutPrefix = raw.replace(/^Section\s+\d+\s*:\s*/i, '');
      const withoutTrailingEllipsis = withoutPrefix.replace(/\s*(…|\.\.\.)\s*$/g, '').trim();
      return withoutTrailingEllipsis;
    };

    return finalAnchors.map((section, idx) => ({
      timestamp: section.timestampSeconds,
      timestampStr: section.timestamp,
      title: normalizeAnchorTitle(section.title),
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
