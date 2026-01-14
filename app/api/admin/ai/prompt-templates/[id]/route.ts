import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { AIResponseFormat, AIPromptUseCase } from '@prisma/client'
import { z } from 'zod'
import { SUPPORTED_OPENAI_MODELS } from '@/lib/services/openai-models'

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

export const GET = withAdminAuth(async (_req, _user, ctx) => {
    try {
        const id = ctx?.params?.id as string
        const template = await prisma.aIPromptTemplate.findUnique({ where: { id } })
        if (!template) {
            return NextResponse.json(
                { success: false, error: { code: 'AI_PROMPT_404', message: 'Prompt template not found' } },
                { status: 404 }
            )
        }
        return NextResponse.json({ success: true, data: template })
    } catch (error) {
        console.error('Get AI prompt template error:', error)
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
            { success: false, error: { code: 'AI_PROMPT_003', message: 'Failed to load prompt template' } },
            { status: 500 }
        )
    }
})

export const PATCH = withAdminAuth(async (req, _user, ctx) => {
    try {
        const id = ctx?.params?.id as string
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
    } catch (error) {
        console.error('Update AI prompt template error:', error)

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
            { success: false, error: { code: 'AI_PROMPT_004', message: 'Failed to update prompt template' } },
            { status: 500 }
        )
    }
})

export const DELETE = withAdminAuth(async (_req, _user, ctx) => {
    try {
        const id = ctx?.params?.id as string
        await prisma.aIPromptTemplate.delete({ where: { id } })
        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Delete AI prompt template error:', error)
        if (error?.code === 'P2021') {
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
        if (error?.code === 'P2003') {
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
