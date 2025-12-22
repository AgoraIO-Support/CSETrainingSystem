/**
 * Exam Generation Service
 * AI-powered question generation using XML knowledge context
 */

import prisma from '@/lib/prisma';
import {
  ExamQuestionType,
  DifficultyLevel,
  ExamType,
} from '@prisma/client';
import OpenAI from 'openai';
import { log, timeAsync } from '@/lib/logger';
import { ExamService } from '@/lib/services/exam.service';
import { KnowledgeContextService } from '@/lib/services/knowledge-context.service';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import s3Client, { S3_BUCKET_NAME } from '@/lib/aws-s3';
import { createHash } from 'crypto';

export interface GenerationConfig {
  questionCounts: {
    multipleChoice?: number;
    trueFalse?: number;
    fillInBlank?: number;
    essay?: number;
  };
  difficulty: DifficultyLevel | 'mixed';
  lessonIds?: string[];
  topics?: string[];
  focusAreas?: string[];
}

export interface GeneratedQuestion {
  type: ExamQuestionType;
  difficulty: DifficultyLevel;
  question: string;
  options?: string[];
  correctAnswer?: string;
  rubric?: string;
  sampleAnswer?: string;
  explanation?: string;
  topic?: string;
  sourceChunkIds: string[];
  confidence: number;
}

export interface GenerationResult {
  questions: GeneratedQuestion[];
  createdQuestions: any[];
  totalGenerated: number;
  tokensUsed: number;
  warnings: string[];
}

