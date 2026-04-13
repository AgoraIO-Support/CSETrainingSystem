/**
 * Exam Service
 * CRUD operations and business logic for exams
 */

import prisma from '@/lib/prisma';
import {
  ExamStatus,
  ExamType,
  ExamQuestionType,
  DifficultyLevel,
  Prisma,
  AssessmentKind,
  LearningEventFormat,
  LearningSeriesType,
} from '@prisma/client';
import { FileService } from '@/lib/services/file.service';
import { ASSET_S3_BUCKET_NAME, S3_BUCKET_NAME } from '@/lib/aws-s3';
import { resolveRichTextAssetUrls } from '@/lib/rich-text';
import type { EssayGradingCriterion } from '@/lib/essay-grading';

// Input types
export interface CreateExamInput {
  examType: ExamType;
  courseId?: string;
  title: string;
  description?: string;
  instructions?: string;
  timeLimit?: number;
  timezone: string;
  deadline?: Date;
  availableFrom?: Date;
  totalScore?: number;
  passingScore?: number;
  randomizeQuestions?: boolean;
  randomizeOptions?: boolean;
  showResultsImmediately?: boolean;
  allowReview?: boolean;
  maxAttempts?: number;
  assessmentKind?: AssessmentKind;
  productDomainId?: string | null;
  learningSeriesId?: string | null;
  learningEventId?: string | null;
  sourceLearningEventId?: string | null;
  awardsStars?: boolean;
  starValue?: number | null;
  countsTowardPerformance?: boolean;
}

export interface UpdateExamInput {
  title?: string;
  description?: string;
  instructions?: string;
  timeLimit?: number;
  timezone?: string;
  deadline?: Date | null;
  availableFrom?: Date | null;
  totalScore?: number;
  passingScore?: number;
  randomizeQuestions?: boolean;
  randomizeOptions?: boolean;
  showResultsImmediately?: boolean;
  allowReview?: boolean;
  maxAttempts?: number;
}

export interface CreateQuestionInput {
  type: ExamQuestionType;
  difficulty?: DifficultyLevel;
  question: string;
  options?: string[];
  correctAnswer?: string;
  rubric?: string;
  sampleAnswer?: string;
  gradingCriteria?: EssayGradingCriterion[] | null;
  maxWords?: number;
  attachmentS3Key?: string | null;
  attachmentFilename?: string | null;
  attachmentMimeType?: string | null;
  points?: number;
  explanation?: string;
  topic?: string;
  tags?: string[];
  isAIGenerated?: boolean;
  aiModel?: string;
  generationPrompt?: string;
}

export interface ExamListParams {
  page?: number;
  limit?: number;
  status?: ExamStatus;
  examType?: ExamType;
  courseId?: string;
  createdById?: string;
  search?: string;
}

// Response types
export interface ExamWithDetails {
  id: string;
  examType: ExamType;
  courseId: string | null;
  course: {
    id: string;
    title: string;
    slug: string;
  } | null;
  title: string;
  description: string | null;
  instructions: string | null;
  status: ExamStatus;
  timeLimit: number | null;
  timezone: string;
  deadline: Date | null;
  availableFrom: Date | null;
  totalScore: number;
  passingScore: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  showResultsImmediately: boolean;
  allowReview: boolean;
  maxAttempts: number;
  assessmentKind?: AssessmentKind;
  productDomainId?: string | null;
  learningSeriesId?: string | null;
  learningEventId?: string | null;
  awardsStars?: boolean;
  starValue?: number | null;
  countsTowardPerformance?: boolean;
  certificateEligible?: boolean;
  version: number;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  approvedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  closedAt: Date | null;
  _count: {
    questions: number;
    attempts: number;
    materials: number;
    invitations: number;
  };
}

