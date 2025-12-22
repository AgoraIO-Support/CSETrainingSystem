/**
 * Transcript Processing Events API
 * Returns recent job events for observability/debugging
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
        const params = await context.params
        const { lessonId } = params

        const transcript = await prisma.transcriptAsset.findFirst({
            where: { lessonId },
            orderBy: { createdAt: 'desc' },
        })

        if (!transcript) {
            return NextResponse.json({
                success: true,
                data: {
                    transcriptId: null,
                    jobId: null,
                    events: [],
                },
            })
        }

        const job = await prisma.transcriptProcessingJob.findFirst({
            where: { transcriptId: transcript.id },
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
                transcriptId: transcript.id,
                jobId: job?.id ?? null,
                events,
            },
        })
    } catch (error) {
        console.error('Get transcript events error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
})

