import { LessonAssetType, ExamType, ExamQuestionType, DifficultyLevel, ExamStatus } from '@prisma/client'
import { z } from 'zod'
import { LessonCompletionRule, LessonType } from '@prisma/client'

// User schemas
export const registerSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1, 'Name is required'),
    department: z.string().optional(),
})

export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
})

export const updateProfileSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
    title: z.string().max(120, 'Title is too long').optional().nullable(),
    department: z.string().max(120, 'Department is too long').optional().nullable(),
    bio: z.string().max(500, 'Bio is too long').optional().nullable(),
    avatar: z.string().url('Avatar must be a valid URL').optional().nullable(),
})

export const adminUpdateUserSchema = z.object({
    role: z.enum(['USER', 'ADMIN']).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']).optional(),
}).refine(
    data => data.role !== undefined || data.status !== undefined,
    {
        message: 'At least one field must be provided',
        path: ['role'],
    }
)

// Course schemas
export const createCourseSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
    description: z.string().min(1, 'Description is required'),
    thumbnail: z.string().url().optional(),
    level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
    category: z.string().min(1, 'Category is required'),
    tags: z.array(z.string()),
    learningOutcomes: z.array(z.string()).optional(),
    requirements: z.array(z.string()).optional(),
    instructorId: z.string().uuid(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
})

export const updateCourseSchema = createCourseSchema.partial()

export const createCourseAssetSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    url: z.string().url('Asset URL is invalid'),
    s3Key: z.string().min(1, 'S3 key is required'),
    contentType: z.string().optional(),
    type: z.nativeEnum(LessonAssetType),
})

// Chapter & Lesson
export const createChapterSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    order: z.number().int().optional(),
})

export const updateChapterSchema = createChapterSchema.partial()

export const reorderChaptersSchema = z.object({
    chapterOrder: z.array(z.string().uuid()).nonempty(),
})

export const createLessonSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    durationMinutes: z.number().int().positive().optional(),
    lessonType: z.nativeEnum(LessonType).optional(),
    learningObjectives: z.array(z.string()).optional(),
    completionRule: z.nativeEnum(LessonCompletionRule).optional(),
    order: z.number().int().optional(),
    courseAssetIds: z.array(z.string().min(1)).optional(),
})

export const updateLessonSchema = createLessonSchema.partial()

export const reorderLessonsSchema = z.object({
    lessonOrder: z.array(z.string().uuid()).nonempty(),
})

export const replaceLessonAssetsSchema = z.object({
    courseAssetIds: z.array(z.string().min(1)).default([]),
})

// Progress schemas
export const updateProgressSchema = z.object({
    watchedDuration: z.number().nonnegative(),
    lastTimestamp: z.number().nonnegative(),
    completed: z.boolean().optional(),
})

// Quiz schemas
export const submitQuizSchema = z.object({
    attemptId: z.string().uuid(),
    answers: z.record(z.string(), z.union([z.string(), z.number()])),
})

// AI schemas
export const aiMessageSchema = z.object({
    message: z.string().min(1, 'Message is required'),
    videoTimestamp: z.number().nonnegative().optional(),
    context: z.any().optional(),
})

// File upload schemas
export const presignedUrlSchema = z.object({
    filename: z.string().min(1, 'Filename is required'),
    contentType: z.string().regex(/^video\//, 'Must be a video file'),
    lessonId: z.string().uuid().optional(),
})

export const confirmUploadSchema = z.object({
    key: z.string().min(1, 'S3 key is required'),
    lessonId: z.string().uuid(),
})

// Helper function to validate request body
export function validateRequestBody<T>(schema: z.ZodSchema<T>, data: unknown): T {
    return schema.parse(data)
}

// ============================================================================
// EXAM SCHEMAS
// ============================================================================

export const createExamSchema = z.object({
    examType: z.nativeEnum(ExamType),
    courseId: z.string().uuid().optional(),
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().optional(),
    instructions: z.string().optional(),
    timeLimit: z.number().int().positive().optional(),
    deadline: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
    availableFrom: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
    totalScore: z.number().int().positive().default(100),
    passingScore: z.number().int().min(0).max(100).default(70),
    randomizeQuestions: z.boolean().default(false),
    randomizeOptions: z.boolean().default(false),
    showResultsImmediately: z.boolean().default(true),
    allowReview: z.boolean().default(true),
    maxAttempts: z.number().int().positive().default(1),
})

export const updateExamSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().optional().nullable(),
    instructions: z.string().optional().nullable(),
    timeLimit: z.number().int().positive().optional().nullable(),
    deadline: z.string().datetime().optional().nullable().transform(val => val ? new Date(val) : null),
    availableFrom: z.string().datetime().optional().nullable().transform(val => val ? new Date(val) : null),
    totalScore: z.number().int().positive().optional(),
    passingScore: z.number().int().min(0).max(100).optional(),
    randomizeQuestions: z.boolean().optional(),
    randomizeOptions: z.boolean().optional(),
    showResultsImmediately: z.boolean().optional(),
    allowReview: z.boolean().optional(),
    maxAttempts: z.number().int().positive().optional(),
})

export const changeExamStatusSchema = z.object({
    status: z.nativeEnum(ExamStatus),
})

export const createExamQuestionSchema = z.object({
    type: z.nativeEnum(ExamQuestionType),
    difficulty: z.nativeEnum(DifficultyLevel).default(DifficultyLevel.MEDIUM),
    question: z.string().min(1, 'Question text is required'),
    options: z.array(z.string()).optional(),
    correctAnswer: z.string().optional(),
    rubric: z.string().optional(),
    sampleAnswer: z.string().optional(),
    maxWords: z.number().int().positive().optional(),
    points: z.number().int().positive().default(10),
    explanation: z.string().optional(),
    topic: z.string().optional(),
    tags: z.array(z.string()).default([]),
})

export const updateExamQuestionSchema = createExamQuestionSchema.partial()

export const reorderExamQuestionsSchema = z.object({
    questionIds: z.array(z.string().uuid()).nonempty(),
})

export const generateQuestionsSchema = z.object({
    questionCounts: z.object({
        multipleChoice: z.number().int().nonnegative().optional(),
        trueFalse: z.number().int().nonnegative().optional(),
        fillInBlank: z.number().int().nonnegative().optional(),
        essay: z.number().int().nonnegative().optional(),
    }),
    difficulty: z.union([
        z.nativeEnum(DifficultyLevel),
        z.literal('mixed'),
    ]).default('mixed'),
    lessonIds: z.array(z.string().uuid()).optional(),
    topics: z.array(z.string()).optional(),
    focusAreas: z.array(z.string()).optional(),
})

export const inviteUsersSchema = z.object({
    userIds: z.array(z.string().uuid()).nonempty('At least one user is required'),
    // Invitations are created first; sending can be triggered explicitly.
    sendEmail: z.boolean().default(false),
})

export const publishExamSchema = z.object({
    userIds: z.array(z.string().uuid()).nonempty('Select at least one user to assign this exam'),
    sendEmail: z.boolean().default(false),
})

export const submitExamAnswerSchema = z.object({
    attemptId: z.string().uuid(),
    questionId: z.string().uuid(),
    answer: z.string().optional(),
    selectedOption: z.number().int().nonnegative().optional(),
})
