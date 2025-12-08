import { LessonAssetType } from '@prisma/client'
import { z } from 'zod'

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
