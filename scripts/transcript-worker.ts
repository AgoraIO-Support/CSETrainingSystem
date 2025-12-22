import os from 'node:os'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import {
    Prisma,
    PrismaClient,
    TranscriptJobState,
    TranscriptStatus,
} from '@prisma/client'
import s3Client, { S3_BUCKET_NAME } from '../lib/aws-s3'
import { TranscriptProcessingService } from '../lib/services/transcript-processing.service'
import { TranscriptJobService } from '../lib/services/transcript-job.service'

type ClaimedJobRow = { id: string }

const workerId = process.env.TRANSCRIPT_WORKER_ID || `${os.hostname()}:${process.pid}`
const pollMs = parseInt(process.env.TRANSCRIPT_WORKER_POLL_MS || '2000', 10)
const leaseMs = parseInt(process.env.TRANSCRIPT_WORKER_LEASE_MS || '300000', 10)
const heartbeatThrottleMs = parseInt(process.env.TRANSCRIPT_WORKER_HEARTBEAT_THROTTLE_MS || '1000', 10)

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const computeBackoffMs = (attempt: number) => {
    const base = parseInt(process.env.TRANSCRIPT_WORKER_RETRY_BASE_MS || '30000', 10) // 30s
    const max = parseInt(process.env.TRANSCRIPT_WORKER_RETRY_MAX_MS || '600000', 10) // 10m
    const value = base * Math.pow(2, Math.max(0, attempt - 1))
    return Math.min(value, max)
}

async function claimNextJob(prisma: PrismaClient): Promise<string | null> {
    const leaseSeconds = Math.max(1, Math.floor(leaseMs / 1000))
    const rows = await prisma.$queryRaw<ClaimedJobRow[]>`
        WITH candidate AS (
            SELECT "id"
            FROM "transcript_processing_jobs"
            WHERE "state" IN (${TranscriptJobState.QUEUED}::"TranscriptJobState", ${TranscriptJobState.RETRY_WAIT}::"TranscriptJobState")
              AND "scheduledAt" <= NOW()
              AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" < NOW())
            ORDER BY "scheduledAt" ASC, "createdAt" ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        UPDATE "transcript_processing_jobs" j
        SET
            "state" = ${TranscriptJobState.RUNNING}::"TranscriptJobState",
            "attempt" = "attempt" + 1,
            "startedAt" = COALESCE("startedAt", NOW()),
            "lastHeartbeatAt" = NOW(),
            "leaseExpiresAt" = NOW() + (${leaseSeconds} * interval '1 second'),
            "workerId" = ${workerId},
            "updatedAt" = NOW()
        FROM candidate
        WHERE j."id" = candidate."id"
        RETURNING j."id";
    `

    return rows?.[0]?.id ?? null
}

async function downloadVtt(params: { s3Key: string }): Promise<{ content: string; bytes: number }> {
    const command = new GetObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: params.s3Key,
    })

    const response = await s3Client.send(command)
    const content = (await response.Body?.transformToString()) || ''
    return { content, bytes: Buffer.byteLength(content, 'utf8') }
}

