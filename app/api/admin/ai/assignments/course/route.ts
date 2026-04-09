import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { AIPromptUseCase } from '@prisma/client'
import { z } from 'zod'
import { SUPPORTED_OPENAI_MODELS } from '@/lib/services/openai-models'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

const upsertAssignmentSchema = z.object({
    courseId: z.string().uuid(),
    useCase: z.nativeEnum(AIPromptUseCase),
    templateId: z.string().uuid(),
    isEnabled: z.boolean().optional().default(true),
    modelOverride: z.enum(SUPPORTED_OPENAI_MODELS).optional().nullable(),
    temperatureOverride: z.number().min(0).max(2).optional().nullable(),
    maxTokensOverride: z.number().int().min(1).max(32768).optional().nullable(),
})

const deleteAssignmentSchema = z.object({
    courseId: z.string().uuid(),
    useCase: z.nativeEnum(AIPromptUseCase),
})

// GET /api/admin/ai/assignments/course?courseId=...
export const GET = withSmeOrAdminAuth(async (req, user) => {
    try {
        const { searchParams } = new URL(req.url)
        const courseId = searchParams.get('courseId')
        if (!courseId) {
            return NextResponse.json(
                { success: false, error: { code: 'AI_ASSIGN_400', message: 'courseId is required' } },
                { status: 400 }
            )
        }

        if (user.role === 'SME') {
            await TrainingOpsService.assertScopedCourseAccess(user, courseId)
        }

        const rows = await prisma.courseAIPromptAssignment.findMany({
            where: { courseId },
            include: { template: true },
            orderBy: { useCase: 'asc' },
        })

        return NextResponse.json({ success: true, data: rows })
    } catch (error) {
        console.error('List course prompt assignments error:', error)
        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'AUTH_003',
                        message: 'Insufficient permissions',
                    },
                },
                { status: 403 }
            )
        }
        if ((error as any)?.code === 'P2021') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'DB_MIGRATION_REQUIRED',
                        message: 'AI prompt tables are missing. Apply database migrations and try again.',
                    },
                },
                { status: 500 }
            )
        }
        return NextResponse.json(
            { success: false, error: { code: 'AI_ASSIGN_001', message: 'Failed to load course assignments' } },
            { status: 500 }
        )
    }
})

// PUT /api/admin/ai/assignments/course
export const PUT = withSmeOrAdminAuth(async (req, user) => {
    try {
        const body = await req.json()
        const data = upsertAssignmentSchema.parse(body)

        if (user.role === 'SME') {
            await TrainingOpsService.assertScopedCourseAccess(user, data.courseId)
        }

        const template = await prisma.aIPromptTemplate.findUnique({ where: { id: data.templateId } })
        if (!template) {
            return NextResponse.json(
                { success: false, error: { code: 'AI_ASSIGN_404', message: 'Template not found' } },
                { status: 404 }
            )
        }
        if (template.useCase !== data.useCase) {
            return NextResponse.json(
                { success: false, error: { code: 'AI_ASSIGN_400', message: 'Template useCase mismatch' } },
                { status: 400 }
            )
        }

        const row = await prisma.courseAIPromptAssignment.upsert({
            where: { courseId_useCase: { courseId: data.courseId, useCase: data.useCase } },
            create: {
                courseId: data.courseId,
                useCase: data.useCase,
                templateId: data.templateId,
                isEnabled: data.isEnabled,
                modelOverride: data.modelOverride ?? null,
                temperatureOverride: data.temperatureOverride ?? null,
                maxTokensOverride: data.maxTokensOverride ?? null,
            },
            update: {
                templateId: data.templateId,
                isEnabled: data.isEnabled,
                modelOverride: data.modelOverride ?? null,
                temperatureOverride: data.temperatureOverride ?? null,
                maxTokensOverride: data.maxTokensOverride ?? null,
            },
            include: { template: true },
        })

        return NextResponse.json({ success: true, data: row })
    } catch (error) {
        console.error('Upsert course prompt assignment error:', error)
        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json(
                { success: false, error: { code: 'AUTH_003', message: 'Insufficient permissions' } },
                { status: 403 }
            )
        }
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input data', details: error.errors } },
                { status: 400 }
            )
        }
        if ((error as any)?.code === 'P2021') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'DB_MIGRATION_REQUIRED',
                        message: 'AI prompt tables are missing. Apply database migrations and try again.',
                    },
                },
                { status: 500 }
            )
        }
        return NextResponse.json(
            { success: false, error: { code: 'AI_ASSIGN_002', message: 'Failed to save course assignment' } },
            { status: 500 }
        )
    }
})

// DELETE /api/admin/ai/assignments/course
export const DELETE = withSmeOrAdminAuth(async (req, user) => {
    try {
        const body = await req.json()
        const data = deleteAssignmentSchema.parse(body)

        if (user.role === 'SME') {
            await TrainingOpsService.assertScopedCourseAccess(user, data.courseId)
        }

        await prisma.courseAIPromptAssignment.delete({
            where: { courseId_useCase: { courseId: data.courseId, useCase: data.useCase } },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Delete course prompt assignment error:', error)
        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json(
                { success: false, error: { code: 'AUTH_003', message: 'Insufficient permissions' } },
                { status: 403 }
            )
        }
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input data', details: error.errors } },
                { status: 400 }
            )
        }
        if ((error as any)?.code === 'P2021') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'DB_MIGRATION_REQUIRED',
                        message: 'AI prompt tables are missing. Apply database migrations and try again.',
                    },
                },
                { status: 500 }
            )
        }
        return NextResponse.json(
            { success: false, error: { code: 'AI_ASSIGN_003', message: 'Failed to delete course assignment' } },
            { status: 500 }
        )
    }
})
