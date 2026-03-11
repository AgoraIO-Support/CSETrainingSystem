import { LessonAssetType, ExamType, ExamQuestionType, DifficultyLevel, ExamStatus } from '@prisma/client'
import { z } from 'zod'
import { LessonCompletionRule, LessonType } from '@prisma/client'
import { DEFAULT_EXAM_TIMEZONE, isValidExamTimeZone } from '@/lib/exam-timezone'

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
    name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long').optional(),
    email: z.string().trim().email('Invalid email address').optional(),
    wecomUserId: z.string().trim().min(1, 'WeCom User ID is required').max(128, 'WeCom User ID is too long').optional(),
    department: z.string().trim().max(120, 'Department is too long').optional().nullable(),
    title: z.string().trim().max(120, 'Title is too long').optional().nullable(),
}).refine(
    data =>
        data.role !== undefined ||
        data.status !== undefined ||
        data.name !== undefined ||
        data.email !== undefined ||
        data.wecomUserId !== undefined ||
        data.department !== undefined ||
        data.title !== undefined,
    {
        message: 'At least one field must be provided',
        path: ['role'],
    }
)

export const adminCreateUserSchema = z.object({
    email: z.string().trim().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
    wecomUserId: z.string().trim().min(1, 'WeCom User ID is required').max(128, 'WeCom User ID is too long'),
    department: z.string().trim().max(120, 'Department is too long').optional(),
    title: z.string().trim().max(120, 'Title is too long').optional(),
})

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required').optional(),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
})

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

const optionalLocalDateTimeInput = () =>
    z.preprocess(
        (value) => {
            if (value === undefined || value === null) return undefined
            if (typeof value === 'string') {
                const trimmed = value.trim()
                if (!trimmed) return undefined
                return trimmed
            }
            return value
        },
        z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/).optional()
    )

const optionalNullableLocalDateTimeInput = () =>
    z.preprocess(
        (value) => {
            if (value === undefined) return undefined
            if (value === null) return null
            if (typeof value === 'string') {
                const trimmed = value.trim()
                if (!trimmed) return null
                return trimmed
            }
            return value
        },
        z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/).nullable().optional()
    )

const examTimeZoneInput = () =>
    z
        .string()
        .trim()
        .min(1, 'Timezone is required')
        .refine(isValidExamTimeZone, 'Timezone must be a valid IANA timezone')

export const createExamSchema = z.object({
    examType: z.nativeEnum(ExamType),
    courseId: z.string().uuid().optional(),
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().optional(),
    instructions: z.string().optional(),
    timeLimit: z.number().int().positive().optional(),
    timezone: examTimeZoneInput().default(DEFAULT_EXAM_TIMEZONE),
    deadline: optionalLocalDateTimeInput(),
    availableFrom: optionalLocalDateTimeInput(),
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
    timezone: examTimeZoneInput().optional(),
    deadline: optionalNullableLocalDateTimeInput(),
    availableFrom: optionalNullableLocalDateTimeInput(),
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

const examQuestionSchemaBase = z.object({
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

const refineExerciseQuestionFields = (
    data: z.infer<typeof examQuestionSchemaBase> | Partial<z.infer<typeof examQuestionSchemaBase>>,
    ctx: z.RefinementCtx
) => {
    if (data.type !== ExamQuestionType.EXERCISE) return

    if (Array.isArray(data.options) && data.options.some((o) => o.trim())) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Exercise questions do not support options',
            path: ['options'],
        })
    }
    if (typeof data.correctAnswer === 'string' && data.correctAnswer.trim()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Exercise questions do not have a correctAnswer',
            path: ['correctAnswer'],
        })
    }
    if (typeof data.rubric === 'string' && data.rubric.trim()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Exercise questions do not support rubric',
            path: ['rubric'],
        })
    }
    if (typeof data.sampleAnswer === 'string' && data.sampleAnswer.trim()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Exercise questions do not support sampleAnswer',
            path: ['sampleAnswer'],
        })
    }
    if (typeof data.maxWords === 'number') {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Exercise questions do not support maxWords',
            path: ['maxWords'],
        })
    }
}

export const createExamQuestionSchema = examQuestionSchemaBase.superRefine(refineExerciseQuestionFields)
export const updateExamQuestionSchema = examQuestionSchemaBase.partial().superRefine(refineExerciseQuestionFields)

export const reorderExamQuestionsSchema = z.object({
    questionIds: z.array(z.string().uuid()).nonempty(),
})

export const generateQuestionsSchema = z.object({
    questionCounts: z.object({
        singleChoice: z.number().int().nonnegative().optional(),
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
    // Backward compatible: `sendEmail` accepted from older clients.
    sendEmail: z.boolean().optional(),
    sendNotification: z.boolean().optional(),
})

export const publishExamSchema = z.object({
    userIds: z.array(z.string().uuid()).nonempty('Select at least one user to assign this exam'),
    // Backward compatible: `sendEmail` accepted from older clients.
    sendEmail: z.boolean().optional(),
    sendNotification: z.boolean().optional(),
})

export const submitExamAnswerSchema = z.object({
    attemptId: z.string().uuid(),
    questionId: z.string().uuid(),
    answer: z.string().optional(),
    selectedOption: z.number().int().nonnegative().optional(),
})
