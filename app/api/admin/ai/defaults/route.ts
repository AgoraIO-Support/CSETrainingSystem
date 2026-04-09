import { NextResponse } from 'next/server'
import { withAdminAuth, withSmeOrAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { AIPromptUseCase } from '@prisma/client'
import { z } from 'zod'

const setDefaultSchema = z.object({
    useCase: z.nativeEnum(AIPromptUseCase),
    templateId: z.string().uuid(),
})

// GET /api/admin/ai/defaults
export const GET = withSmeOrAdminAuth(async () => {
    try {
        const defaults = await prisma.aIPromptDefault.findMany({
            include: {
                template: true,
            },
            orderBy: { useCase: 'asc' },
        })

        return NextResponse.json({ success: true, data: defaults })
    } catch (error) {
        console.error('List AI prompt defaults error:', error)
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
            { success: false, error: { code: 'AI_PROMPT_DEFAULT_001', message: 'Failed to load defaults' } },
            { status: 500 }
        )
    }
})

// PUT /api/admin/ai/defaults
export const PUT = withAdminAuth(async (req) => {
    try {
        const body = await req.json()
        const data = setDefaultSchema.parse(body)

        const template = await prisma.aIPromptTemplate.findUnique({ where: { id: data.templateId } })
        if (!template) {
            return NextResponse.json(
                { success: false, error: { code: 'AI_PROMPT_DEFAULT_404', message: 'Template not found' } },
                { status: 404 }
            )
        }

        if (template.useCase !== data.useCase) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'AI_PROMPT_DEFAULT_400',
                        message: `Template useCase mismatch: template=${template.useCase} requested=${data.useCase}`,
                    },
                },
                { status: 400 }
            )
        }

        const updated = await prisma.aIPromptDefault.upsert({
            where: { useCase: data.useCase },
            create: { useCase: data.useCase, templateId: data.templateId },
            update: { templateId: data.templateId },
            include: { template: true },
        })

        return NextResponse.json({ success: true, data: updated })
    } catch (error) {
        console.error('Set AI prompt default error:', error)
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
            { success: false, error: { code: 'AI_PROMPT_DEFAULT_002', message: 'Failed to set default' } },
            { status: 500 }
        )
    }
})
