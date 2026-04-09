import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { AIResponseFormat, AIPromptUseCase } from '@prisma/client'
import { z } from 'zod'
import { SUPPORTED_OPENAI_MODELS } from '@/lib/services/openai-models'

type RouteContext = { params: Promise<{ id: string }> }

function getPrismaCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') return undefined
    const maybeCode = (error as { code?: unknown }).code
    return typeof maybeCode === 'string' ? maybeCode : undefined
}

const updateTemplateSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    useCase: z.nativeEnum(AIPromptUseCase).optional(),
    systemPrompt: z.string().min(1).optional(),
    userPrompt: z.string().optional().nullable(),
    variables: z.array(z.string()).optional(),
    model: z.enum(SUPPORTED_OPENAI_MODELS).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(1).max(32768).optional(),
    responseFormat: z.nativeEnum(AIResponseFormat).optional(),
    isActive: z.boolean().optional(),
})

export const GET = withAdminAuth(async (_req, _user, ctx: RouteContext) => {
    try {
        const { id } = await ctx.params
        const template = await prisma.aIPromptTemplate.findUnique({ where: { id } })
        if (!template) {
            return NextResponse.json(
                { success: false, error: { code: 'AI_PROMPT_404', message: 'Prompt template not found' } },
                { status: 404 }
            )
        }
        return NextResponse.json({ success: true, data: template })
    } catch (error: unknown) {
        console.error('Get AI prompt template error:', error)
        if (getPrismaCode(error) === 'P2021') {
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
            { success: false, error: { code: 'AI_PROMPT_003', message: 'Failed to load prompt template' } },
            { status: 500 }
        )
    }
})

export const PATCH = withAdminAuth(async (req, _user, ctx: RouteContext) => {
    try {
        const { id } = await ctx.params
        const body = await req.json()
        const patch = updateTemplateSchema.parse(body)

        const existing = await prisma.aIPromptTemplate.findUnique({ where: { id } })
        if (!existing) {
            return NextResponse.json(
                { success: false, error: { code: 'AI_PROMPT_404', message: 'Prompt template not found' } },
                { status: 404 }
            )
        }

        const systemPrompt = patch.systemPrompt ?? existing.systemPrompt ?? existing.template

        const updated = await prisma.aIPromptTemplate.update({
            where: { id },
            data: {
                name: patch.name,
                description: patch.description,
                useCase: patch.useCase,
                systemPrompt,
                // Keep legacy field in sync with systemPrompt.
                template: systemPrompt,
                userPrompt: patch.userPrompt,
                variables: patch.variables,
                model: patch.model,
                temperature: patch.temperature,
                maxTokens: patch.maxTokens,
                responseFormat: patch.responseFormat,
                isActive: patch.isActive,
            },
        })

        return NextResponse.json({ success: true, data: updated })
    } catch (error: unknown) {
        console.error('Update AI prompt template error:', error)

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input data', details: error.errors } },
                { status: 400 }
            )
        }
        if (getPrismaCode(error) === 'P2021') {
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
            { success: false, error: { code: 'AI_PROMPT_004', message: 'Failed to update prompt template' } },
            { status: 500 }
        )
    }
})

export const DELETE = withAdminAuth(async (_req, _user, ctx: RouteContext) => {
    try {
        const { id } = await ctx.params

        const [defaultsRows, courseAssignmentRows, examAssignmentRows] = await Promise.all([
            prisma.aIPromptDefault.findMany({
                where: { templateId: id },
                select: { useCase: true },
            }),
            prisma.courseAIPromptAssignment.findMany({
                where: { templateId: id },
                select: {
                    useCase: true,
                    course: { select: { id: true, title: true } },
                },
            }),
            prisma.examAIPromptAssignment.findMany({
                where: { templateId: id },
                select: {
                    useCase: true,
                    exam: { select: { id: true, title: true } },
                },
            }),
        ])

        const defaultsCount = defaultsRows.length
        const courseAssignmentsCount = courseAssignmentRows.length
        const examAssignmentsCount = examAssignmentRows.length
        const dependency = {
            defaults: defaultsCount,
            courseAssignments: courseAssignmentsCount,
            examAssignments: examAssignmentsCount,
            defaultsDetails: defaultsRows.map((row) => ({
                useCase: row.useCase,
                url: '/admin/ai-config',
            })),
            courseDetails: courseAssignmentRows.map((row) => ({
                courseId: row.course.id,
                courseTitle: row.course.title,
                useCase: row.useCase,
                url: `/admin/courses/${row.course.id}/edit`,
            })),
            examDetails: examAssignmentRows.map((row) => ({
                examId: row.exam.id,
                examTitle: row.exam.title,
                useCase: row.useCase,
                url: `/admin/exams/${row.exam.id}/edit`,
            })),
        }
        const totalDependencyCount =
            dependency.defaults + dependency.courseAssignments + dependency.examAssignments

        if (totalDependencyCount > 0) {
            const dependencyMessages: string[] = []
            if (defaultsCount > 0) {
                dependencyMessages.push('it is currently selected as a default template')
            }
            if (courseAssignmentsCount > 0) {
                dependencyMessages.push(`it is assigned to ${courseAssignmentsCount} course${courseAssignmentsCount === 1 ? '' : 's'}`)
            }
            if (examAssignmentsCount > 0) {
                dependencyMessages.push(`it is assigned to ${examAssignmentsCount} exam${examAssignmentsCount === 1 ? '' : 's'}`)
            }

            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'AI_PROMPT_409',
                        message: `Template cannot be deleted because ${dependencyMessages.join(', ')}.`,
                        details: dependency,
                    },
                },
                { status: 409 }
            )
        }

        await prisma.aIPromptTemplate.delete({ where: { id } })
        return NextResponse.json({ success: true })
    } catch (error: unknown) {
        console.error('Delete AI prompt template error:', error)
        if (getPrismaCode(error) === 'P2021') {
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
        // FK RESTRICT (defaults/assignments) -> 409 conflict
        if (getPrismaCode(error) === 'P2003') {
            return NextResponse.json(
                { success: false, error: { code: 'AI_PROMPT_409', message: 'Template is in use and cannot be deleted' } },
                { status: 409 }
            )
        }
        return NextResponse.json(
            { success: false, error: { code: 'AI_PROMPT_005', message: 'Failed to delete prompt template' } },
            { status: 500 }
        )
    }
})
