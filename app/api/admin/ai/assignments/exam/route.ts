import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { AIPromptUseCase } from '@prisma/client'
import { z } from 'zod'

const upsertAssignmentSchema = z.object({
    examId: z.string().uuid(),
    useCase: z.nativeEnum(AIPromptUseCase),
    templateId: z.string().uuid(),
    isEnabled: z.boolean().optional().default(true),
    modelOverride: z.string().min(1).optional().nullable(),
    temperatureOverride: z.number().min(0).max(2).optional().nullable(),
    maxTokensOverride: z.number().int().min(1).max(32768).optional().nullable(),
})

const deleteAssignmentSchema = z.object({
    examId: z.string().uuid(),
    useCase: z.nativeEnum(AIPromptUseCase),
})

// GET /api/admin/ai/assignments/exam?examId=...
export const GET = withAdminAuth(async (req) => {
    try {
        const { searchParams } = new URL(req.url)
        const examId = searchParams.get('examId')
        if (!examId) {
            return NextResponse.json(
                { success: false, error: { code: 'AI_ASSIGN_400', message: 'examId is required' } },
                { status: 400 }
            )
        }

        const rows = await prisma.examAIPromptAssignment.findMany({
            where: { examId },
            include: { template: true },
            orderBy: { useCase: 'asc' },
        })

        return NextResponse.json({ success: true, data: rows })
    } catch (error) {
        console.error('List exam prompt assignments error:', error)
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
            { success: false, error: { code: 'AI_ASSIGN_001', message: 'Failed to load exam assignments' } },
            { status: 500 }
        )
    }
})

// PUT /api/admin/ai/assignments/exam
export const PUT = withAdminAuth(async (req) => {
    try {
        const body = await req.json()
        const data = upsertAssignmentSchema.parse(body)

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

        const row = await prisma.examAIPromptAssignment.upsert({
            where: { examId_useCase: { examId: data.examId, useCase: data.useCase } },
            create: {
                examId: data.examId,
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
        console.error('Upsert exam prompt assignment error:', error)
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
            { success: false, error: { code: 'AI_ASSIGN_002', message: 'Failed to save exam assignment' } },
            { status: 500 }
        )
    }
})

// DELETE /api/admin/ai/assignments/exam
export const DELETE = withAdminAuth(async (req) => {
    try {
        const body = await req.json()
        const data = deleteAssignmentSchema.parse(body)

        await prisma.examAIPromptAssignment.delete({
            where: { examId_useCase: { examId: data.examId, useCase: data.useCase } },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Delete exam prompt assignment error:', error)
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
            { success: false, error: { code: 'AI_ASSIGN_003', message: 'Failed to delete exam assignment' } },
            { status: 500 }
        )
    }
})
