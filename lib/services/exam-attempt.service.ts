/**
 * Exam Attempt Service
 * Manages user exam sessions, answers, and submissions
 */

import prisma from '@/lib/prisma';
import {
  ExamAttemptStatus,
  ExamStatus,
  ExamQuestionType,
  ExamRecordingStatus,
  GradingStatus,
} from '@prisma/client';
import { ExamGradingService } from '@/lib/services/exam-grading.service';

export interface StartAttemptResult {
  attemptId: string;
  examId: string;
  attemptNumber: number;
  startedAt: Date;
  expiresAt: Date | null;
  questions: Array<{
    id: string;
    type: ExamQuestionType;
    question: string;
    options: string[] | null;
    points: number;
    order: number;
    maxWords?: number;
  }>;
  timeLimit: number | null;
  totalQuestions: number;
}

export interface CurrentAttemptResult extends StartAttemptResult {
  existingAnswers: Record<
    string,
    {
      answer: string | null;
      selectedOption: number | null;
      recordingS3Key: string | null;
      recordingStatus: ExamRecordingStatus | null;
    }
  >;
}

export interface SaveAnswerInput {
  questionId: string;
  answer?: string;
  selectedOption?: number;
}

export interface AttemptWithAnswers {
  id: string;
  examId: string;
  userId: string;
  attemptNumber: number;
  status: ExamAttemptStatus;
  startedAt: Date;
  submittedAt: Date | null;
  expiresAt: Date | null;
  rawScore: number | null;
  percentageScore: number | null;
  passed: boolean | null;
  answers: Array<{
    id: string;
    questionId: string;
    answer: string | null;
    selectedOption: number | null;
    recordingS3Key: string | null;
    recordingMimeType: string | null;
    recordingSizeBytes: number | null;
    recordingDurationSeconds: number | null;
    recordingStatus: ExamRecordingStatus | null;
    gradingStatus: GradingStatus;
    isCorrect: boolean | null;
    pointsAwarded: number | null;
    question: {
      id: string;
      type: ExamQuestionType;
      question: string;
      options: string[] | null;
      correctAnswer: string | null;
      explanation: string | null;
      points: number;
    };
  }>;
  exam: {
    id: string;
    title: string;
    totalScore: number;
    passingScore: number;
    showResultsImmediately: boolean;
    allowReview: boolean;
  };
}

