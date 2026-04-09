import { NextResponse } from 'next/server'
import { withAdminAuth, withSmeOrAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { AIResponseFormat, AIPromptUseCase } from '@prisma/client'
import { z } from 'zod'
import { SUPPORTED_OPENAI_MODELS } from '@/lib/services/openai-models'

const createTemplateSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    useCase: z.nativeEnum(AIPromptUseCase),
    systemPrompt: z.string().min(1),
    userPrompt: z.string().optional().nullable(),
    variables: z.array(z.string()).optional().default([]),
    model: z.enum(SUPPORTED_OPENAI_MODELS).optional().default('gpt-4o-mini'),
    temperature: z.number().min(0).max(2).optional().default(0.2),
    maxTokens: z.number().int().min(1).max(32768).optional().default(1024),
    responseFormat: z.nativeEnum(AIResponseFormat).optional().default(AIResponseFormat.TEXT),
    isActive: z.boolean().optional().default(true),
})

// GET /api/admin/ai/prompt-templates
export const GET = withSmeOrAdminAuth(async (req) => {
    try {
        const { searchParams } = new URL(req.url)
        const useCase = searchParams.get('useCase')

        const templates = await prisma.aIPromptTemplate.findMany({
            where: useCase ? { useCase: useCase as AIPromptUseCase } : undefined,
            orderBy: { updatedAt: 'desc' },
        })

        return NextResponse.json({ success: true, data: templates })
    } catch (error) {
        console.error('List AI prompt templates error:', error)
        // Prisma: table missing (migrations not applied)
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
            { success: false, error: { code: 'AI_PROMPT_001', message: 'Failed to list prompt templates' } },
            { status: 500 }
        )
    }
})

// POST /api/admin/ai/prompt-templates
export const POST = withAdminAuth(async (req) => {
    try {
        const body = await req.json()
        const data = createTemplateSchema.parse(body)

        const created = await prisma.aIPromptTemplate.create({
            data: {
                name: data.name,
                description: data.description ?? null,
                useCase: data.useCase,
                // Keep legacy `template` populated for backward compatibility.
                template: data.systemPrompt,
                systemPrompt: data.systemPrompt,
                userPrompt: data.userPrompt ?? null,
                variables: data.variables,
                model: data.model,
                temperature: data.temperature,
                maxTokens: data.maxTokens,
                responseFormat: data.responseFormat,
                isActive: data.isActive,
            },
        })

        return NextResponse.json({ success: true, data: created }, { status: 201 })
    } catch (error) {
        console.error('Create AI prompt template error:', error)

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
            { success: false, error: { code: 'AI_PROMPT_002', message: 'Failed to create prompt template' } },
            { status: 500 }
        )
    }
})
