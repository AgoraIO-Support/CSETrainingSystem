/**
 * Transcript Processing Events API
 * Returns recent job events for observability/debugging
 */

import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { getPrimaryAiTranscriptTrack } from '@/lib/transcript-tracks'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

export const GET = withSmeOrAdminAuth(async (
    request: NextRequest,
    user,
    context: { params: Promise<{ lessonId: string }> }
) => {
    try {
        const params = await context.params
        const { lessonId } = params
        if (user.role === 'SME') await TrainingOpsService.assertScopedLessonAccess(user, lessonId)
        const { searchParams } = new URL(request.url)
        const transcriptId = searchParams.get('transcriptId')

        const tracks = await prisma.transcriptAsset.findMany({
            where: {
                lessonId,
                isActive: true,
                archivedAt: null,
            },
            orderBy: [{ isPrimaryForAI: 'desc' }, { isDefaultSubtitle: 'desc' }, { createdAt: 'asc' }],
        })

        const transcript =
            (transcriptId ? tracks.find((track) => track.id === transcriptId) : null) ??
            getPrimaryAiTranscriptTrack(tracks)

        if (transcriptId && !tracks.find((track) => track.id === transcriptId)) {
            return NextResponse.json({ error: 'Requested transcript track not found' }, { status: 404 })
        }

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