export class ExamAttemptService {
  /**
   * Start a new exam attempt or resume existing one
   */
  static async startAttempt(
    userId: string,
    examId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<StartAttemptResult> {
    // Get exam with questions
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
        invitations: {
          where: { userId },
        },
        course: {
          include: {
            enrollments: {
              where: { userId },
            },
          },
        },
      },
    });

    if (!exam) {
      throw new Error('EXAM_NOT_FOUND');
    }

    // Check exam is published
    if (exam.status !== ExamStatus.PUBLISHED) {
      throw new Error('EXAM_NOT_PUBLISHED');
    }

    // Check availability window
    const now = new Date();
    if (exam.availableFrom && exam.availableFrom > now) {
      throw new Error('EXAM_NOT_AVAILABLE_YET');
    }
    if (exam.deadline && exam.deadline < now) {
      throw new Error('EXAM_DEADLINE_PASSED');
    }

    // Check access (invitation required)
    const hasInvitation = exam.invitations.length > 0;
    if (!hasInvitation) {
      throw new Error('NO_ACCESS');
    }

    // Check for existing in-progress attempt
    const existingAttempt = await prisma.examAttempt.findFirst({
      where: {
        userId,
        examId,
        status: ExamAttemptStatus.IN_PROGRESS,
      },
    });

    if (existingAttempt) {
      // Check if expired
      if (existingAttempt.expiresAt && existingAttempt.expiresAt < now) {
        // Auto-submit expired attempt
        await this.submitAttempt(existingAttempt.id);
      } else {
        // Resume existing attempt
        return this.buildAttemptResult(existingAttempt, exam);
      }
    }

    // Check attempt limit
    const completedAttempts = await prisma.examAttempt.count({
      where: {
        userId,
        examId,
        status: {
          in: [ExamAttemptStatus.SUBMITTED, ExamAttemptStatus.GRADED],
        },
      },
    });

    if (completedAttempts >= exam.maxAttempts) {
      throw new Error('MAX_ATTEMPTS_REACHED');
    }

    // Calculate expiry time
    let expiresAt: Date | null = null;
    if (exam.timeLimit) {
      expiresAt = new Date(now.getTime() + exam.timeLimit * 60 * 1000);
    }

    // Check if any questions require manual grading (not auto-graded).
    const hasEssays = exam.questions.some(
      (q) =>
        q.type === ExamQuestionType.ESSAY ||
        q.type === ExamQuestionType.FILL_IN_BLANK ||
        q.type === ExamQuestionType.EXERCISE
    );

    // Create new attempt
    const attempt = await prisma.examAttempt.create({
      data: {
        userId,
        examId,
        attemptNumber: completedAttempts + 1,
        status: ExamAttemptStatus.IN_PROGRESS,
        expiresAt,
        hasEssays,
        ipAddress,
        userAgent,
      },
    });

    // Mark invitation as viewed
    if (hasInvitation) {
      await prisma.examInvitation.updateMany({
        where: {
          examId,
          userId,
          viewed: false,
        },
        data: {
          viewed: true,
          viewedAt: now,
        },
      });
    }

    return this.buildAttemptResult(attempt, exam);
  }

  /**
   * Build attempt result with questions
   */
  private static buildAttemptResult(
    attempt: any,
    exam: any
  ): StartAttemptResult {
    // Optionally randomize questions
    let questions = [...exam.questions];
    if (exam.randomizeQuestions) {
      questions = this.shuffleArray(questions);
    }

    return {
      attemptId: attempt.id,
      examId: exam.id,
      attemptNumber: attempt.attemptNumber,
      startedAt: attempt.startedAt,
      expiresAt: attempt.expiresAt,
      timeLimit: exam.timeLimit,
      totalQuestions: questions.length,
      questions: questions.map(q => {
        let options = q.options as string[] | null;
        // Optionally randomize options for MC questions
        if (
          exam.randomizeOptions &&
          options &&
          q.type === ExamQuestionType.MULTIPLE_CHOICE
        ) {
          options = this.shuffleArray([...options]);
        }

        return {
          id: q.id,
          type: q.type,
          question: q.question,
          options,
          points: q.points,
          order: q.order,
          maxWords: q.maxWords || undefined,
        };
      }),
    };
  }

  /**
   * Shuffle array (Fisher-Yates algorithm)
   */
  private static shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Save answer for a question (auto-save)
   */
  static async saveAnswer(
    attemptId: string,
    input: SaveAnswerInput
  ): Promise<void> {
    // Get attempt
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
    });

    if (!attempt) {
      throw new Error('ATTEMPT_NOT_FOUND');
    }

    if (attempt.status !== ExamAttemptStatus.IN_PROGRESS) {
      throw new Error('ATTEMPT_NOT_IN_PROGRESS');
    }

    // Check if expired
    if (attempt.expiresAt && attempt.expiresAt < new Date()) {
      throw new Error('ATTEMPT_EXPIRED');
    }

    // Verify question belongs to this exam
    const question = await prisma.examQuestion.findFirst({
      where: {
        id: input.questionId,
        examId: attempt.examId,
      },
    });

    if (!question) {
      throw new Error('QUESTION_NOT_FOUND');
    }

    if (question.type === ExamQuestionType.EXERCISE) {
      throw new Error('EXERCISE_ANSWER_MUST_USE_UPLOAD');
    }

    // Upsert answer
    await prisma.examAnswer.upsert({
      where: {
        attemptId_questionId: {
          attemptId,
          questionId: input.questionId,
        },
      },
      create: {
        attemptId,
        questionId: input.questionId,
        answer: input.answer,
        selectedOption: input.selectedOption,
        answeredAt: new Date(),
      },
      update: {
        answer: input.answer,
        selectedOption: input.selectedOption,
        answeredAt: new Date(),
      },
    });

    // Update last saved time
    await prisma.examAttempt.update({
      where: { id: attemptId },
      data: { lastSavedAt: new Date() },
    });
  }

  /**
   * Submit exam attempt
   */
  static async submitAttempt(attemptId: string): Promise<AttemptWithAnswers> {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          include: {
            questions: true,
          },
        },
        answers: true,
      },
    });

    if (!attempt) {
      throw new Error('ATTEMPT_NOT_FOUND');
    }

    if (attempt.status !== ExamAttemptStatus.IN_PROGRESS) {
      throw new Error('ATTEMPT_ALREADY_SUBMITTED');
    }

    // Update attempt status
    await prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        status: ExamAttemptStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    });

    // Ensure there is an answer row for every question so unanswered questions
    // are treated as incorrect (0 points) during auto-grading and show up in review UIs.
    const existingAnswerQids = new Set(attempt.answers.map((a) => a.questionId));
    const missingQuestions = attempt.exam.questions.filter((q) => !existingAnswerQids.has(q.id));
    if (missingQuestions.length > 0) {
      await prisma.examAnswer.createMany({
        data: missingQuestions.map((q) => ({
          attemptId,
          questionId: q.id,
        })),
        skipDuplicates: true,
      });
    }

    // Auto-grade objective questions immediately on submission.
    // Only Multiple Choice + True/False are auto-graded; other types remain pending.
    try {
      const gradingService = new ExamGradingService();
      await gradingService.gradeAttempt(attemptId);
    } catch (error) {
      // Do not fail submission if auto-grading fails; admins can re-run grading.
      console.error('Auto-grade on submit failed:', error);
    }

    // Return full attempt with answers
    return this.getAttemptWithAnswers(attemptId);
  }

  /**
   * Get attempt with all answers
   */
  static async getAttemptWithAnswers(
    attemptId: string
  ): Promise<AttemptWithAnswers> {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            totalScore: true,
            passingScore: true,
            showResultsImmediately: true,
            allowReview: true,
          },
        },
        answers: {
          include: {
            question: {
              select: {
                id: true,
                type: true,
                question: true,
                options: true,
                correctAnswer: true,
                explanation: true,
                points: true,
              },
            },
          },
        },
      },
    });

    if (!attempt) {
      throw new Error('ATTEMPT_NOT_FOUND');
    }

    return {
      id: attempt.id,
      examId: attempt.examId,
      userId: attempt.userId,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      expiresAt: attempt.expiresAt,
      rawScore: attempt.rawScore,
      percentageScore: attempt.percentageScore,
      passed: attempt.passed,
      exam: attempt.exam,
      answers: attempt.answers.map(a => ({
        id: a.id,
        questionId: a.questionId,
        answer: a.answer,
        selectedOption: a.selectedOption,
        recordingS3Key: a.recordingS3Key,
        recordingMimeType: a.recordingMimeType,
        recordingSizeBytes: a.recordingSizeBytes,
        recordingDurationSeconds: a.recordingDurationSeconds,
        recordingStatus: a.recordingStatus,
        gradingStatus: a.gradingStatus,
        isCorrect: a.isCorrect,
        pointsAwarded: a.pointsAwarded,
        question: {
          id: a.question.id,
          type: a.question.type,
          question: a.question.question,
          options: a.question.options as string[] | null,
          correctAnswer: a.question.correctAnswer,
          explanation: a.question.explanation,
          points: a.question.points,
        },
      })),
    };
  }

  /**
   * Get user's attempts for an exam
   */
  static async getUserAttempts(
    userId: string,
    examId: string
  ): Promise<Array<{
    id: string;
    attemptNumber: number;
    status: ExamAttemptStatus;
    startedAt: Date;
    submittedAt: Date | null;
    percentageScore: number | null;
    passed: boolean | null;
  }>> {
    const attempts = await prisma.examAttempt.findMany({
      where: {
        userId,
        examId,
      },
      orderBy: { attemptNumber: 'desc' },
      select: {
        id: true,
        attemptNumber: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        percentageScore: true,
        passed: true,
      },
    });

    return attempts;
  }

  /**
   * Get current in-progress attempt
   */
  static async getCurrentAttempt(
    userId: string,
    examId: string
  ): Promise<CurrentAttemptResult | null> {
    const attempt = await prisma.examAttempt.findFirst({
      where: {
        userId,
        examId,
        status: ExamAttemptStatus.IN_PROGRESS,
      },
      include: {
        exam: {
          include: {
            questions: {
              orderBy: { order: 'asc' },
            },
          },
        },
        answers: true,
      },
    });

    if (!attempt) {
      return null;
    }

    // Check if expired
    if (attempt.expiresAt && attempt.expiresAt < new Date()) {
      // Auto-submit expired attempt
      await this.submitAttempt(attempt.id);
      return null;
    }

    const result = this.buildAttemptResult(attempt, attempt.exam);

    // Include existing answers
    return {
      ...result,
      existingAnswers: attempt.answers.reduce((acc, ans) => {
        acc[ans.questionId] = {
          answer: ans.answer,
          selectedOption: ans.selectedOption,
          recordingS3Key: ans.recordingS3Key ?? null,
          recordingStatus: ans.recordingStatus ?? null,
        };
        return acc;
      }, {} as CurrentAttemptResult['existingAnswers']),
    };
  }

  /**
   * Check if attempt is expired and auto-submit if needed
   */
  static async checkAndSubmitExpired(attemptId: string): Promise<boolean> {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
    });

    if (!attempt) {
      return false;
    }

    if (
      attempt.status === ExamAttemptStatus.IN_PROGRESS &&
      attempt.expiresAt &&
      attempt.expiresAt < new Date()
    ) {
      await this.submitAttempt(attemptId);
      return true;
    }

    return false;
  }
}
