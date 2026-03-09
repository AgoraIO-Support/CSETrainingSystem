/**
 * Exam Grading Service
 * Auto-grading for objective questions and AI-assisted essay grading
 */

import prisma from '@/lib/prisma';
import {
  ExamQuestionType,
  GradingStatus,
  ExamAttemptStatus,
  AIPromptUseCase,
  AIResponseFormat,
} from '@prisma/client';
import OpenAI from 'openai';
import { log, timeAsync } from '@/lib/logger';
import { CertificateService } from '@/lib/services/certificate.service';
import { AIPromptResolverService } from '@/lib/services/ai-prompt-resolver.service';
import { getChatCompletionsTokenBudget } from '@/lib/services/openai-models';

export interface GradingResult {
  attemptId: string;
  totalQuestions: number;
  gradedQuestions: number;
  pendingEssays: number;
  autoGradedScore: number;
  maxAutoGradedScore: number;
}

export interface AIGradingResult {
  answerId: string;
  suggestedScore: number;
  maxScore: number;
  feedback: string;
  rubricEvaluation: string;
  confidence: number;
}

export interface FinalScoreResult {
  attemptId: string;
  rawScore: number;
  percentageScore: number;
  passed: boolean;
  totalScore: number;
  passingScore: number;
}

export class ExamGradingService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Grade all objective questions in an attempt (auto-grading)
   */
  async gradeAttempt(attemptId: string): Promise<GradingResult> {
    let attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          include: {
            questions: {
              where: { archivedAt: null },
            },
          },
        },
        questionSnapshots: {
          orderBy: { order: 'asc' },
        },
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!attempt) {
      throw new Error('ATTEMPT_NOT_FOUND');
    }

    if (attempt.status !== ExamAttemptStatus.SUBMITTED) {
      throw new Error('ATTEMPT_NOT_SUBMITTED');
    }

    // Ensure there is an ExamAnswer row for every question so:
    // - unanswered objective questions can be auto-graded as incorrect (0 points)
    // - manual questions (essay/fill-in-blank) show up for admin grading
    const answeredQuestionIds = new Set(attempt.answers.map((a) => a.questionId));
    const questionBank =
      attempt.questionSnapshots.length > 0
        ? attempt.questionSnapshots.map((q) => ({
            id: q.questionId,
            type: q.type,
            points: q.points,
            correctAnswer: q.correctAnswer,
            options: (q.options as string[] | null) ?? null,
          }))
        : attempt.exam.questions.map((q) => ({
            id: q.id,
            type: q.type,
            points: q.points,
            correctAnswer: q.correctAnswer,
            options: (q.options as string[] | null) ?? null,
          }));
    const questionById = new Map(questionBank.map((q) => [q.id, q] as const));

    const missingQuestionIds = questionBank
      .map((q) => q.id)
      .filter((qid) => !answeredQuestionIds.has(qid));
    if (missingQuestionIds.length > 0) {
      await prisma.examAnswer.createMany({
        data: missingQuestionIds.map((questionId) => ({
          attemptId,
          questionId,
        })),
        skipDuplicates: true,
      });

      attempt = await prisma.examAttempt.findUnique({
        where: { id: attemptId },
        include: {
          exam: { include: { questions: true } },
          questionSnapshots: { orderBy: { order: 'asc' } },
          answers: { include: { question: true } },
        },
      });

      if (!attempt) {
        throw new Error('ATTEMPT_NOT_FOUND');
      }
    }

    let autoGradedScore = 0;
    let maxAutoGradedScore = 0;
    let gradedCount = 0;
    let pendingEssays = 0;

    const manualQuestionIds = new Set(
      questionBank
        .filter(
          (q) =>
            q.type === ExamQuestionType.ESSAY ||
            q.type === ExamQuestionType.FILL_IN_BLANK ||
            q.type === ExamQuestionType.EXERCISE
        )
        .map((q) => q.id)
    );

    const manualAnswerByQuestionId = new Map(
      attempt.answers
        .filter((a) => manualQuestionIds.has(a.questionId))
        .map((a) => [a.questionId, a] as const)
    );

    // Grade each answer
    for (const answer of attempt.answers) {
      const question = questionById.get(answer.questionId);
      if (!question) {
        continue;
      }

      if (
        question.type === ExamQuestionType.ESSAY ||
        question.type === ExamQuestionType.FILL_IN_BLANK ||
        question.type === ExamQuestionType.EXERCISE
      ) {
        // Essays and fill-in-blank questions require manual grading in this system.
        // Auto-grading is limited to Multiple Choice + True/False.
        continue;
      }

      // Auto-grade objective questions
      const { isCorrect, pointsAwarded } = this.gradeObjectiveQuestion(
        question.type,
        answer.selectedOption,
        answer.answer,
        question.correctAnswer,
        question.options,
        question.points
      );

      await prisma.examAnswer.update({
        where: { id: answer.id },
        data: {
          isCorrect,
          pointsAwarded,
          gradingStatus: GradingStatus.AUTO_GRADED,
        },
      });

      if (isCorrect) {
        autoGradedScore += pointsAwarded;
      }
      maxAutoGradedScore += question.points;
      gradedCount++;
    }

    // Count pending manual-graded questions (essay + fill-in-blank)
    pendingEssays = 0;
    for (const qid of manualQuestionIds) {
      const manual = manualAnswerByQuestionId.get(qid);
      if (!manual) {
        pendingEssays++;
        continue;
      }
      if (manual.gradingStatus !== GradingStatus.MANUALLY_GRADED) {
        pendingEssays++;
      }
    }

    // If no essays, calculate final score immediately
    if (pendingEssays === 0) {
      await this.calculateFinalScore(attemptId);
    }

    return {
      attemptId,
      totalQuestions: questionBank.length,
      gradedQuestions: gradedCount,
      pendingEssays,
      autoGradedScore,
      maxAutoGradedScore,
    };
  }

  /**
   * Grade an objective question (MC, TF, Fill-in-blank)
   */
  private gradeObjectiveQuestion(
    type: ExamQuestionType,
    selectedOption: number | null,
    answer: string | null,
    correctAnswer: string | null,
    options: string[] | null,
    points: number
  ): { isCorrect: boolean; pointsAwarded: number } {
    if (!correctAnswer) {
      // No correct answer defined - can't auto-grade
      return { isCorrect: false, pointsAwarded: 0 };
    }

    let isCorrect = false;

    const parseOptionToken = (token: string, opts: string[]): number | null => {
      const trimmed = token.trim();
      if (!trimmed) return null;

      // Numeric index: "0", "1", ...
      if (/^\d+$/.test(trimmed)) {
        const idx = Number.parseInt(trimmed, 10);
        return Number.isFinite(idx) && idx >= 0 && idx < opts.length ? idx : null;
      }

      // Letter index: "A", "B", ...
      if (/^[A-Za-z]$/.test(trimmed)) {
        const idx = trimmed.toUpperCase().charCodeAt(0) - 65;
        return idx >= 0 && idx < opts.length ? idx : null;
      }

      // Exact text match as fallback.
      const matchIdx = opts.findIndex((o) => o.trim() === trimmed);
      return matchIdx >= 0 ? matchIdx : null;
    };

    const parseSelections = (raw: string | null, fallbackSelected: number | null, opts: string[]): number[] => {
      const fromRaw =
        typeof raw === 'string' && raw.trim().length > 0
          ? raw
              .split(',')
              .map((part) => parseOptionToken(part, opts))
              .filter((idx): idx is number => idx !== null)
          : [];

      if (fromRaw.length > 0) {
        return Array.from(new Set(fromRaw));
      }

      if (fallbackSelected !== null && fallbackSelected !== undefined) {
        return [fallbackSelected];
      }

      return [];
    };

    const typeRaw = String(type);
    if (typeRaw === 'SINGLE_CHOICE' || type === ExamQuestionType.MULTIPLE_CHOICE) {
      const isSingleChoice = typeRaw === 'SINGLE_CHOICE';
      if (options) {
        const correctIndexes = parseSelections(correctAnswer, null, options);
        const userSelections = parseSelections(answer, selectedOption, options);

        if (correctIndexes.length > 0 && userSelections.length > 0) {
          if (isSingleChoice) {
            isCorrect = userSelections[0] === correctIndexes[0];
          } else {
            const correctSet = new Set(correctIndexes);
            const userSet = new Set(userSelections);
            if (correctSet.size === userSet.size) {
              isCorrect = [...correctSet].every((idx) => userSet.has(idx));
            }
          }
        }
      } else if (isSingleChoice) {
        // Fallback for malformed data without options.
        const user = (answer ?? '').trim();
        const correct = correctAnswer.trim();
        isCorrect = user.length > 0 && user === correct;
      }
    } else if (type === ExamQuestionType.TRUE_FALSE) {
      // Compare boolean answer
      const userAnswer = answer?.toLowerCase().trim();
      const correct = correctAnswer.toLowerCase().trim();
      isCorrect = userAnswer === correct;
    } else {
      isCorrect = false;
    }

    return {
      isCorrect,
      pointsAwarded: isCorrect ? points : 0,
    };
  }

  /**
   * Grade an essay using AI
   */
  async gradeEssayWithAI(answerId: string): Promise<AIGradingResult> {
    const answer = await prisma.examAnswer.findUnique({
      where: { id: answerId },
      include: {
        question: true,
        attempt: {
          include: { exam: true },
        },
      },
    });

    if (!answer) {
      throw new Error('ANSWER_NOT_FOUND');
    }

    const snapshot = await prisma.examAttemptQuestionSnapshot.findFirst({
      where: {
        attemptId: answer.attemptId,
        questionId: answer.questionId,
      },
    });
    const resolvedQuestion = {
      type: snapshot?.type ?? answer.question.type,
      question: snapshot?.question ?? answer.question.question,
      rubric: snapshot?.rubric ?? answer.question.rubric,
      sampleAnswer: snapshot?.sampleAnswer ?? answer.question.sampleAnswer,
      points: snapshot?.points ?? answer.question.points,
    };

    if (resolvedQuestion.type !== ExamQuestionType.ESSAY) {
      throw new Error('NOT_AN_ESSAY');
    }

    const userEssay = answer.answer || '';

    const promptConfig = await AIPromptResolverService.resolve({
      useCase: AIPromptUseCase.EXAM_GRADING_ESSAY,
      courseId: answer.attempt.exam.courseId ?? null,
      examId: answer.attempt.examId,
    });

    const rubricOrDefault =
      resolvedQuestion.rubric || 'No specific rubric provided. Grade based on content accuracy, depth, clarity, and organization.';
    const sampleAnswerOrDefault = resolvedQuestion.sampleAnswer || 'No sample answer provided.';
    const userEssayOrDefault = userEssay || '[No response provided]';

    const userPromptTemplate =
      promptConfig.userPrompt ??
      this.buildEssayGradingPrompt(
        resolvedQuestion.question,
        resolvedQuestion.rubric || '',
        resolvedQuestion.sampleAnswer || '',
        userEssay,
        resolvedQuestion.points
      );

    const prompt =
      promptConfig.userPrompt != null
        ? AIPromptResolverService.render(userPromptTemplate, {
            question: resolvedQuestion.question,
            rubricOrDefault,
            sampleAnswerOrDefault,
            userEssayOrDefault,
            maxPoints: resolvedQuestion.points,
          })
        : userPromptTemplate;

    const messages = [
      { role: 'system' as const, content: promptConfig.systemPrompt },
      { role: 'user' as const, content: prompt },
    ];
    const budget = getChatCompletionsTokenBudget(promptConfig.model, promptConfig.maxTokens);
    const request = {
      model: promptConfig.model,
      messages,
      ...(promptConfig.responseFormat === AIResponseFormat.JSON_OBJECT
        ? { response_format: { type: 'json_object' as const } }
        : {}),
      temperature: promptConfig.temperature,
      ...budget.param,
    };

    const logOpenAiContent = process.env.CSE_OPENAI_LOG_CONTENT === '1';
    log('OpenAI', 'info', 'exam-grading chat.completions request', {
      model: request.model,
      tokenParam: budget.tokenParam,
      requestedMaxTokens: budget.requestedMaxTokens,
      effectiveMaxTokens: budget.effectiveMaxTokens,
      clamped: budget.clamped,
      promptChars: prompt.length,
    });
    if (logOpenAiContent) {
      log('OpenAI', 'debug', 'exam-grading chat.completions request body', { body: request });
    }

    const response = await timeAsync(
      'OpenAI',
      'exam-grading chat.completions response',
      { model: request.model },
      () => this.openai.chat.completions.create(request as any)
    );
    if (logOpenAiContent) {
      log('OpenAI', 'debug', 'exam-grading chat.completions raw response', { response });
    }

    const result = JSON.parse(response.choices[0].message.content || '{}');

    // Clamp score to valid range
    const suggestedScore = Math.max(0, Math.min(result.score || 0, resolvedQuestion.points));
    const confidence = Math.max(0, Math.min(result.confidence || 0.7, 1));

    // Update the answer with AI grading
    await prisma.examAnswer.update({
      where: { id: answerId },
      data: {
        gradingStatus: GradingStatus.AI_SUGGESTED,
        aiSuggestedScore: suggestedScore,
        aiFeedback: result.feedback,
        aiGradedAt: new Date(),
      },
    });

    return {
      answerId,
      suggestedScore,
      maxScore: resolvedQuestion.points,
      feedback: result.feedback || '',
      rubricEvaluation: result.rubricEvaluation || '',
      confidence,
    };
  }

  /**
   * Get system prompt for essay grading
   */
  private getEssayGradingSystemPrompt(): string {
    return `You are an expert essay grader. Your task is to evaluate student essays based on the provided rubric and sample answer.

Guidelines:
1. Be fair and consistent in your grading
2. Provide constructive feedback that helps the student improve
3. Evaluate based on the rubric criteria
4. Consider content accuracy, depth of analysis, clarity, and structure
5. Compare to the sample answer but allow for valid alternative approaches
6. Be specific about what the student did well and what could be improved

Output format: JSON object with these fields:
- score: number (points to award, within the max points)
- feedback: string (detailed feedback for the student)
- rubricEvaluation: string (how the essay meets each rubric criterion)
- confidence: number (0-1, your confidence in this grade)`;
  }

  /**
   * Build essay grading prompt
   */
  private buildEssayGradingPrompt(
    question: string,
    rubric: string,
    sampleAnswer: string,
    userEssay: string,
    maxPoints: number
  ): string {
    return `Please grade the following essay response.

QUESTION:
${question}

RUBRIC:
${rubric || 'No specific rubric provided. Grade based on content accuracy, depth, clarity, and organization.'}

SAMPLE ANSWER (for reference):
${sampleAnswer || 'No sample answer provided.'}

MAXIMUM POINTS: ${maxPoints}

STUDENT'S ESSAY:
${userEssay || '[No response provided]'}

Please evaluate this essay and provide a score out of ${maxPoints} points, along with detailed feedback.`;
  }

  /**
   * Finalize essay grade (admin approval/modification)
   */
  async finalizeEssayGrade(
    answerId: string,
    adminId: string,
    score: number,
    feedback?: string
  ): Promise<void> {
    const answer = await prisma.examAnswer.findUnique({
      where: { id: answerId },
      include: {
        question: true,
        attempt: {
          include: {
            questionSnapshots: true,
          },
        },
      },
    });

    if (!answer) {
      throw new Error('ANSWER_NOT_FOUND');
    }

    const snapshot = answer.attempt.questionSnapshots.find((s) => s.questionId === answer.questionId);
    const questionType = snapshot?.type ?? answer.question.type;
    const questionPoints = snapshot?.points ?? answer.question.points;

    if (
      questionType !== ExamQuestionType.ESSAY &&
      questionType !== ExamQuestionType.FILL_IN_BLANK &&
      questionType !== ExamQuestionType.EXERCISE
    ) {
      throw new Error('NOT_MANUAL_GRADEABLE');
    }

    // Clamp score to valid range
    const finalScore = Math.max(0, Math.min(score, questionPoints));

    await prisma.examAnswer.update({
      where: { id: answerId },
      data: {
        pointsAwarded: finalScore,
        isCorrect: finalScore > 0,
        gradingStatus: GradingStatus.MANUALLY_GRADED,
        adminFeedback: feedback,
        adminGradedById: adminId,
        adminGradedAt: new Date(),
      },
    });

    // Check if all essays are now graded
    const attemptAnswers = await prisma.examAnswer.findMany({
      where: { attemptId: answer.attemptId },
      include: { question: true },
    });
    const snapshotByQuestionId = new Map(
      answer.attempt.questionSnapshots.map((s) => [s.questionId, s] as const)
    );
    const pendingEssays = attemptAnswers.filter((a) => {
      const type = snapshotByQuestionId.get(a.questionId)?.type ?? a.question.type;
      const isManual =
        type === ExamQuestionType.ESSAY ||
        type === ExamQuestionType.FILL_IN_BLANK ||
        type === ExamQuestionType.EXERCISE;
      if (!isManual) return false;
      return a.gradingStatus === GradingStatus.PENDING || a.gradingStatus === GradingStatus.AI_SUGGESTED;
    }).length;

    // If all essays graded, calculate final score
    if (pendingEssays === 0) {
      await this.calculateFinalScore(answer.attemptId);
    }
  }

  /**
   * Calculate final score for an attempt
   */
  async calculateFinalScore(attemptId: string): Promise<FinalScoreResult> {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: true,
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!attempt) {
      throw new Error('ATTEMPT_NOT_FOUND');
    }

    // Sum all awarded points
    let rawScore = 0;
    for (const answer of attempt.answers) {
      rawScore += answer.pointsAwarded || 0;
    }

    const totalScore = attempt.exam.totalScore;
    const passingScore = attempt.exam.passingScore;
    const percentageScore = totalScore > 0 ? (rawScore / totalScore) * 100 : 0;
    const passed = rawScore >= passingScore;

    // Update attempt with final scores
    await prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        rawScore,
        percentageScore,
        passed,
        status: ExamAttemptStatus.GRADED,
        essaysGraded: true,
      },
    });

    if (passed) {
      try {
        await CertificateService.autoIssueForAttempt(attemptId);
      } catch (error) {
        log('API', 'error', 'certificate auto-issue failed', {
          attemptId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      attemptId,
      rawScore,
      percentageScore,
      passed,
      totalScore,
      passingScore,
    };
  }

  /**
   * Get all essays pending grading for an exam
   */
  async getPendingEssays(examId: string): Promise<Array<{
    answerId: string;
    attemptId: string;
    questionId: string;
    question: string;
    rubric: string | null;
    sampleAnswer: string | null;
    maxPoints: number;
    userAnswer: string | null;
    aiSuggestedScore: number | null;
    aiFeedback: string | null;
    userName: string;
    submittedAt: Date | null;
  }>> {
    const answers = await prisma.examAnswer.findMany({
      where: { attempt: { examId } },
      include: {
        question: true,
        attempt: {
          include: {
            questionSnapshots: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: [
        { attempt: { submittedAt: 'asc' } },
        { question: { order: 'asc' } },
      ],
    });

    return answers
      .filter((answer) => {
        const snapshot = answer.attempt.questionSnapshots.find((s) => s.questionId === answer.questionId);
        const type = snapshot?.type ?? answer.question.type;
        return (
          type === ExamQuestionType.ESSAY &&
          (answer.gradingStatus === GradingStatus.PENDING ||
            answer.gradingStatus === GradingStatus.AI_SUGGESTED)
        );
      })
      .map(answer => {
        const snapshot = answer.attempt.questionSnapshots.find((s) => s.questionId === answer.questionId);
        return {
          answerId: answer.id,
          attemptId: answer.attemptId,
          questionId: answer.questionId,
          question: snapshot?.question ?? answer.question.question,
          rubric: snapshot?.rubric ?? answer.question.rubric,
          sampleAnswer: snapshot?.sampleAnswer ?? answer.question.sampleAnswer,
          maxPoints: snapshot?.points ?? answer.question.points,
          userAnswer: answer.answer,
          aiSuggestedScore: answer.aiSuggestedScore,
          aiFeedback: answer.aiFeedback,
          userName: answer.attempt.user.name || answer.attempt.user.email,
          submittedAt: answer.attempt.submittedAt,
        };
      });
  }

  /**
   * Batch grade all essays for an attempt with AI
   */
  async batchGradeEssaysWithAI(attemptId: string): Promise<AIGradingResult[]> {
    const answers = await prisma.examAnswer.findMany({
      where: {
        attemptId,
      },
      include: {
        question: true,
        attempt: { include: { questionSnapshots: true } },
      },
    });

    const results: AIGradingResult[] = [];

    for (const answer of answers) {
      const snapshot = answer.attempt.questionSnapshots.find((s) => s.questionId === answer.questionId);
      const type = snapshot?.type ?? answer.question.type;
      if (type !== ExamQuestionType.ESSAY || answer.gradingStatus !== GradingStatus.PENDING) {
        continue;
      }
      try {
        const result = await this.gradeEssayWithAI(answer.id);
        results.push(result);
      } catch (error) {
        console.error(`Failed to AI-grade essay ${answer.id}:`, error);
      }
    }

    return results;
  }

  /**
   * Get grading summary for an attempt
   */
  async getGradingSummary(attemptId: string): Promise<{
    totalQuestions: number;
    autoGraded: number;
    aiSuggested: number;
    manuallyGraded: number;
    pending: number;
    isComplete: boolean;
    rawScore: number;
    maxScore: number;
  }> {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: true,
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!attempt) {
      throw new Error('ATTEMPT_NOT_FOUND');
    }

    let autoGraded = 0;
    let aiSuggested = 0;
    let manuallyGraded = 0;
    let pending = 0;
    let rawScore = 0;

    for (const answer of attempt.answers) {
      switch (answer.gradingStatus) {
        case GradingStatus.AUTO_GRADED:
          autoGraded++;
          rawScore += answer.pointsAwarded || 0;
          break;
        case GradingStatus.AI_SUGGESTED:
          aiSuggested++;
          break;
        case GradingStatus.MANUALLY_GRADED:
          manuallyGraded++;
          rawScore += answer.pointsAwarded || 0;
          break;
        default:
          pending++;
      }
    }

    return {
      totalQuestions: attempt.answers.length,
      autoGraded,
      aiSuggested,
      manuallyGraded,
      pending,
      isComplete: pending === 0 && aiSuggested === 0,
      rawScore,
      maxScore: attempt.exam.totalScore,
    };
  }
}
