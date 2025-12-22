import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAdminAuth, AuthUser } from '@/lib/auth-middleware'
import { z } from 'zod'

const lessonAIConfigSchema = z.object({
    systemPrompt: z.string().min(10, 'System prompt must be at least 10 characters').max(10000),
    modelOverride: z.string().optional().nullable(),
    temperature: z.number().min(0).max(2).optional().nullable(),
    maxTokens: z.number().min(100).max(8000).optional().nullable(),
    isEnabled: z.boolean().optional(),
    includeTranscript: z.boolean().optional(),
    includeAssetSummaries: z.boolean().optional(),
    customContext: z.string().max(5000).optional().nullable(),
})

// GET - Fetch lesson AI configuration
export const GET = withAdminAuth(async (
    req: NextRequest,
    user: AuthUser,
    context: { params: Promise<{ lessonId: string }> }
) => {
    try {
        const { lessonId } = await context.params

        // Verify lesson exists
        const lesson = await prisma.lesson.findUnique({
            where: { id: lessonId },
            select: { id: true, title: true }
        })

        if (!lesson) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'LESSON_NOT_FOUND',
                        message: 'Lesson not found'
                    }
                },
                { status: 404 }
            )
        }

        const config = await prisma.lessonAIConfig.findUnique({
            where: { lessonId }
        })

        return NextResponse.json({
            success: true,
            data: config
        })
    } catch (error) {
        console.error('Failed to fetch lesson AI config:', error)
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

// PUT - Create or update lesson AI configuration
export const PUT = withAdminAuth(async (
    req: NextRequest,
    user: AuthUser,
    context: { params: Promise<{ lessonId: string }> }
) => {
    try {
        const { lessonId } = await context.params
        const body = await req.json()

        // Validate input
        const validation = lessonAIConfigSchema.safeParse(body)
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

        // Verify lesson exists
        const lesson = await prisma.lesson.findUnique({
            where: { id: lessonId },
            select: { id: true }
        })

        if (!lesson) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'LESSON_NOT_FOUND',
                        message: 'Lesson not found'
                    }
                },
                { status: 404 }
            )
        }

        // Upsert the configuration
        const config = await prisma.lessonAIConfig.upsert({
            where: { lessonId },
            update: {
                systemPrompt: payload.systemPrompt,
                modelOverride: payload.modelOverride,
                temperature: payload.temperature,
                maxTokens: payload.maxTokens,
                isEnabled: payload.isEnabled ?? true,
                includeTranscript: payload.includeTranscript ?? true,
                includeAssetSummaries: payload.includeAssetSummaries ?? false,
                customContext: payload.customContext,
            },
            create: {
                lessonId,
                systemPrompt: payload.systemPrompt,
                modelOverride: payload.modelOverride,
                temperature: payload.temperature,
                maxTokens: payload.maxTokens,
                isEnabled: payload.isEnabled ?? true,
                includeTranscript: payload.includeTranscript ?? true,
                includeAssetSummaries: payload.includeAssetSummaries ?? false,
                customContext: payload.customContext,
            }
        })

        return NextResponse.json({
            success: true,
            data: config,
            message: 'Lesson AI configuration saved successfully'
        })
    } catch (error) {
        console.error('Failed to save lesson AI config:', error)
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

// DELETE - Remove lesson AI configuration
export const DELETE = withAdminAuth(async (
    req: NextRequest,
    user: AuthUser,
    context: { params: Promise<{ lessonId: string }> }
) => {
    try {
        const { lessonId } = await context.params

        // Check if config exists
        const existing = await prisma.lessonAIConfig.findUnique({
            where: { lessonId }
        })

        if (!existing) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'CONFIG_NOT_FOUND',
                        message: 'AI configuration not found for this lesson'
                    }
                },
                { status: 404 }
            )
        }

        await prisma.lessonAIConfig.delete({
            where: { lessonId }
        })

        return NextResponse.json({
            success: true,
            message: 'Lesson AI configuration deleted successfully'
        })
    } catch (error) {
        console.error('Failed to delete lesson AI config:', error)
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