export class ExamService {
  private static resolveAssessmentKindFromEvent(event: {
    countsTowardPerformance: boolean
    format: LearningEventFormat
    series?: { type: LearningSeriesType } | null
  }): AssessmentKind {
    if (
      event.countsTowardPerformance ||
      event.format === 'FINAL_EXAM' ||
      event.series?.type === 'QUARTERLY_FINAL' ||
      event.series?.type === 'YEAR_END_FINAL'
    ) {
      return 'FORMAL'
    }

    if (
      event.format === 'RELEASE_BRIEFING' ||
      event.series?.type === 'RELEASE_READINESS'
    ) {
      return 'READINESS'
    }

    return 'PRACTICE'
  }
  private static async enrichQuestionWithAttachmentUrl<T extends {
    attachmentS3Key?: string | null;
    question?: string | null;
    explanation?: string | null;
  }>(question: T): Promise<T & { attachmentUrl: string | null }> {
    const [resolvedQuestion, resolvedExplanation, attachmentUrl] = await Promise.all([
      question.question
        ? resolveRichTextAssetUrls(question.question, (key) => FileService.getAssetAccessUrl(key))
        : Promise.resolve(question.question),
      question.explanation
        ? resolveRichTextAssetUrls(question.explanation, (key) => FileService.getAssetAccessUrl(key))
        : Promise.resolve(question.explanation),
      question.attachmentS3Key ? FileService.getAssetAccessUrl(question.attachmentS3Key) : Promise.resolve(null),
    ]);

    return {
      ...question,
      ...(question.question !== undefined ? { question: resolvedQuestion } : {}),
      ...(question.explanation !== undefined ? { explanation: resolvedExplanation } : {}),
      attachmentUrl,
    };
  }

  private static async enrichQuestionsWithAttachmentUrl<T extends {
    attachmentS3Key?: string | null;
  }>(questions: T[]): Promise<Array<T & { attachmentUrl: string | null }>> {
    return Promise.all(questions.map((question) => this.enrichQuestionWithAttachmentUrl(question)));
  }

