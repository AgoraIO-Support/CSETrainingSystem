/**
 * Knowledge Context Job API
 * Enqueues async KnowledgeContext generation (worker required)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { KnowledgeContextJobService } from '@/lib/services/knowledge-context-job.service'
import { getPrimaryAiTranscriptTrack } from '@/lib/transcript-tracks'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

/**
 * POST /api/admin/lessons/[lessonId]/knowledge/process
 * Enqueue Knowledge Context generation from the selected or primary VTT transcript
 */
export const POST = withSmeOrAdminAuth(async (
    request: NextRequest,
    user,
    context: { params: Promise<{ lessonId: string }> }
) => {
    try {
        const { lessonId } = await context.params
        if (user.role === 'SME') await TrainingOpsService.assertScopedLessonAccess(user, lessonId)
        const body = await request.json().catch(() => ({} as Record<string, unknown>))

        const lesson = await prisma.lesson.findUnique({
            where: { id: lessonId },
            include: {
                chapter: { include: { course: true } },
                transcripts: {
                    where: {
                        isActive: true,
                        archivedAt: null,
                    },
                    orderBy: [{ isPrimaryForAI: 'desc' }, { isDefaultSubtitle: 'desc' }, { createdAt: 'asc' }],
                },
            },
        })

        if (!lesson) {
            return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
        }

        const requestedTranscript =
            typeof body?.transcriptId === 'string'
                ? lesson.transcripts.find((track) => track.id === body.transcriptId) ?? null
                : null
        if (typeof body?.transcriptId === 'string' && !requestedTranscript) {
            return NextResponse.json({ error: 'Requested transcript track not found' }, { status: 404 })
        }
        const transcript = requestedTranscript ?? getPrimaryAiTranscriptTrack(lesson.transcripts)

        if (!transcript) {
            return NextResponse.json(
                { error: 'No transcript found. Please upload a VTT file first.' },
                { status: 400 }
            )
        }

        const force = Boolean(body?.force)
        // Support both old field name (promptTemplateId) and new field names (knowledgePromptTemplateId, anchorsPromptTemplateId)
        const knowledgePromptTemplateId = typeof body?.knowledgePromptTemplateId === 'string' ? body.knowledgePromptTemplateId
            : typeof body?.promptTemplateId === 'string' ? body.promptTemplateId : null
        const anchorsPromptTemplateId = typeof body?.anchorsPromptTemplateId === 'string' ? body.anchorsPromptTemplateId : null

        const jobService = new KnowledgeContextJobService(prisma)

        // Check for any active job (QUEUED, RUNNING, or RETRY_WAIT) to prevent duplicates
        const activeJob = await jobService.getActiveJobForLesson(lessonId)
        if (activeJob && !force) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Knowledge context generation is already ${activeJob.state.toLowerCase().replace('_', ' ')}`,
                    data: {
                        lessonId,
                        jobId: activeJob.id,
                        state: activeJob.state,
                        stage: activeJob.stage,
                        progress: activeJob.progress,
                        lastHeartbeatAt: activeJob.lastHeartbeatAt?.toISOString() ?? null,
                    },
                },
                { status: 409 }
            )
        }

        if (force) {
            await jobService.cancelActiveJobs(lessonId)
        }

        const job = await jobService.enqueueJob({
            lessonId,
            transcriptId: transcript.id,
            metrics: {
                transcriptS3Key: transcript.s3Key,
                promptTemplateId: knowledgePromptTemplateId,
                anchorsPromptTemplateId,
            },
        })

        await jobService.appendEvent({
            jobId: job.id,
            level: 'info',
            stage: 'PENDING',
            message: 'Job enqueued',
            data: {
                lessonId,
                transcriptId: transcript.id,
                transcriptS3Key: transcript.s3Key,
                force,
                promptTemplateId: knowledgePromptTemplateId,
                anchorsPromptTemplateId,
            },
        })

        return NextResponse.json({
            success: true,
            message: 'Knowledge context generation queued',
            data: {
                lessonId,
                transcriptId: transcript.id,
                jobId: job.id,
                status: 'QUEUED',
            },
        })
    } catch (error) {
        console.error('Process knowledge context error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
})
