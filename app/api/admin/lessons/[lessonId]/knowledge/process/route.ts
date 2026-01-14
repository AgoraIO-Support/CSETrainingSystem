/**
 * Knowledge Context Job API
 * Enqueues async KnowledgeContext generation (worker required)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { KnowledgeContextJobService } from '@/lib/services/knowledge-context-job.service'

/**
 * POST /api/admin/lessons/[lessonId]/knowledge/process
 * Enqueue Knowledge Context generation from latest VTT transcript
 */
export const POST = withAdminAuth(async (
    request: NextRequest,
    user,
    context: { params: Promise<{ lessonId: string }> }
) => {
    try {
        const { lessonId } = await context.params

        const lesson = await prisma.lesson.findUnique({
            where: { id: lessonId },
            include: {
                chapter: { include: { course: true } },
                transcripts: {
                    orderBy: { updatedAt: 'desc' },
                    take: 1,
                },
            },
        })

        if (!lesson) {
            return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
        }

        const transcript = lesson.transcripts[0] ?? null
        if (!transcript) {
            return NextResponse.json(
                { error: 'No transcript found. Please upload a VTT file first.' },
                { status: 400 }
            )
        }

        const body = await request.json().catch(() => ({} as any))
        const force = Boolean(body?.force)
        const promptTemplateId = typeof body?.promptTemplateId === 'string' ? body.promptTemplateId : null

        const jobService = new KnowledgeContextJobService(prisma)

        const runningJob = await jobService.getRunningJobForLesson(lessonId)
        if (runningJob && !force) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Knowledge context generation is already running',
                    data: {
                        lessonId,
                        jobId: runningJob.id,
                        state: runningJob.state,
                        stage: runningJob.stage,
                        progress: runningJob.progress,
                        lastHeartbeatAt: runningJob.lastHeartbeatAt?.toISOString() ?? null,
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
                promptTemplateId,
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
                promptTemplateId,
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

