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
  Prisma,
} from '@prisma/client';
import { ExamGradingService } from '@/lib/services/exam-grading.service';
import { FileService } from '@/lib/services/file.service';
import { resolveRichTextAssetUrls } from '@/lib/rich-text';
import { parseEssayAIGradingBreakdown, parseEssayGradingCriteria } from '@/lib/essay-grading';

export interface StartAttemptResult {
  attemptId: string;
  examId: string;
  examVersion?: number;
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
      attachmentFilename?: string | null;
      attachmentMimeType?: string | null;
      attachmentUrl?: string | null;
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
    aiSuggestedScore: number | null;
    aiFeedback: string | null;
    aiGradingBreakdown: ReturnType<typeof parseEssayAIGradingBreakdown>;
    adminScore: number | null;
    adminFeedback: string | null;
    question: {
      id: string;
      type: ExamQuestionType;
      question: string;
      options: string[] | null;
      correctAnswer: string | null;
      explanation: string | null;
      points: number;
      rubric: string | null;
      sampleAnswer: string | null;
      gradingCriteria: ReturnType<typeof parseEssayGradingCriteria>;
      attachmentS3Key: string | null;
      attachmentFilename: string | null;
      attachmentMimeType: string | null;
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
  private static async getAttemptQuestionSet(
    attemptId: string,
    examId: string
  ): Promise<
    Array<{
      id: string;
      type: ExamQuestionType;
      question: string;
      options: string[] | null;
      correctAnswer: string | null;
      explanation: string | null;
      points: number;
      order: number;
      maxWords: number | null;
      attachmentS3Key: string | null;
      attachmentFilename: string | null;
      attachmentMimeType: string | null;
      attachmentUrl: string | null;
    }>
  > {
    const snapshots = await prisma.examAttemptQuestionSnapshot.findMany({
      where: { attemptId },
      orderBy: { order: 'asc' },
    });

    if (snapshots.length > 0) {
      const currentQuestions = await prisma.examQuestion.findMany({
        where: {
          examId,
          archivedAt: null,
          id: { in: snapshots.map((snapshot) => snapshot.questionId) },
        },
        select: {
          id: true,
          attachmentS3Key: true,
          attachmentFilename: true,
          attachmentMimeType: true,
        },
      });
      const currentQuestionMap = new Map(currentQuestions.map((question) => [question.id, question] as const));

      return Promise.all(
        snapshots.map(async (q) => {
          const currentQuestion = currentQuestionMap.get(q.questionId);
          const attachmentS3Key = q.attachmentS3Key ?? currentQuestion?.attachmentS3Key ?? null;
          const attachmentFilename = q.attachmentFilename ?? currentQuestion?.attachmentFilename ?? null;
          const attachmentMimeType = q.attachmentMimeType ?? currentQuestion?.attachmentMimeType ?? null;
          const [question, explanation, attachmentUrl] = await Promise.all([
            resolveRichTextAssetUrls(q.question, (key) => FileService.getAssetAccessUrl(key)),
            resolveRichTextAssetUrls(q.explanation, (key) => FileService.getAssetAccessUrl(key)),
            attachmentS3Key ? FileService.getAssetAccessUrl(attachmentS3Key) : Promise.resolve(null),
          ]);

          return {
            id: q.questionId,
            type: q.type,
            question: question ?? q.question,
            options: (q.options as string[] | null) ?? null,
            correctAnswer: q.correctAnswer,
            explanation: explanation ?? q.explanation,
            points: q.points,
            order: q.order,
            maxWords: q.maxWords,
            attachmentS3Key,
            attachmentFilename,
            attachmentMimeType,
            attachmentUrl,
          };
        })
      );
    }

    const questions = await prisma.examQuestion.findMany({
      where: { examId, archivedAt: null },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        type: true,
        question: true,
        options: true,
        correctAnswer: true,
        explanation: true,
        points: true,
        order: true,
        maxWords: true,
        attachmentS3Key: true,
        attachmentFilename: true,
        attachmentMimeType: true,
      },
    });
    return Promise.all(questions.map(async (q) => {
      const [question, explanation, attachmentUrl] = await Promise.all([
        resolveRichTextAssetUrls(q.question, (key) => FileService.getAssetAccessUrl(key)),
        resolveRichTextAssetUrls(q.explanation, (key) => FileService.getAssetAccessUrl(key)),
        q.attachmentS3Key ? FileService.getAssetAccessUrl(q.attachmentS3Key) : Promise.resolve(null),
      ])

      return {
        ...q,
        question: question ?? q.question,
        explanation: explanation ?? q.explanation,
        options: (q.options as string[] | null) ?? null,
        attachmentUrl,
      }
    }));
  }

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
          where: { archivedAt: null },
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
        const snapshotQuestions = await this.getAttemptQuestionSet(existingAttempt.id, exam.id);
        return this.buildAttemptResult(existingAttempt, exam, snapshotQuestions);
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
        examVersion: exam.version,
        expiresAt,
        hasEssays,
        ipAddress,
        userAgent,
      },
    });

    await prisma.examAttemptQuestionSnapshot.createMany({
      data: exam.questions.map((q) => ({
        attemptId: attempt.id,
        examId: exam.id,
        examVersion: exam.version,
        questionId: q.id,
        type: q.type,
        difficulty: q.difficulty,
        question: q.question,
        options: q.options ?? Prisma.JsonNull,
        correctAnswer: q.correctAnswer,
        rubric: q.rubric,
        sampleAnswer: q.sampleAnswer,
        gradingCriteria: q.gradingCriteria ?? Prisma.JsonNull,
        maxWords: q.maxWords,
        attachmentS3Key: q.attachmentS3Key,
        attachmentFilename: q.attachmentFilename,
        attachmentMimeType: q.attachmentMimeType,
        points: q.points,
        explanation: q.explanation,
        topic: q.topic,
        tags: q.tags,
        order: q.order,
      })),
      skipDuplicates: true,
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

    const snapshotQuestions = await this.getAttemptQuestionSet(attempt.id, exam.id);
    return this.buildAttemptResult(attempt, exam, snapshotQuestions);
  }

  /**
   * Build attempt result with questions
   */
  private static buildAttemptResult(
    attempt: any,
    exam: any,
    baseQuestions: Array<{
      id: string;
      type: ExamQuestionType;
      question: string;
      options: string[] | null;
      points: number;
      order: number;
      maxWords: number | null;
      attachmentFilename: string | null;
      attachmentMimeType: string | null;
      attachmentUrl: string | null;
    }>
  ): StartAttemptResult {
    // Optionally randomize questions
    let questions = [...baseQuestions];
    if (exam.randomizeQuestions) {
      questions = this.shuffleArray(questions);
    }

    return {
      attemptId: attempt.id,
      examId: exam.id,
      examVersion: attempt.examVersion ?? exam.version ?? 1,
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
          attachmentFilename: q.attachmentFilename || undefined,
          attachmentMimeType: q.attachmentMimeType || undefined,
          attachmentUrl: q.attachmentUrl || undefined,
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
    const snapshotQuestion = await prisma.examAttemptQuestionSnapshot.findFirst({
      where: {
        attemptId,
        questionId: input.questionId,
      },
      select: { type: true },
    });
    const question =
      snapshotQuestion ??
      (await prisma.examQuestion.findFirst({
        where: {
          id: input.questionId,
          examId: attempt.examId,
        },
        select: { type: true },
      }));

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
          select: {
            id: true,
            title: true,
            totalScore: true,
            passingScore: true,
            showResultsImmediately: true,
            allowReview: true,
          },
        },
        answers: { select: { questionId: true } },
        questionSnapshots: {
          orderBy: { order: 'asc' },
          select: { questionId: true },
        },
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
    const questionIdsFromSnapshot = attempt.questionSnapshots.map((q) => q.questionId);
    const questionIds =
      questionIdsFromSnapshot.length > 0
        ? questionIdsFromSnapshot
        : (
            await prisma.examQuestion.findMany({
              where: { examId: attempt.examId, archivedAt: null },
              select: { id: true },
              orderBy: { order: 'asc' },
            })
          ).map((q) => q.id);
    const missingQuestionIds = questionIds.filter((qid) => !existingAnswerQids.has(qid));
    if (missingQuestionIds.length > 0) {
      await prisma.examAnswer.createMany({
        data: missingQuestionIds.map((qid) => ({
          attemptId,
          questionId: qid,
        })),
        skipDuplicates: true,
      });
    }

    // Auto-grade objective questions immediately on submission.
    // Only Multiple Choice + True/False are auto-graded; other types remain pending.
    try {
      const gradingService = new ExamGradingService();
      const gradingResult = await gradingService.gradeAttempt(attemptId);
      if (gradingResult.pendingEssays > 0) {
        await gradingService.batchGradeEssaysWithAI(attemptId);
      }
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
          include: { question: true },
        },
        questionSnapshots: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!attempt) {
      throw new Error('ATTEMPT_NOT_FOUND');
    }

    const snapshotByQuestionId = new Map(
      attempt.questionSnapshots.map((q) => [q.questionId, q] as const)
    );

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
      answers: await Promise.all(attempt.answers.map(async (a) => {
        const snapshot = snapshotByQuestionId.get(a.questionId)
        const [answer, question, explanation] = await Promise.all([
          resolveRichTextAssetUrls(a.answer, (key) => FileService.getAssetAccessUrl(key)),
          resolveRichTextAssetUrls(snapshot?.question ?? a.question.question, (key) => FileService.getAssetAccessUrl(key)),
          resolveRichTextAssetUrls(snapshot?.explanation ?? a.question.explanation, (key) => FileService.getAssetAccessUrl(key)),
        ])

        return {
          id: a.id,
          questionId: a.questionId,
          answer: answer ?? null,
          selectedOption: a.selectedOption,
          recordingS3Key: a.recordingS3Key,
          recordingMimeType: a.recordingMimeType,
          recordingSizeBytes: a.recordingSizeBytes,
          recordingDurationSeconds: a.recordingDurationSeconds,
          recordingStatus: a.recordingStatus,
          gradingStatus: a.gradingStatus,
          isCorrect: a.isCorrect,
          pointsAwarded: a.pointsAwarded,
          aiSuggestedScore: a.aiSuggestedScore,
          aiFeedback: a.aiFeedback,
          aiGradingBreakdown: parseEssayAIGradingBreakdown(a.aiGradingBreakdown),
          adminScore: a.adminScore,
          adminFeedback: a.adminFeedback,
          question: {
            id: a.questionId,
            type: snapshot?.type ?? a.question.type,
            question: question ?? (snapshot?.question ?? a.question.question),
            options:
              (snapshot?.options as string[] | null) ??
              (a.question.options as string[] | null),
            correctAnswer:
              snapshot?.correctAnswer ?? a.question.correctAnswer,
            explanation: explanation ?? (snapshot?.explanation ?? a.question.explanation),
            points: snapshot?.points ?? a.question.points,
            rubric: snapshot?.rubric ?? a.question.rubric,
            sampleAnswer: snapshot?.sampleAnswer ?? a.question.sampleAnswer,
            gradingCriteria: parseEssayGradingCriteria(
              snapshot?.gradingCriteria ?? a.question.gradingCriteria
            ),
            attachmentS3Key:
              snapshot?.attachmentS3Key ?? a.question.attachmentS3Key,
            attachmentFilename:
              snapshot?.attachmentFilename ?? a.question.attachmentFilename,
            attachmentMimeType:
              snapshot?.attachmentMimeType ?? a.question.attachmentMimeType,
          },
        }
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
              where: { archivedAt: null },
              orderBy: { order: 'asc' },
            },
          },
        },
        questionSnapshots: {
          orderBy: { order: 'asc' },
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

    const snapshotQuestions = await this.getAttemptQuestionSet(attempt.id, examId);
    const result = this.buildAttemptResult(attempt, attempt.exam, snapshotQuestions);

    // Include existing answers
    const existingAnswersEntries = await Promise.all(
      attempt.answers.map(async (ans) => [
        ans.questionId,
        {
          answer: await resolveRichTextAssetUrls(ans.answer, (key) => FileService.getAssetAccessUrl(key)),
          selectedOption: ans.selectedOption,
          recordingS3Key: ans.recordingS3Key ?? null,
          recordingStatus: ans.recordingStatus ?? null,
        },
      ] as const)
    )

    return {
      ...result,
      existingAnswers: Object.fromEntries(existingAnswersEntries) as CurrentAttemptResult['existingAnswers'],
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