  private static async assertExamIsDraft(examId: string): Promise<void> {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, status: true },
    });
    if (!exam) {
      throw new Error('EXAM_NOT_FOUND');
    }
    if (exam.status !== ExamStatus.DRAFT) {
      throw new Error('EXAM_NOT_DRAFT');
    }
  }
  /**
   * Get list of exams with pagination and filters
   */
  static async getExams(params: ExamListParams = {}): Promise<{
    exams: ExamWithDetails[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const {
      page = 1,
      limit = 10,
      status,
      examType,
      courseId,
      createdById,
      search,
    } = params;

    const where: Prisma.ExamWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (examType) {
      where.examType = examType;
    }

    if (courseId) {
      where.courseId = courseId;
    }

    if (createdById) {
      where.createdById = createdById;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [exams, total] = await Promise.all([
      prisma.exam.findMany({
        where,
        include: {
          course: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              questions: true,
              attempts: true,
              materials: true,
              invitations: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.exam.count({ where }),
    ]);

    return {
      exams: exams as ExamWithDetails[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get exam by ID with full details
   */
  static async getExamById(id: string): Promise<ExamWithDetails | null> {
    const exam = await prisma.exam.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        certificateTemplate: {
          select: {
            isEnabled: true,
          },
        },
        _count: {
          select: {
            questions: true,
            attempts: true,
            materials: true,
            invitations: true,
          },
        },
      },
    });

    return exam
      ? {
          ...exam,
          certificateEligible: exam.assessmentKind === 'FORMAL' && Boolean(exam.certificateTemplate?.isEnabled),
        } as ExamWithDetails
      : null;
  }

  /**
   * Create a new exam
   */
  static async createExam(
    data: CreateExamInput,
    createdById: string
  ): Promise<ExamWithDetails> {
    // Validate course exists if course-based
    if (data.examType === ExamType.COURSE_BASED) {
      if (!data.courseId) {
        throw new Error('COURSE_REQUIRED');
      }

      const course = await prisma.course.findUnique({
        where: { id: data.courseId },
      });

      if (!course) {
        throw new Error('COURSE_NOT_FOUND');
      }
    }

    let resolvedProductDomainId = data.productDomainId ?? null
    let resolvedLearningSeriesId = data.learningSeriesId ?? null
    let resolvedLearningEventId = data.learningEventId ?? null
    let resolvedAssessmentKind = data.assessmentKind ?? AssessmentKind.PRACTICE
    let resolvedAwardsStars = data.awardsStars ?? false
    let resolvedStarValue = data.starValue ?? null
    let resolvedCountsTowardPerformance = data.countsTowardPerformance ?? false

    if (data.learningEventId) {
      const event = await prisma.learningEvent.findUnique({
        where: { id: data.learningEventId },
        include: {
          series: {
            select: { id: true, type: true, domainId: true },
          },
        },
      })

      if (!event) {
        throw new Error('LEARNING_EVENT_NOT_FOUND')
      }

      resolvedLearningEventId = event.id
      resolvedLearningSeriesId = data.learningSeriesId ?? event.seriesId ?? null
      resolvedProductDomainId =
        data.productDomainId ?? event.domainId ?? event.series?.domainId ?? null
      resolvedAssessmentKind =
        data.assessmentKind ?? this.resolveAssessmentKindFromEvent(event)
      resolvedCountsTowardPerformance =
        data.countsTowardPerformance ?? event.countsTowardPerformance
      resolvedAwardsStars =
        data.awardsStars ?? ((event.starValue ?? 0) > 0)
      resolvedStarValue =
        data.starValue ?? event.starValue ?? null
    }

    if (data.sourceLearningEventId) {
      const sourceEvent = await prisma.learningEvent.findUnique({
        where: { id: data.sourceLearningEventId },
        select: { id: true },
      })

      if (!sourceEvent) {
        throw new Error('LEARNING_EVENT_NOT_FOUND')
      }
    }

    if (resolvedLearningSeriesId) {
      const series = await prisma.learningSeries.findUnique({
        where: { id: resolvedLearningSeriesId },
        select: { id: true, domainId: true },
      })

      if (!series) {
        throw new Error('LEARNING_SERIES_NOT_FOUND')
      }

      if (!resolvedProductDomainId && series.domainId) {
        resolvedProductDomainId = series.domainId
      }
    }

    if (resolvedProductDomainId) {
      const domain = await prisma.productDomain.findUnique({
        where: { id: resolvedProductDomainId },
        select: { id: true },
      })

      if (!domain) {
        throw new Error('PRODUCT_DOMAIN_NOT_FOUND')
      }
    }

    const exam = await prisma.exam.create({
      data: {
        examType: data.examType,
        courseId: data.courseId,
        title: data.title,
        description: data.description,
        instructions: data.instructions,
        timeLimit: data.timeLimit,
        timezone: data.timezone,
        deadline: data.deadline,
        availableFrom: data.availableFrom,
        totalScore: data.totalScore ?? 100,
        passingScore: data.passingScore ?? 70,
        randomizeQuestions: data.randomizeQuestions ?? false,
        randomizeOptions: data.randomizeOptions ?? false,
        showResultsImmediately: data.showResultsImmediately ?? true,
        allowReview: data.allowReview ?? true,
        maxAttempts: data.maxAttempts ?? 1,
        assessmentKind: resolvedAssessmentKind,
        productDomainId: resolvedProductDomainId,
        learningSeriesId: resolvedLearningSeriesId,
        learningEventId: resolvedLearningEventId,
        sourceLearningEventId: data.sourceLearningEventId ?? null,
        awardsStars: resolvedAwardsStars,
        starValue: resolvedStarValue,
        countsTowardPerformance: resolvedCountsTowardPerformance,
        createdById,
        status: ExamStatus.DRAFT,
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            questions: true,
            attempts: true,
            materials: true,
            invitations: true,
          },
        },
      },
    });

    // Create analytics record
    await prisma.examAnalytics.create({
      data: {
        examId: exam.id,
      },
    });

    return exam as ExamWithDetails;
  }

  /**
   * Update an exam
   */
  static async updateExam(
    id: string,
    data: UpdateExamInput
  ): Promise<ExamWithDetails> {
    // Check exam exists and get current status
    const existing = await prisma.exam.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error('EXAM_NOT_FOUND');
    }
    if (existing.status !== ExamStatus.DRAFT) {
      throw new Error('EXAM_NOT_DRAFT');
    }

    const hasAnyChange = Object.values(data).some((v) => v !== undefined);

    const exam = await prisma.exam.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.instructions !== undefined && { instructions: data.instructions }),
        ...(data.timeLimit !== undefined && { timeLimit: data.timeLimit }),
        ...(data.timezone !== undefined && { timezone: data.timezone }),
        ...(data.deadline !== undefined && { deadline: data.deadline }),
        ...(data.availableFrom !== undefined && { availableFrom: data.availableFrom }),
        ...(data.totalScore !== undefined && { totalScore: data.totalScore }),
        ...(data.passingScore !== undefined && { passingScore: data.passingScore }),
        ...(data.randomizeQuestions !== undefined && { randomizeQuestions: data.randomizeQuestions }),
        ...(data.randomizeOptions !== undefined && { randomizeOptions: data.randomizeOptions }),
        ...(data.showResultsImmediately !== undefined && { showResultsImmediately: data.showResultsImmediately }),
        ...(data.allowReview !== undefined && { allowReview: data.allowReview }),
        ...(data.maxAttempts !== undefined && { maxAttempts: data.maxAttempts }),
        ...(hasAnyChange && { version: { increment: 1 } }),
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            questions: true,
            attempts: true,
            materials: true,
            invitations: true,
          },
        },
      },
    });

    return exam as ExamWithDetails;
  }

  /**
   * Delete an exam (soft delete by changing status to ARCHIVED)
   */
  static async deleteExam(id: string, opts?: { force?: boolean }): Promise<void> {
    const existing = await prisma.exam.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error('EXAM_NOT_FOUND');
    }

    if (opts?.force) {
      const [recordings, certificates, template] = await Promise.all([
        prisma.examAnswer.findMany({
          where: {
            recordingS3Key: { not: null },
            question: { examId: id, type: ExamQuestionType.EXERCISE },
          },
          select: { recordingS3Key: true },
        }),
        prisma.certificate.findMany({
          where: { examId: id },
          select: { pdfS3Key: true, badgeS3Key: true },
        }),
        prisma.examCertificateTemplate.findUnique({
          where: { examId: id },
          select: { badgeS3Key: true },
        }),
      ]);

      const recordingKeys = recordings.map((r) => r.recordingS3Key!).filter(Boolean);
      const pdfKeys = certificates
        .map((c) => c.pdfS3Key)
        .filter((k): k is string => typeof k === 'string' && k.length > 0);
      const badgeKeys = certificates
        .map((c) => c.badgeS3Key)
        .filter((k): k is string => typeof k === 'string' && k.length > 0);
      const templateBadgeKeys = template?.badgeS3Key ? [template.badgeS3Key] : [];

      // Cleanup S3 objects; if it fails, surface the error so admins don't assume data is removed.
      if (recordingKeys.length > 0) {
        await FileService.deleteFiles(recordingKeys);
      }

      if (pdfKeys.length > 0) {
        await FileService.deleteFiles(Array.from(new Set(pdfKeys)), S3_BUCKET_NAME);
      }

      const allBadgeKeys = Array.from(new Set([...badgeKeys, ...templateBadgeKeys]));
      if (allBadgeKeys.length > 0) {
        await FileService.deleteFiles(allBadgeKeys, ASSET_S3_BUCKET_NAME);
      }

      // Remove certificates explicitly before deleting the exam (Certificate.examId uses onDelete:SetNull).
      await prisma.certificate.deleteMany({ where: { examId: id } });

      await prisma.exam.delete({ where: { id } });
      return;
    }

    // If exam has attempts, archive instead of delete
    const attemptCount = await prisma.examAttempt.count({
      where: { examId: id },
    });

    if (attemptCount > 0) {
      // Archive instead of delete
      await prisma.exam.update({
        where: { id },
        data: { status: ExamStatus.ARCHIVED },
      });
    } else {
      // Hard delete if no attempts
      await prisma.exam.delete({
        where: { id },
      });
    }
  }

  /**
   * Change exam status
   */
  static async changeStatus(
    id: string,
    status: ExamStatus,
    userId?: string
  ): Promise<ExamWithDetails> {
    const existing = await prisma.exam.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        totalScore: true,
        _count: { select: { questions: true } },
      },
    });

    if (!existing) {
      throw new Error('EXAM_NOT_FOUND');
    }

    // Validate status transitions
    this.validateStatusTransition(existing.status, status);

    // Additional validations based on target status
    if (status === ExamStatus.PENDING_REVIEW) {
      // Must have at least one question
      const activeQuestionCount = await prisma.examQuestion.count({
        where: { examId: id, archivedAt: null },
      });
      if (activeQuestionCount === 0) {
        throw new Error('EXAM_NO_QUESTIONS');
      }

      // Must have a consistent scoring configuration before review.
      const sum = await prisma.examQuestion.aggregate({
        where: { examId: id, archivedAt: null },
        _sum: { points: true },
      });
      const totalPoints = sum._sum.points ?? 0;
      if (totalPoints !== existing.totalScore) {
        throw new Error('EXAM_POINTS_MISMATCH');
      }
    }

    if (status === ExamStatus.APPROVED) {
      if (!userId) {
        throw new Error('APPROVER_REQUIRED');
      }

      // Must have a consistent scoring configuration before approval.
      const sum = await prisma.examQuestion.aggregate({
        where: { examId: id, archivedAt: null },
        _sum: { points: true },
      });
      const totalPoints = sum._sum.points ?? 0;
      if (totalPoints !== existing.totalScore) {
        throw new Error('EXAM_POINTS_MISMATCH');
      }
    }

    const updateData: Prisma.ExamUpdateInput = {
      status,
    };

    // Set approval info
    if (status === ExamStatus.APPROVED && userId) {
      updateData.approvedBy = { connect: { id: userId } };
      updateData.approvedAt = new Date();
    }

    // Set publish date
    if (status === ExamStatus.PUBLISHED) {
      // First-time publishing must be done via the explicit publish+assign flow.
      // Reopening a previously closed exam is allowed from the status endpoint.
      if (existing.status !== ExamStatus.CLOSED) {
        throw new Error('PUBLISH_REQUIRES_ASSIGNMENT');
      }

      updateData.closedAt = null;
    }

    // Set close date
    if (status === ExamStatus.CLOSED) {
      updateData.closedAt = new Date();
    }

    const exam = await prisma.exam.update({
      where: { id },
      data: updateData,
      include: {
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            questions: true,
            attempts: true,
            materials: true,
            invitations: true,
          },
        },
      },
    });

    return exam as ExamWithDetails;
  }

  /**
   * Validate status transitions
   */
  private static validateStatusTransition(
    currentStatus: ExamStatus,
    targetStatus: ExamStatus
  ): void {
    const validTransitions: Record<ExamStatus, ExamStatus[]> = {
      [ExamStatus.DRAFT]: [ExamStatus.PENDING_REVIEW, ExamStatus.ARCHIVED],
      [ExamStatus.PENDING_REVIEW]: [ExamStatus.DRAFT, ExamStatus.APPROVED, ExamStatus.ARCHIVED],
      [ExamStatus.APPROVED]: [ExamStatus.DRAFT, ExamStatus.PENDING_REVIEW, ExamStatus.PUBLISHED, ExamStatus.ARCHIVED],
      [ExamStatus.PUBLISHED]: [ExamStatus.DRAFT, ExamStatus.CLOSED],
      [ExamStatus.CLOSED]: [ExamStatus.PUBLISHED, ExamStatus.DRAFT, ExamStatus.ARCHIVED],
      [ExamStatus.ARCHIVED]: [],
    };

    if (!validTransitions[currentStatus].includes(targetStatus)) {
      const allowed = validTransitions[currentStatus].join(',');
      throw new Error(
        `INVALID_STATUS_TRANSITION:${currentStatus}->${targetStatus}:allowed=${allowed}`
      );
    }
  }

  /**
   * Get exam questions
   */
  static async getQuestions(examId: string): Promise<any[]> {
    const questions = await prisma.examQuestion.findMany({
      where: { examId, archivedAt: null },
      orderBy: { order: 'asc' },
      include: {
        sources: {
          include: {
            chunk: {
              select: {
                id: true,
                text: true,
                metadata: true,
              },
            },
          },
        },
      },
    });

    return this.enrichQuestionsWithAttachmentUrl(questions);
  }

  /**
   * Add a question to an exam
   */
  static async addQuestion(
    examId: string,
    data: CreateQuestionInput
  ): Promise<any> {
    await this.assertExamIsDraft(examId);

    // Get current max order
    const maxOrder = await prisma.examQuestion.aggregate({
      where: { examId, archivedAt: null },
      _max: { order: true },
    });

    const question = await prisma.$transaction(async (tx) => {
      const created = await tx.examQuestion.create({
        data: {
          examId,
          type: data.type,
          difficulty: data.difficulty ?? DifficultyLevel.MEDIUM,
          question: data.question,
          options: data.options,
          correctAnswer: data.correctAnswer,
          rubric: data.rubric,
          sampleAnswer: data.sampleAnswer,
          gradingCriteria: data.gradingCriteria ?? undefined,
          maxWords: data.maxWords,
          attachmentS3Key: data.attachmentS3Key,
          attachmentFilename: data.attachmentFilename,
          attachmentMimeType: data.attachmentMimeType,
          points: data.points ?? 10,
          explanation: data.explanation,
          topic: data.topic,
          tags: data.tags ?? [],
          order: (maxOrder._max.order ?? -1) + 1,
          isAIGenerated: data.isAIGenerated ?? false,
          aiModel: data.aiModel,
          generationPrompt: data.generationPrompt,
        },
      });
      await tx.exam.update({
        where: { id: examId },
        data: { version: { increment: 1 } },
      });
      return created;
    });

    return this.enrichQuestionWithAttachmentUrl(question);
  }

  /**
   * Update a question
   */
  static async updateQuestion(
    questionId: string,
    data: Partial<CreateQuestionInput>
  ): Promise<any> {
    const existing = await prisma.examQuestion.findUnique({
      where: { id: questionId },
      select: { examId: true },
    });
    if (!existing) throw new Error('QUESTION_NOT_FOUND');
    await this.assertExamIsDraft(existing.examId);

    const question = await prisma.$transaction(async (tx) => {
      const updated = await tx.examQuestion.update({
        where: { id: questionId },
        data: {
          ...(data.type !== undefined && { type: data.type }),
          ...(data.difficulty !== undefined && { difficulty: data.difficulty }),
          ...(data.question !== undefined && { question: data.question }),
          ...(data.options !== undefined && { options: data.options }),
          ...(data.correctAnswer !== undefined && { correctAnswer: data.correctAnswer }),
          ...(data.rubric !== undefined && { rubric: data.rubric }),
          ...(data.sampleAnswer !== undefined && { sampleAnswer: data.sampleAnswer }),
          ...(data.gradingCriteria !== undefined && {
            gradingCriteria:
              data.gradingCriteria === null ? Prisma.JsonNull : data.gradingCriteria,
          }),
          ...(data.maxWords !== undefined && { maxWords: data.maxWords }),
          ...(data.attachmentS3Key !== undefined && { attachmentS3Key: data.attachmentS3Key }),
          ...(data.attachmentFilename !== undefined && { attachmentFilename: data.attachmentFilename }),
          ...(data.attachmentMimeType !== undefined && { attachmentMimeType: data.attachmentMimeType }),
          ...(data.points !== undefined && { points: data.points }),
          ...(data.explanation !== undefined && { explanation: data.explanation }),
          ...(data.topic !== undefined && { topic: data.topic }),
          ...(data.tags !== undefined && { tags: data.tags }),
        },
      });
      await tx.exam.update({
        where: { id: existing.examId },
        data: { version: { increment: 1 } },
      });
      return updated;
    });

    return this.enrichQuestionWithAttachmentUrl(question);
  }

  /**
   * Delete a question
   */
  static async deleteQuestion(questionId: string): Promise<void> {
    const existing = await prisma.examQuestion.findUnique({
      where: { id: questionId },
      select: { id: true, examId: true },
    });
    if (!existing) return;
    await this.assertExamIsDraft(existing.examId);

    await prisma.$transaction(async (tx) => {
      const usedByAnswers = await tx.examAnswer.count({
        where: { questionId: existing.id },
      });
      const usedBySnapshots = await tx.examAttemptQuestionSnapshot.count({
        where: { questionId: existing.id },
      });
      if (usedByAnswers > 0 || usedBySnapshots > 0) {
        await tx.examQuestion.update({
          where: { id: existing.id },
          data: { archivedAt: new Date() },
        });
      } else {
        await tx.examQuestion.delete({
          where: { id: existing.id },
        });
      }
      await tx.exam.update({
        where: { id: existing.examId },
        data: { version: { increment: 1 } },
      });
    });
  }

  /**
   * Reorder questions
   */
  static async reorderQuestions(
    examId: string,
    questionIds: string[]
  ): Promise<void> {
    await this.assertExamIsDraft(examId);

    await prisma.$transaction(async (tx) => {
      for (let index = 0; index < questionIds.length; index++) {
        await tx.examQuestion.update({
          where: { id: questionIds[index] },
          data: { order: index },
        });
      }
      await tx.exam.update({
        where: { id: examId },
        data: { version: { increment: 1 } },
      });
    });
  }

  /**
   * Get exams available for a user to take
   */
  static async getAvailableExamsForUser(userId: string): Promise<any[]> {
    const now = new Date();

    // Get exams where user is invited or exam is public
    const exams = await prisma.exam.findMany({
      where: {
        status: ExamStatus.PUBLISHED,
        OR: [
          // User is invited
          {
            invitations: {
              some: {
                userId,
              },
            },
          },
          // Exam is course-based and user is enrolled
          {
            examType: ExamType.COURSE_BASED,
            course: {
              enrollments: {
                some: {
                  userId,
                },
              },
            },
          },
        ],
        // Within availability window
        AND: [
          {
            OR: [
              { availableFrom: null },
              { availableFrom: { lte: now } },
            ],
          },
          {
            OR: [
              { deadline: null },
              { deadline: { gt: now } },
            ],
          },
        ],
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
        _count: {
          select: {
            questions: true,
          },
        },
        attempts: {
          where: { userId },
          select: {
            id: true,
            attemptNumber: true,
            status: true,
            percentageScore: true,
            passed: true,
            submittedAt: true,
          },
        },
      },
    });

    return exams;
  }

  /**
   * Check if user can take an exam
   */
  static async canUserTakeExam(
    userId: string,
    examId: string
  ): Promise<{
    canTake: boolean;
    reason?: string;
    attemptsUsed?: number;
    maxAttempts?: number;
  }> {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
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
        attempts: {
          where: { userId },
        },
      },
    });

    if (!exam) {
      return { canTake: false, reason: 'EXAM_NOT_FOUND' };
    }

    // Check status
    if (exam.status !== ExamStatus.PUBLISHED) {
      return { canTake: false, reason: 'EXAM_NOT_PUBLISHED' };
    }

    // Check availability window
    const now = new Date();
    if (exam.availableFrom && exam.availableFrom > now) {
      return { canTake: false, reason: 'EXAM_NOT_AVAILABLE_YET' };
    }
    if (exam.deadline && exam.deadline < now) {
      return { canTake: false, reason: 'EXAM_DEADLINE_PASSED' };
    }

    // Check access (invitation required)
    const hasInvitation = exam.invitations.length > 0;

    if (!hasInvitation) {
      return { canTake: false, reason: 'NO_ACCESS' };
    }

    // Check attempt limit
    const completedAttempts = exam.attempts.filter(
      a => a.status === 'SUBMITTED' || a.status === 'GRADED'
    ).length;

    if (completedAttempts >= exam.maxAttempts) {
      return {
        canTake: false,
        reason: 'MAX_ATTEMPTS_REACHED',
        attemptsUsed: completedAttempts,
        maxAttempts: exam.maxAttempts,
      };
    }

    // Check for in-progress attempt
    const inProgressAttempt = exam.attempts.find(
      a => a.status === 'IN_PROGRESS'
    );

    if (inProgressAttempt) {
      return {
        canTake: true,
        reason: 'RESUME_EXISTING',
        attemptsUsed: completedAttempts,
        maxAttempts: exam.maxAttempts,
      };
    }

    return {
      canTake: true,
      attemptsUsed: completedAttempts,
      maxAttempts: exam.maxAttempts,
    };
  }
}
