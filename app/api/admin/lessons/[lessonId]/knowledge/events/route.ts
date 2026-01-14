/**
 * Knowledge Context Job Events API
 * Returns recent KnowledgeContext job events for observability/debugging
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'

export const GET = withAdminAuth(async (
    request: NextRequest,
    user,
    context: { params: Promise<{ lessonId: string }> }
) => {
    try {
        const { lessonId } = await context.params

        const job = await prisma.knowledgeContextJob.findFirst({
            where: { lessonId },
            orderBy: { createdAt: 'desc' },
            include: {
                events: {
                    take: 200,
                    orderBy: { createdAt: 'desc' },
                },
            },
        })

        const events = (job?.events ?? [])
            .slice()
            .reverse()
            .map(e => ({
                id: e.id,
                level: e.level,
                stage: e.stage,
                message: e.message,
                data: e.data,
                createdAt: e.createdAt.toISOString(),
            }))

        return NextResponse.json({
            success: true,
            data: {
                jobId: job?.id ?? null,
                events,
            },
        })
    } catch (error) {
        console.error('Get knowledge context events error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
})