export class ExamGenerationService {
  private openai: OpenAI;
  private knowledgeService: KnowledgeContextService;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.knowledgeService = new KnowledgeContextService(process.env.OPENAI_API_KEY);
  }

  /**
   * Generate questions for an exam based on XML knowledge context.
   * For `COURSE_BASED` exams, this uses lesson knowledge contexts generated from VTT → XML.
   */
  async generateQuestions(
    examId: string,
    config: GenerationConfig
  ): Promise<GenerationResult> {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        materials: {
          where: { status: 'READY' },
          include: {
            chunks: true,
          },
        },
        course: {
          include: {
            chapters: {
              orderBy: { order: 'asc' },
              include: {
                lessons: {
                  orderBy: { order: 'asc' },
                  include: {
                    knowledgeContext: true,
                    knowledgeAnchors: {
                      orderBy: { sequenceIndex: 'asc' },
                    },
                    transcripts: {
                      orderBy: { updatedAt: 'desc' },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!exam) {
      throw new Error('EXAM_NOT_FOUND');
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY_MISSING');
    }

    const questions: GeneratedQuestion[] = [];
    const createdQuestions: any[] = [];
    const warnings: string[] = [];
    let totalTokensUsed = 0;

    // Generate each question type
    const typeMap: Record<string, ExamQuestionType> = {
      multipleChoice: ExamQuestionType.MULTIPLE_CHOICE,
      trueFalse: ExamQuestionType.TRUE_FALSE,
      fillInBlank: ExamQuestionType.FILL_IN_BLANK,
      essay: ExamQuestionType.ESSAY,
    };

    // Build a stable knowledge prefix so repeated calls benefit from OpenAI context caching.
    const knowledgePrefix = await this.buildKnowledgePrefixOrThrow(exam, config.lessonIds);

    for (const [key, count] of Object.entries(config.questionCounts)) {
      if (!count || count <= 0) continue;

      const questionType = typeMap[key];
      if (!questionType) continue;

      const difficulty = config.difficulty === 'mixed'
        ? this.getRandomDifficulty()
        : config.difficulty;

      for (let i = 0; i < count; i++) {
        try {
          const result = await this.generateSingleQuestion(
            questionType,
            difficulty,
            knowledgePrefix,
            config.topics,
            config.focusAreas
          );

          questions.push(result.question);
          totalTokensUsed += result.tokensUsed;

          const created = await ExamService.addQuestion(examId, {
            type: result.question.type,
            difficulty: result.question.difficulty,
            question: result.question.question,
            options: result.question.options,
            correctAnswer: result.question.correctAnswer,
            rubric: result.question.rubric,
            sampleAnswer: result.question.sampleAnswer,
            explanation: result.question.explanation,
            topic: result.question.topic,
            isAIGenerated: true,
            aiModel: 'gpt-4o-mini',
            generationPrompt: result.generationPrompt,
          });
          createdQuestions.push(created);

          // Get new difficulty if mixed
          if (config.difficulty === 'mixed' && i < count - 1) {
            // Vary difficulty for mixed mode
          }
        } catch (error) {
          console.error(`Failed to generate ${key} question:`, error);
          warnings.push(`Failed to generate ${key} question ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Update exam's AI generation config
    await prisma.exam.update({
      where: { id: examId },
      data: {
        aiGenerationConfig: config as any,
      },
    });

    return {
      questions,
      createdQuestions,
      totalGenerated: questions.length,
      tokensUsed: totalTokensUsed,
      warnings,
    };
  }

  /**
   * Build a stable XML knowledge prefix used for all generation calls.
   */
  private async buildKnowledgePrefixOrThrow(exam: any, lessonIds?: string[]): Promise<string> {
    const allowSet = Array.isArray(lessonIds) && lessonIds.length > 0 ? new Set(lessonIds) : null;

    // COURSE_BASED: list from the course curriculum, optionally filtered by lessonIds.
    if (exam.examType === ExamType.COURSE_BASED && exam.course) {
      const course = exam.course;
      const lessons: Array<{
        id: string;
        title: string;
        description?: string | null;
        chapter: { title: string; order: number };
        order: number;
        course: { id: string; title: string };
        knowledgeContext: any | null;
        knowledgeAnchors: Array<{
          timestampStr: string;
          title: string;
          summary: string;
          keyTerms: string[];
          anchorType: string;
        }>;
        transcripts: Array<{ s3Key: string; filename: string }>;
      }> = [];

      for (const chapter of course.chapters ?? []) {
        for (const lesson of chapter.lessons ?? []) {
          if (allowSet && !allowSet.has(lesson.id)) continue;
          lessons.push({
            id: lesson.id,
            title: lesson.title,
            description: lesson.description,
            chapter: { title: chapter.title, order: chapter.order },
            order: lesson.order,
            course: { id: course.id, title: course.title },
            knowledgeContext: lesson.knowledgeContext ?? null,
            knowledgeAnchors: lesson.knowledgeAnchors ?? [],
            transcripts: lesson.transcripts ?? [],
          });
        }
      }

      if (lessons.length === 0) throw new Error('NO_CONTENT_AVAILABLE');

      return await this.buildBundleXml({
        bundleType: 'COURSE',
        bundleId: course.id,
        bundleTitle: course.title,
        lessons,
      });
    }

    // STANDALONE: must select lessons explicitly (can span courses).
    if (!allowSet) throw new Error('NO_CONTENT_AVAILABLE');

    const selectedLessons = await prisma.lesson.findMany({
      where: { id: { in: Array.from(allowSet) } },
      include: {
        chapter: { include: { course: true } },
        knowledgeContext: true,
        knowledgeAnchors: { orderBy: { sequenceIndex: 'asc' } },
        transcripts: { orderBy: { updatedAt: 'desc' }, take: 1 },
      },
    });

    if (selectedLessons.length === 0) throw new Error('NO_CONTENT_AVAILABLE');

    const lessons = selectedLessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      chapter: { title: lesson.chapter.title, order: lesson.chapter.order },
      order: lesson.order,
      course: { id: lesson.chapter.course.id, title: lesson.chapter.course.title },
      knowledgeContext: lesson.knowledgeContext ?? null,
      knowledgeAnchors: lesson.knowledgeAnchors ?? [],
      transcripts: lesson.transcripts ?? [],
    }));

    return await this.buildBundleXml({
      bundleType: 'STANDALONE',
      bundleId: exam.id,
      bundleTitle: exam.title,
      lessons,
    });
  }

  private async buildBundleXml(input: {
    bundleType: 'COURSE' | 'STANDALONE';
    bundleId: string;
    bundleTitle: string;
    lessons: Array<{
      id: string;
      title: string;
      description?: string | null;
      chapter: { title: string; order: number };
      order: number;
      course: { id: string; title: string };
      knowledgeContext: any | null;
      knowledgeAnchors: Array<{
        timestampStr: string;
        title: string;
        summary: string;
        keyTerms: string[];
        anchorType: string;
      }>;
      transcripts: Array<{ s3Key: string; filename: string }>;
    }>;
  }): Promise<string> {
    // Ensure knowledge contexts exist (generate from latest VTT if missing).
    for (const lesson of input.lessons) {
      const status = lesson.knowledgeContext?.status;
      if (status === 'READY' || status === 'PROCESSING') continue;

      const transcript = lesson.transcripts[0];
      if (!transcript?.s3Key) continue;

      const command = new GetObjectCommand({ Bucket: S3_BUCKET_NAME, Key: transcript.s3Key });
      const response = await s3Client.send(command);
      const vttContent = (await response.Body?.transformToString('utf-8')) || '';
      if (!vttContent.trim()) continue;

      await this.knowledgeService.generateAndStoreContext(lesson.id, vttContent, {
        courseId: lesson.course.id,
        courseTitle: lesson.course.title,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        chapterTitle: lesson.chapter.title,
        lessonDescription: lesson.description || undefined,
      });
    }

    // Deterministic ordering.
    const sorted = input.lessons.slice().sort((a, b) => {
      if (a.course.id !== b.course.id) return a.course.id.localeCompare(b.course.id);
      if (a.chapter.order !== b.chapter.order) return a.chapter.order - b.chapter.order;
      return a.order - b.order;
    });

    const maxChars = parseInt(process.env.EXAM_GENERATION_MAX_XML_CHARS || '160000', 10);
    const maxLessonChars = parseInt(process.env.EXAM_GENERATION_MAX_XML_CHARS_PER_LESSON || '60000', 10);

    let used = 0;
    const parts: string[] = [];

    if (input.bundleType === 'COURSE') {
      parts.push(
        `COURSE_KNOWLEDGE_XML:\n<course_knowledge_context course_id="${this.escapeAttr(input.bundleId)}" course_title="${this.escapeAttr(input.bundleTitle)}" version="1.0">`
      );
    } else {
      parts.push(
        `EXAM_KNOWLEDGE_XML:\n<knowledge_context_bundle exam_id="${this.escapeAttr(input.bundleId)}" exam_title="${this.escapeAttr(input.bundleTitle)}" version="1.0">`
      );
    }

    for (const lesson of sorted) {
      const xml = await this.knowledgeService.getKnowledgeContext(lesson.id);
      if (!xml) continue;

      const truncated = xml.length > maxLessonChars ? xml.slice(0, maxLessonChars) : xml;
      const wrapped = this.wrapCdata(truncated);
      const anchorsPreview = (lesson.knowledgeAnchors ?? []).slice(0, 12).map((a) => ({
        timestamp: a.timestampStr,
        type: a.anchorType,
        title: a.title,
        keyTerms: a.keyTerms?.slice(0, 6) ?? [],
      }));

      const attrs =
        input.bundleType === 'COURSE'
          ? `lesson_id="${lesson.id}" title="${this.escapeAttr(lesson.title)}" chapter="${this.escapeAttr(lesson.chapter.title)}"`
          : `lesson_id="${lesson.id}" title="${this.escapeAttr(lesson.title)}" course_id="${this.escapeAttr(lesson.course.id)}" course_title="${this.escapeAttr(lesson.course.title)}" chapter="${this.escapeAttr(lesson.chapter.title)}"`;

      const block = `\n  <lesson ${attrs}>\n    <anchor_index>${this.escapeText(JSON.stringify(anchorsPreview))}</anchor_index>\n    <knowledge_base><![CDATA[${wrapped}]]></knowledge_base>\n  </lesson>\n`;

      if (used + block.length > maxChars) break;
      parts.push(block);
      used += block.length;
    }

    parts.push(input.bundleType === 'COURSE' ? `</course_knowledge_context>\n` : `</knowledge_context_bundle>\n`);

    if (parts.length <= 2) throw new Error('NO_CONTENT_AVAILABLE');
    return parts.join('');
  }

  /**
   * Generate a single question
   */
  private async generateSingleQuestion(
    type: ExamQuestionType,
    difficulty: DifficultyLevel,
    knowledgePrefix: string,
    topics?: string[],
    focusAreas?: string[]
  ): Promise<{ question: GeneratedQuestion; tokensUsed: number; generationPrompt: string }> {
    const knowledgePrefixHash = createHash('sha256').update(knowledgePrefix).digest('hex');
    const taskPrompt = this.buildGenerationTaskPrompt(type, difficulty, topics, focusAreas, knowledgePrefixHash);
    const prompt = `${knowledgePrefix}\n\n${taskPrompt}`;

    // Call OpenAI API
    const messages = [
      { role: 'system' as const, content: this.getSystemPrompt() },
      { role: 'user' as const, content: prompt },
    ];
    const request = {
      model: 'gpt-4o-mini',
      messages,
      response_format: { type: 'json_object' as const },
      temperature: 0.7,
      max_tokens: 1500,
    };

    const logOpenAiContent = process.env.CSE_OPENAI_LOG_CONTENT === '1';
    log('OpenAI', 'info', 'exam-generation chat.completions request', {
      model: request.model,
      messagesCount: messages.length,
      promptChars: prompt.length,
    });
    if (logOpenAiContent) {
      log('OpenAI', 'debug', 'exam-generation chat.completions request body', { body: request });
    }

    const response = await timeAsync(
      'OpenAI',
      'exam-generation chat.completions response',
      { model: request.model },
      () => this.openai.chat.completions.create(request as any)
    );
    if (logOpenAiContent) {
      log('OpenAI', 'debug', 'exam-generation chat.completions raw response', { response });
    }

    const result = JSON.parse(response.choices[0].message.content || '{}');
    const normalized = this.normalizeGeneratedQuestion(type, difficulty, result);

    return {
      question: {
        type,
        difficulty,
        question: normalized.question,
        options: normalized.options,
        correctAnswer: normalized.correctAnswer,
        rubric: normalized.rubric,
        sampleAnswer: normalized.sampleAnswer,
        explanation: normalized.explanation,
        topic: normalized.topic || topics?.[0],
        sourceChunkIds: [],
        confidence: normalized.confidence,
      },
      tokensUsed: response.usage?.total_tokens || 0,
      generationPrompt: taskPrompt,
    };
  }

  /**
   * Normalize OpenAI output into the canonical DB format.
   *
   * Canonical formats (matches admin UI + schema comment):
   * - MULTIPLE_CHOICE: `correctAnswer` is the option index as a string: "0".."3"
   * - TRUE_FALSE: `correctAnswer` is "true" or "false"
   * - FILL_IN_BLANK: free-form string (not auto-graded)
   * - ESSAY: use rubric + sampleAnswer; `correctAnswer` is not required
   */
  private normalizeGeneratedQuestion(type: ExamQuestionType, difficulty: DifficultyLevel, raw: any): GeneratedQuestion {
    const question = typeof raw?.question === 'string' ? raw.question.trim() : '';
    const explanation = typeof raw?.explanation === 'string' ? raw.explanation.trim() : undefined;
    const topic = typeof raw?.topic === 'string' ? raw.topic.trim() : undefined;
    const confidence =
      typeof raw?.confidence === 'number' && Number.isFinite(raw.confidence)
        ? Math.max(0, Math.min(raw.confidence, 1))
        : 0.8;

    if (type === ExamQuestionType.MULTIPLE_CHOICE) {
      const options = Array.isArray(raw?.options) ? raw.options.map((o: any) => String(o)) : [];
      if (options.length !== 4) {
        throw new Error('INVALID_MULTIPLE_CHOICE_OPTIONS');
      }
      const correctAnswer = this.normalizeMultipleChoiceCorrectAnswer(raw, options);
      if (correctAnswer == null) {
        throw new Error('INVALID_MULTIPLE_CHOICE_CORRECT_ANSWER');
      }
      return {
        type,
        difficulty,
        question,
        options,
        correctAnswer,
        explanation,
        topic,
        sourceChunkIds: [],
        confidence,
      } as GeneratedQuestion;
    }

    if (type === ExamQuestionType.TRUE_FALSE) {
      const correctAnswer = this.normalizeTrueFalseCorrectAnswer(raw?.correctAnswer);
      if (correctAnswer == null) {
        throw new Error('INVALID_TRUE_FALSE_CORRECT_ANSWER');
      }
      return {
        type,
        difficulty,
        question,
        correctAnswer,
        explanation,
        topic,
        sourceChunkIds: [],
        confidence,
      } as GeneratedQuestion;
    }

    if (type === ExamQuestionType.FILL_IN_BLANK) {
      const correctAnswer = typeof raw?.correctAnswer === 'string' ? raw.correctAnswer.trim() : '';
      if (!correctAnswer) {
        throw new Error('INVALID_FILL_IN_BLANK_CORRECT_ANSWER');
      }
      return {
        type,
        difficulty,
        question,
        correctAnswer,
        explanation,
        topic,
        sourceChunkIds: [],
        confidence,
      } as GeneratedQuestion;
    }

    // ESSAY
    const rubric = typeof raw?.rubric === 'string' ? raw.rubric.trim() : undefined;
    const sampleAnswer = typeof raw?.sampleAnswer === 'string' ? raw.sampleAnswer.trim() : undefined;
    if (!rubric && !sampleAnswer) {
      // Still allow essays without rubric/sampleAnswer, but keep a warning-level validation here
      // by requiring at least one of them (prevents empty essay questions).
      throw new Error('INVALID_ESSAY_METADATA');
    }
    return {
      type,
      difficulty,
      question,
      rubric,
      sampleAnswer,
      explanation,
      topic,
      sourceChunkIds: [],
      confidence,
    } as GeneratedQuestion;
  }

  private normalizeMultipleChoiceCorrectAnswer(raw: any, options: string[]): string | null {
    // Prefer explicit numeric index.
    const idxRaw = raw?.correctAnswerIndex;
    if (typeof idxRaw === 'number' && Number.isFinite(idxRaw)) {
      const idx = Math.floor(idxRaw);
      if (idx >= 0 && idx < options.length) return String(idx);
    }

    const ca = raw?.correctAnswer;
    if (typeof ca === 'number' && Number.isFinite(ca)) {
      const idx = Math.floor(ca);
      if (idx >= 0 && idx < options.length) return String(idx);
    }

    if (typeof ca === 'string') {
      const trimmed = ca.trim();
      // Accept letter format "A".."D".
      if (/^[A-Da-d]$/.test(trimmed)) {
        const idx = trimmed.toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < options.length) return String(idx);
      }
      // Accept index string "0".."3".
      if (/^\d+$/.test(trimmed)) {
        const idx = Number.parseInt(trimmed, 10);
        if (Number.isFinite(idx) && idx >= 0 && idx < options.length) return String(idx);
      }
      // Accept option text (best-effort fallback).
      const matchIdx = options.findIndex((o) => o.trim() === trimmed);
      if (matchIdx >= 0) return String(matchIdx);
    }

    return null;
  }

  private normalizeTrueFalseCorrectAnswer(value: unknown): 'true' | 'false' | null {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value !== 'string') return null;
    const v = value.trim().toLowerCase();
    if (v === 'true') return 'true';
    if (v === 'false') return 'false';
    return null;
  }

  /**
   * Get system prompt for question generation
   */
  private getSystemPrompt(): string {
    return `You are an expert exam question generator. Your task is to create high-quality exam questions based on the provided learning content.

Rules:
1. Questions must be directly based on the provided content
2. Questions should test understanding, not just memorization
3. All information in questions must be factually accurate
4. Multiple choice questions should have exactly 4 options with 1 correct answer
5. Distractors (wrong options) should be plausible but clearly incorrect
6. Essay questions should have clear rubrics and sample answers
7. Always provide explanations for the correct answers

Output format: JSON object with the following structure based on question type.`;
  }

  /**
   * Build generation prompt for specific question type
   */
  private buildGenerationTaskPrompt(
    type: ExamQuestionType,
    difficulty: DifficultyLevel,
    topics?: string[],
    focusAreas?: string[],
    knowledgePrefixHash?: string
  ): string {
    const difficultyDesc = {
      [DifficultyLevel.EASY]: 'basic understanding, straightforward questions',
      [DifficultyLevel.MEDIUM]: 'application of concepts, requires some analysis',
      [DifficultyLevel.HARD]: 'complex analysis, synthesis of multiple concepts',
    };

    let typePrompt = '';

    switch (type) {
      case ExamQuestionType.MULTIPLE_CHOICE:
        typePrompt = `Generate a MULTIPLE CHOICE question with:
- A clear question stem
- Exactly 4 options labeled A, B, C, D
- One correct answer
- An explanation of why the correct answer is correct

Output JSON:
{
  "question": "The question text",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswerIndex": 0,
  "explanation": "Why the answer is correct",
  "topic": "Main topic tested",
  "confidence": 0.9
}`;
        break;

      case ExamQuestionType.TRUE_FALSE:
        typePrompt = `Generate a TRUE/FALSE question with:
- A clear statement that is definitively true or false
- The correct answer (true or false)
- An explanation

Output JSON:
{
  "question": "The statement to evaluate",
  "correctAnswer": "true",
  "explanation": "Why it's true/false",
  "topic": "Main topic tested",
  "confidence": 0.9
}`;
        break;

      case ExamQuestionType.FILL_IN_BLANK:
        typePrompt = `Generate a FILL IN THE BLANK question with:
- A sentence with one key term blanked out (use _____ for the blank)
- The correct answer to fill in
- An explanation

Output JSON:
{
  "question": "The sentence with _____ for the blank",
  "correctAnswer": "the word/phrase that goes in the blank",
  "explanation": "Context for the answer",
  "topic": "Main topic tested",
  "confidence": 0.9
}`;
        break;

      case ExamQuestionType.ESSAY:
        typePrompt = `Generate an ESSAY question with:
- An open-ended question requiring detailed explanation
- A grading rubric with criteria and points
- A sample answer demonstrating expected response

Output JSON:
{
  "question": "The essay question",
  "rubric": "Grading criteria: Content (40%), Analysis (30%), Examples (20%), Clarity (10%)",
  "sampleAnswer": "A model answer showing expected depth and structure",
  "topic": "Main topic tested",
  "confidence": 0.85
}`;
        break;
    }

    const topicStr = topics?.length ? `Focus on these topics: ${topics.join(', ')}\n` : '';
    const focusStr = focusAreas?.length ? `Emphasize these areas: ${focusAreas.join(', ')}\n` : '';

    return `KnowledgePrefixHash: ${knowledgePrefixHash ?? 'unknown'}

Based on the COURSE_KNOWLEDGE_XML above, generate a ${difficulty.toLowerCase()} difficulty question.

Difficulty level: ${difficultyDesc[difficulty]}
${topicStr}${focusStr}

${typePrompt}`;
  }

  private wrapCdata(text: string): string {
    // Avoid terminating CDATA.
    return text.replaceAll(']]>', ']]]]><![CDATA[>');
  }

  private escapeAttr(text: string): string {
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  private escapeText(text: string): string {
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  /**
   * Get random difficulty for mixed mode
   */
  private getRandomDifficulty(): DifficultyLevel {
    const difficulties = [DifficultyLevel.EASY, DifficultyLevel.MEDIUM, DifficultyLevel.HARD];
    // Weighted: 30% easy, 50% medium, 20% hard
    const weights = [0.3, 0.5, 0.2];
    const random = Math.random();
    let cumulative = 0;

    for (let i = 0; i < difficulties.length; i++) {
      cumulative += weights[i];
      if (random <= cumulative) {
        return difficulties[i];
      }
    }

    return DifficultyLevel.MEDIUM;
  }

  /**
   * Regenerate a specific question
   */
  async regenerateQuestion(
    questionId: string,
    config?: Partial<GenerationConfig>
  ): Promise<GeneratedQuestion> {
    const existingQuestion = await prisma.examQuestion.findUnique({
      where: { id: questionId },
      include: {
        exam: {
          include: {
            materials: {
              where: { status: 'READY' },
              include: { chunks: true },
            },
            course: {
              include: {
                chapters: {
                  include: {
                    lessons: {
                      include: {
                        transcripts: {
                          where: { status: 'READY' },
                          include: { chunks: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        sources: {
          include: { chunk: true },
        },
      },
    });

    if (!existingQuestion) {
      throw new Error('QUESTION_NOT_FOUND');
    }

    const knowledgePrefix = await this.buildKnowledgePrefixOrThrow(existingQuestion.exam);
    const result = await this.generateSingleQuestion(
      existingQuestion.type,
      config?.difficulty as DifficultyLevel || existingQuestion.difficulty,
      knowledgePrefix,
      config?.topics,
      config?.focusAreas
    );

    // Update the question
    await prisma.examQuestion.update({
      where: { id: questionId },
      data: {
        question: result.question.question,
        options: result.question.options,
        correctAnswer: result.question.correctAnswer,
        rubric: result.question.rubric,
        sampleAnswer: result.question.sampleAnswer,
        explanation: result.question.explanation,
        topic: result.question.topic,
        difficulty: result.question.difficulty,
        isAIGenerated: true,
        aiModel: 'gpt-4o-mini',
        generationPrompt: result.generationPrompt,
      },
    });

    // Clear source links; XML knowledge context isn't represented as MaterialChunk sources.
    await prisma.examQuestionSource.deleteMany({
      where: { questionId },
    });

    return result.question;
  }
}