async function main() {
    const prisma = new PrismaClient()
    const jobService = new TranscriptJobService(prisma)

    process.on('SIGINT', async () => {
        await prisma.$disconnect()
        process.exit(0)
    })
    process.on('SIGTERM', async () => {
        await prisma.$disconnect()
        process.exit(0)
    })

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const jobId = await claimNextJob(prisma)
        if (!jobId) {
            await sleep(pollMs)
            continue
        }

        const logContext = { jobId, workerId }
        let lastHeartbeatUpdate = 0
        const heartbeat = async (data: Partial<{
            stage: TranscriptStatus
            progress: number
            currentStep: string
            totalChunks: number
            processedChunks: number
            totalTokens: number
        }>) => {
            const now = Date.now()
            if (lastHeartbeatUpdate && now - lastHeartbeatUpdate < heartbeatThrottleMs) {
                return
            }
            lastHeartbeatUpdate = now

            const update: Prisma.TranscriptProcessingJobUpdateInput = {
                lastHeartbeatAt: new Date(),
                leaseExpiresAt: new Date(Date.now() + leaseMs),
            }
            if (data.stage !== undefined) update.stage = data.stage
            if (data.progress !== undefined) update.progress = data.progress
            if (data.currentStep !== undefined) update.currentStep = data.currentStep
            if (data.totalChunks !== undefined) update.totalChunks = data.totalChunks
            if (data.processedChunks !== undefined) update.processedChunks = data.processedChunks
            if (data.totalTokens !== undefined) update.totalTokens = data.totalTokens

            await prisma.transcriptProcessingJob.update({
                where: { id: jobId },
                data: update,
            })
        }

        try {
            const job = await prisma.transcriptProcessingJob.findUnique({
                where: { id: jobId },
                include: {
                    transcript: {
                        include: {
                            lesson: {
                                include: {
                                    chapter: { include: { course: true } },
                                },
                            },
                            videoAsset: true,
                        },
                    },
                },
            })

            if (!job) {
                continue
            }

            if (job.state !== TranscriptJobState.RUNNING) {
                continue
            }

            await jobService.appendEvent({
                jobId,
                level: 'info',
                stage: TranscriptStatus.PENDING,
                message: 'Job claimed',
                data: { ...logContext, transcriptId: job.transcriptId, lessonId: job.lessonId },
            })

            // Surface "not pending" as soon as worker starts.
            await prisma.transcriptAsset.update({
                where: { id: job.transcriptId },
                data: { status: TranscriptStatus.VALIDATING, errorMessage: null },
            })
            await heartbeat({ stage: TranscriptStatus.VALIDATING, progress: 1, currentStep: 'Downloading VTT from S3' })

            const s3Start = Date.now()
            const { content: vttContent, bytes } = await downloadVtt({ s3Key: job.transcript.s3Key })
            if (!vttContent) {
                throw new Error('Empty VTT file downloaded from S3')
            }

            await jobService.appendEvent({
                jobId,
                level: 'info',
                stage: TranscriptStatus.VALIDATING,
                message: 'VTT downloaded',
                data: {
                    ...logContext,
                    s3Key: job.transcript.s3Key,
                    bytes,
                    durationMs: Date.now() - s3Start,
                },
            })

            const processingContext = {
                lessonId: job.transcript.lesson.id,
                courseId: job.transcript.lesson.chapter.course.id,
                courseAssetId: job.transcript.videoAssetId,
                vttAssetId: job.transcript.id,
                courseName: job.transcript.lesson.chapter.course.title,
                chapterTitle: job.transcript.lesson.chapter.title,
                chapterIndex: job.transcript.lesson.chapter.order,
                lessonTitle: job.transcript.lesson.title,
                lessonIndex: job.transcript.lesson.order,
                language: job.transcript.language,
            }

            const processingService = new TranscriptProcessingService(prisma)
            await processingService.processTranscript(
                job.transcriptId,
                vttContent,
                processingContext,
                {
                    skipValidation: true,
                    videoDuration: job.transcript.lesson.duration ?? undefined,
                    logContext: { ...logContext, lessonId: job.lessonId, vttFileId: job.transcriptId },
                    embeddingRunOptions: {
                        logContext: { ...logContext, lessonId: job.lessonId, vttFileId: job.transcriptId },
                        onBatchEvent: async e => {
                            const level = e.type === 'batch_error' ? 'warn' : 'info'
                            await jobService.appendEvent({
                                jobId,
                                level,
                                stage: TranscriptStatus.EMBEDDING,
                                message: `Embedding ${e.type.replace('batch_', '').replace('_', ' ')}`,
                                data: { ...logContext, ...e },
                            })
                        },
                    },
                },
                async progress => {
                    await heartbeat({
                        stage: progress.status,
                        progress: Math.round(progress.progress),
                        currentStep: progress.currentStep,
                        totalChunks: progress.totalChunks,
                        processedChunks: progress.processedChunks,
                        totalTokens: progress.totalTokens,
                    })
                }
            )

            await prisma.transcriptProcessingJob.update({
                where: { id: jobId },
                data: {
                    state: TranscriptJobState.SUCCEEDED,
                    stage: TranscriptStatus.READY,
                    progress: 100,
                    currentStep: 'Completed',
                    finishedAt: new Date(),
                    leaseExpiresAt: null,
                },
            })

            await jobService.appendEvent({
                jobId,
                level: 'info',
                stage: TranscriptStatus.READY,
                message: 'Job completed',
                data: logContext,
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            const job = await prisma.transcriptProcessingJob.findUnique({ where: { id: jobId } })
            const attempt = job?.attempt ?? 1
            const maxAttempts = job?.maxAttempts ?? 5
            const canRetry = attempt < maxAttempts

            if (canRetry) {
                const backoffMs = computeBackoffMs(attempt)
                const scheduledAt = new Date(Date.now() + backoffMs)

                await prisma.transcriptProcessingJob.update({
                    where: { id: jobId },
                    data: {
                        state: TranscriptJobState.RETRY_WAIT,
                        stage: TranscriptStatus.FAILED,
                        currentStep: `Retry scheduled in ${Math.round(backoffMs / 1000)}s`,
                        errorMessage: message,
                        scheduledAt,
                        leaseExpiresAt: null,
                        lastHeartbeatAt: new Date(),
                    },
                })

                if (job?.transcriptId) {
                    await prisma.transcriptAsset.update({
                        where: { id: job.transcriptId },
                        data: {
                            status: TranscriptStatus.STALE,
                            errorMessage: message,
                        },
                    })
                }

                await jobService.appendEvent({
                    jobId,
                    level: 'warn',
                    stage: TranscriptStatus.FAILED,
                    message: 'Job failed; retry scheduled',
                    data: { ...logContext, attempt, maxAttempts, error: message, scheduledAt: scheduledAt.toISOString() },
                })
            } else {
                await prisma.transcriptProcessingJob.update({
                    where: { id: jobId },
                    data: {
                        state: TranscriptJobState.FAILED,
                        stage: TranscriptStatus.FAILED,
                        progress: 0,
                        currentStep: 'Failed',
                        errorMessage: message,
                        finishedAt: new Date(),
                        leaseExpiresAt: null,
                        lastHeartbeatAt: new Date(),
                    },
                })

                if (job?.transcriptId) {
                    await prisma.transcriptAsset.update({
                        where: { id: job.transcriptId },
                        data: {
                            status: TranscriptStatus.FAILED,
                            errorMessage: message,
                        },
                    })
                }

                await jobService.appendEvent({
                    jobId,
                    level: 'error',
                    stage: TranscriptStatus.FAILED,
                    message: 'Job failed; retries exhausted',
                    data: { ...logContext, attempt, maxAttempts, error: message },
                })
            }
        }
    }
}

main().catch(err => {
    console.error('[Transcript Worker] fatal', err)
    process.exit(1)
})
