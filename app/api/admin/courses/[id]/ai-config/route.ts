import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withSmeOrAdminAuth, AuthUser } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { z } from 'zod'

const courseAIConfigSchema = z.object({
    systemPrompt: z.string().min(10, 'System prompt must be at least 10 characters').max(10000),
    modelOverride: z.string().optional().nullable(),
    temperature: z.number().min(0).max(2).optional().nullable(),
    maxTokens: z.number().min(100).max(8000).optional().nullable(),
    isEnabled: z.boolean().optional(),
})

const courseAIEnableSchema = z.object({
    isEnabled: z.boolean(),
})

const UNUSED_COURSE_AI_SYSTEM_PROMPT =
    'AI assistant prompt/model settings are managed in Admin > AI Configuration.'

// GET - Fetch course AI configuration
export const GET = withSmeOrAdminAuth(async (
    req: NextRequest,
    user: AuthUser,
    context: { params: Promise<{ id: string }> }
) => {
    try {
        const { id: courseId } = await context.params

        if (user.role === 'SME') {
            await TrainingOpsService.assertScopedCourseAccess(user, courseId)
        }

        // Verify course exists
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            select: { id: true, title: true }
        })

        if (!course) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'COURSE_NOT_FOUND',
                        message: 'Course not found'
                    }
                },
                { status: 404 }
            )
        }

        const config = await prisma.courseAIConfig.findUnique({
            where: { courseId }
        })

        return NextResponse.json({
            success: true,
            data: config
        })
    } catch (error) {
        console.error('Failed to fetch course AI config:', error)
        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'AUTH_003',
                        message: 'You can only manage AI settings for courses within your SME scope'
                    }
                },
                { status: 403 }
            )
        }
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to fetch AI configuration'
                }
            },
            { status: 500 }
        )
    }
})

// PATCH - Enable/disable course AI assistant
export const PATCH = withSmeOrAdminAuth(async (
    req: NextRequest,
    user: AuthUser,
    context: { params: Promise<{ id: string }> }
) => {
    try {
        const { id: courseId } = await context.params
        if (user.role === 'SME') {
            await TrainingOpsService.assertScopedCourseAccess(user, courseId)
        }
        const body = await req.json()
        const payload = courseAIEnableSchema.parse(body)

        const course = await prisma.course.findUnique({
            where: { id: courseId },
            select: { id: true },
        })

        if (!course) {
            return NextResponse.json(
                { success: false, error: { code: 'COURSE_NOT_FOUND', message: 'Course not found' } },
                { status: 404 }
            )
        }

        const config = await prisma.courseAIConfig.upsert({
            where: { courseId },
            update: { isEnabled: payload.isEnabled },
            create: {
                courseId,
                systemPrompt: UNUSED_COURSE_AI_SYSTEM_PROMPT,
                modelOverride: null,
                temperature: 0.2,
                maxTokens: 1024,
                isEnabled: payload.isEnabled,
            },
        })

        return NextResponse.json({ success: true, data: config })
    } catch (error) {
        console.error('Failed to update course AI assistant toggle:', error)
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: error.errors } },
                { status: 400 }
            )
        }
        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json(
                { success: false, error: { code: 'AUTH_003', message: 'You can only manage AI settings for courses within your SME scope' } },
                { status: 403 }
            )
        }
        return NextResponse.json(
            { success: false, error: { code: 'SYSTEM_001', message: 'Failed to update AI assistant setting' } },
            { status: 500 }
        )
    }
})

// PUT - Create or update course AI configuration
export const PUT = withSmeOrAdminAuth(async (
    req: NextRequest,
    user: AuthUser,
    context: { params: Promise<{ id: string }> }
) => {
    try {
        const { id: courseId } = await context.params
        if (user.role === 'SME') {
            await TrainingOpsService.assertScopedCourseAccess(user, courseId)
        }
        const body = await req.json()

        // Validate input
        const validation = courseAIConfigSchema.safeParse(body)
        if (!validation.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Invalid input',
                        details: validation.error.flatten().fieldErrors
                    }
                },
                { status: 400 }
            )
        }

        const payload = validation.data

        // Verify course exists
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            select: { id: true }
        })

        if (!course) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'COURSE_NOT_FOUND',
                        message: 'Course not found'
                    }
                },
                { status: 404 }
            )
        }

        // Upsert the configuration
        const config = await prisma.courseAIConfig.upsert({
            where: { courseId },
            update: {
                systemPrompt: payload.systemPrompt,
                modelOverride: payload.modelOverride,
                temperature: payload.temperature,
                maxTokens: payload.maxTokens,
                isEnabled: payload.isEnabled ?? true,
            },
            create: {
                courseId,
                systemPrompt: payload.systemPrompt,
                modelOverride: payload.modelOverride,
                temperature: payload.temperature ?? 0.2,
                maxTokens: payload.maxTokens ?? 1024,
                isEnabled: payload.isEnabled ?? true,
            }
        })

        return NextResponse.json({
            success: true,
            data: config,
            message: 'AI configuration saved successfully'
        })
    } catch (error) {
        console.error('Failed to save course AI config:', error)
        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'AUTH_003',
                        message: 'You can only manage AI settings for courses within your SME scope'
                    }
                },
                { status: 403 }
            )
        }
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to save AI configuration'
                }
            },
            { status: 500 }
        )
    }
})

// DELETE - Remove course AI configuration
export const DELETE = withSmeOrAdminAuth(async (
    req: NextRequest,
    user: AuthUser,
    context: { params: Promise<{ id: string }> }
) => {
    try {
        const { id: courseId } = await context.params
        if (user.role === 'SME') {
            await TrainingOpsService.assertScopedCourseAccess(user, courseId)
        }

        // Check if config exists
        const existing = await prisma.courseAIConfig.findUnique({
            where: { courseId }
        })

        if (!existing) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'CONFIG_NOT_FOUND',
                        message: 'AI configuration not found for this course'
                    }
                },
                { status: 404 }
            )
        }

        await prisma.courseAIConfig.delete({
            where: { courseId }
        })

        return NextResponse.json({
            success: true,
            message: 'AI configuration deleted successfully'
        })
    } catch (error) {
        console.error('Failed to delete course AI config:', error)
        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'AUTH_003',
                        message: 'You can only manage AI settings for courses within your SME scope'
                    }
                },
                { status: 403 }
            )
        }
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to delete AI configuration'
                }
            },
            { status: 500 }
        )
    }
})
