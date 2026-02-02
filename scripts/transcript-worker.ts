import os from 'node:os'
import http from 'node:http'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import {
    Prisma,
    PrismaClient,
    KnowledgeContextJobStage,
    KnowledgeContextJobState,
    TranscriptJobState,
    TranscriptStatus,
} from '@prisma/client'
import s3Client, { ASSET_S3_BUCKET_NAME } from '../lib/aws-s3'
import { log } from '../lib/logger'
import { KnowledgeContextService } from '../lib/services/knowledge-context.service'
import { KnowledgeContextJobService } from '../lib/services/knowledge-context-job.service'
import { TranscriptProcessingService } from '../lib/services/transcript-processing.service'
import { TranscriptJobService } from '../lib/services/transcript-job.service'

type ClaimedJobRow = { id: string }

/** Worker health/metrics state for health check endpoint */
const workerState = {
    startedAt: new Date(),
    lastPollAt: null as Date | null,
    currentJobId: null as string | null,
    currentJobType: null as 'knowledge' | 'transcript' | null,
    jobsProcessed: 0,
    knowledgeJobsProcessed: 0,
    transcriptJobsProcessed: 0,
    jobsSucceeded: 0,
    jobsFailed: 0,
    lastRecoveryAt: null as Date | null,
    jobsRecovered: 0,
}

const workerId = process.env.TRANSCRIPT_WORKER_ID || `${os.hostname()}:${process.pid}`
const pollMs = parseInt(process.env.TRANSCRIPT_WORKER_POLL_MS || '2000', 10)
const leaseMs = parseInt(process.env.TRANSCRIPT_WORKER_LEASE_MS || '300000', 10)
const heartbeatThrottleMs = parseInt(process.env.TRANSCRIPT_WORKER_HEARTBEAT_THROTTLE_MS || '1000', 10)
const staleRecoveryIntervalMs = parseInt(process.env.TRANSCRIPT_WORKER_STALE_RECOVERY_MS || '60000', 10) // 60s
const healthCheckPort = parseInt(process.env.TRANSCRIPT_WORKER_HEALTH_PORT || '0', 10) // 0 = disabled

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Start HTTP health check server if port is configured.
 * Responds to:
 * - GET /health - Returns 200 if worker is healthy, 503 if unhealthy
 * - GET /status - Returns full worker state as JSON
 */
function startHealthCheckServer(): http.Server | null {
    if (!healthCheckPort || healthCheckPort <= 0) {
        return null
    }

    const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://localhost:${healthCheckPort}`)

        if (req.method === 'GET' && url.pathname === '/health') {
            // Simple health check - worker is healthy if it has polled recently
            const lastPollAge = workerState.lastPollAt
                ? Date.now() - workerState.lastPollAt.getTime()
                : Infinity

            // Unhealthy if no poll in last 30 seconds (15x poll interval)
            const isHealthy = lastPollAge < 30000

            res.writeHead(isHealthy ? 200 : 503, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
                status: isHealthy ? 'healthy' : 'unhealthy',
                workerId,
                uptime: Date.now() - workerState.startedAt.getTime(),
                lastPollAgeMs: lastPollAge === Infinity ? null : lastPollAge,
            }))
            return
        }

        if (req.method === 'GET' && url.pathname === '/status') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
                workerId,
                startedAt: workerState.startedAt.toISOString(),
                uptime: Date.now() - workerState.startedAt.getTime(),
                lastPollAt: workerState.lastPollAt?.toISOString() ?? null,
                currentJob: workerState.currentJobId
                    ? { id: workerState.currentJobId, type: workerState.currentJobType }
                    : null,
                stats: {
                    jobsProcessed: workerState.jobsProcessed,
                    knowledgeJobsProcessed: workerState.knowledgeJobsProcessed,
                    transcriptJobsProcessed: workerState.transcriptJobsProcessed,
                    jobsSucceeded: workerState.jobsSucceeded,
                    jobsFailed: workerState.jobsFailed,
                    jobsRecovered: workerState.jobsRecovered,
                },
                lastRecoveryAt: workerState.lastRecoveryAt?.toISOString() ?? null,
                config: {
                    pollMs,
                    leaseMs,
                    staleRecoveryIntervalMs,
                },
            }))
            return
        }

        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Not found' }))
    })

    server.listen(healthCheckPort, '0.0.0.0', () => {
        log('Worker', 'info', 'Health check server started', { port: healthCheckPort, workerId })
    })

    return server
}

const computeBackoffMs = (attempt: number) => {
    const base = parseInt(process.env.TRANSCRIPT_WORKER_RETRY_BASE_MS || '30000', 10) // 30s
    const max = parseInt(process.env.TRANSCRIPT_WORKER_RETRY_MAX_MS || '600000', 10) // 10m
    const value = base * Math.pow(2, Math.max(0, attempt - 1))
    return Math.min(value, max)
}

type RecoveredJobRow = { id: string; attempt: number; maxAttempts: number }

/**
 * Recovers stale knowledge context jobs that are stuck in RUNNING state with expired leases.
 * This handles cases where a worker crashed or was killed without releasing its jobs.
 */
async function recoverStaleKnowledgeJobs(prisma: PrismaClient): Promise<number> {
    // Find jobs stuck in RUNNING with expired leases
    const staleJobs = await prisma.$queryRaw<RecoveredJobRow[]>`
        SELECT "id", "attempt", "maxAttempts"
        FROM "knowledge_context_jobs"
        WHERE "state" = ${KnowledgeContextJobState.RUNNING}::"KnowledgeContextJobState"
          AND "leaseExpiresAt" IS NOT NULL
          AND "leaseExpiresAt" < NOW()
        LIMIT 100
    `

    let recoveredCount = 0
    for (const job of staleJobs) {
        const canRetry = job.attempt < job.maxAttempts
        const backoffMs = computeBackoffMs(job.attempt)
        const scheduledAt = new Date(Date.now() + backoffMs)

        if (canRetry) {
            await prisma.knowledgeContextJob.update({
                where: { id: job.id },
                data: {
                    state: KnowledgeContextJobState.RETRY_WAIT,
                    stage: KnowledgeContextJobStage.FAILED,
                    currentStep: `Recovered from stale state; retry in ${Math.round(backoffMs / 1000)}s`,
                    errorMessage: 'Worker lease expired (possible crash or timeout)',
                    scheduledAt,
                    leaseExpiresAt: null,
                    lastHeartbeatAt: new Date(),
                },
            })
            log('KnowledgeContext', 'warn', 'Recovered stale job for retry', {
                jobId: job.id,
                attempt: job.attempt,
                maxAttempts: job.maxAttempts,
                nextScheduledAt: scheduledAt.toISOString(),
            })
        } else {
            await prisma.knowledgeContextJob.update({
                where: { id: job.id },
                data: {
                    state: KnowledgeContextJobState.FAILED,
                    stage: KnowledgeContextJobStage.FAILED,
                    progress: 0,
                    currentStep: 'Failed after recovery (retries exhausted)',
                    errorMessage: 'Worker lease expired (possible crash or timeout); retries exhausted',
                    finishedAt: new Date(),
                    leaseExpiresAt: null,
                    lastHeartbeatAt: new Date(),
                },
            })
            log('KnowledgeContext', 'error', 'Marked stale job as failed (retries exhausted)', {
                jobId: job.id,
                attempt: job.attempt,
                maxAttempts: job.maxAttempts,
            })
        }
        recoveredCount++
    }

    return recoveredCount
}

/**
 * Recovers stale transcript processing jobs that are stuck in RUNNING state with expired leases.
 */
async function recoverStaleTranscriptJobs(prisma: PrismaClient): Promise<number> {
    const staleJobs = await prisma.$queryRaw<RecoveredJobRow[]>`
        SELECT "id", "attempt", "maxAttempts"
        FROM "transcript_processing_jobs"
        WHERE "state" = ${TranscriptJobState.RUNNING}::"TranscriptJobState"
          AND "leaseExpiresAt" IS NOT NULL
          AND "leaseExpiresAt" < NOW()
        LIMIT 100
    `

    let recoveredCount = 0
    for (const job of staleJobs) {
        const canRetry = job.attempt < job.maxAttempts
        const backoffMs = computeBackoffMs(job.attempt)
        const scheduledAt = new Date(Date.now() + backoffMs)

        if (canRetry) {
            await prisma.transcriptProcessingJob.update({
                where: { id: job.id },
                data: {
                    state: TranscriptJobState.RETRY_WAIT,
                    stage: TranscriptStatus.FAILED,
                    currentStep: `Recovered from stale state; retry in ${Math.round(backoffMs / 1000)}s`,
                    errorMessage: 'Worker lease expired (possible crash or timeout)',
                    scheduledAt,
                    leaseExpiresAt: null,
                    lastHeartbeatAt: new Date(),
                },
            })
            log('TranscriptProcessing', 'warn', 'Recovered stale job for retry', {
                jobId: job.id,
                attempt: job.attempt,
                maxAttempts: job.maxAttempts,
                nextScheduledAt: scheduledAt.toISOString(),
            })
        } else {
            await prisma.transcriptProcessingJob.update({
                where: { id: job.id },
                data: {
                    state: TranscriptJobState.FAILED,
                    stage: TranscriptStatus.FAILED,
                    progress: 0,
                    currentStep: 'Failed after recovery (retries exhausted)',
                    errorMessage: 'Worker lease expired (possible crash or timeout); retries exhausted',
                    finishedAt: new Date(),
                    leaseExpiresAt: null,
                    lastHeartbeatAt: new Date(),
                },
            })
            log('TranscriptProcessing', 'error', 'Marked stale job as failed (retries exhausted)', {
                jobId: job.id,
                attempt: job.attempt,
                maxAttempts: job.maxAttempts,
            })
        }
        recoveredCount++
    }

    return recoveredCount
}

/**
 * Runs stale job recovery for both job types.
 * Returns total number of jobs recovered.
 */
async function runStaleJobRecovery(prisma: PrismaClient): Promise<number> {
    const knowledgeRecovered = await recoverStaleKnowledgeJobs(prisma)
    const transcriptRecovered = await recoverStaleTranscriptJobs(prisma)
    const total = knowledgeRecovered + transcriptRecovered

    if (total > 0) {
        workerState.jobsRecovered += total
        workerState.lastRecoveryAt = new Date()
        log('Worker', 'info', 'Stale job recovery completed', {
            workerId,
            knowledgeJobsRecovered: knowledgeRecovered,
            transcriptJobsRecovered: transcriptRecovered,
        })
    }

    return total
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

async function claimNextKnowledgeJob(prisma: PrismaClient): Promise<string | null> {
    const leaseSeconds = Math.max(1, Math.floor(leaseMs / 1000))
    const rows = await prisma.$queryRaw<ClaimedJobRow[]>`
        WITH candidate AS (
            SELECT "id"
            FROM "knowledge_context_jobs"
            WHERE "state" IN (${KnowledgeContextJobState.QUEUED}::"KnowledgeContextJobState", ${KnowledgeContextJobState.RETRY_WAIT}::"KnowledgeContextJobState")
              AND "scheduledAt" <= NOW()
              AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" < NOW())
            ORDER BY "scheduledAt" ASC, "createdAt" ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        UPDATE "knowledge_context_jobs" j
        SET
            "state" = ${KnowledgeContextJobState.RUNNING}::"KnowledgeContextJobState",
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

/** Error class for categorized S3 errors */
class S3DownloadError extends Error {
    constructor(
        message: string,
        public readonly errorCode: string,
        public readonly isRetryable: boolean,
        public readonly originalError?: Error
    ) {
        super(message)
        this.name = 'S3DownloadError'
    }
}

async function downloadVtt(params: { s3Key: string }): Promise<{ content: string; bytes: number }> {
    const command = new GetObjectCommand({
        Bucket: ASSET_S3_BUCKET_NAME,
        Key: params.s3Key,
    })

    try {
        const response = await s3Client.send(command)
        const content = (await response.Body?.transformToString()) || ''

        if (!content) {
            throw new S3DownloadError(
                `VTT file is empty: ${params.s3Key}`,
                'EMPTY_FILE',
                false // Not retryable - file exists but is empty
            )
        }

        return { content, bytes: Buffer.byteLength(content, 'utf8') }
    } catch (error) {
        // If already an S3DownloadError, rethrow
        if (error instanceof S3DownloadError) {
            throw error
        }

        const err = error as Error & { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } }
        const errorName = err.name || ''
        const errorCode = err.Code || ''
        const httpStatus = err.$metadata?.httpStatusCode

        // Categorize S3 errors
        if (errorName === 'NoSuchKey' || errorCode === 'NoSuchKey') {
            throw new S3DownloadError(
                `VTT file not found in S3: ${params.s3Key}`,
                'NOT_FOUND',
                false, // Not retryable - file doesn't exist
                err
            )
        }

        if (errorName === 'NoSuchBucket' || errorCode === 'NoSuchBucket') {
            throw new S3DownloadError(
                `S3 bucket not found: ${ASSET_S3_BUCKET_NAME}`,
                'BUCKET_NOT_FOUND',
                false,
                err
            )
        }

        if (errorName === 'AccessDenied' || errorCode === 'AccessDenied' || httpStatus === 403) {
            throw new S3DownloadError(
                `Access denied to S3 object: ${params.s3Key}`,
                'ACCESS_DENIED',
                false, // Not retryable without config change
                err
            )
        }

        if (
            errorName === 'SlowDown' ||
            errorCode === 'SlowDown' ||
            errorCode === 'ServiceUnavailable' ||
            httpStatus === 503 ||
            httpStatus === 429
        ) {
            throw new S3DownloadError(
                `S3 throttling or service unavailable: ${params.s3Key}`,
                'THROTTLED',
                true, // Retryable
                err
            )
        }

        if (
            errorName === 'TimeoutError' ||
            errorName === 'RequestTimeout' ||
            errorCode === 'RequestTimeout' ||
            httpStatus === 408
        ) {
            throw new S3DownloadError(
                `S3 request timeout: ${params.s3Key}`,
                'TIMEOUT',
                true, // Retryable
                err
            )
        }

        // Network errors are generally retryable
        if (
            errorName === 'NetworkingError' ||
            errorName === 'ECONNRESET' ||
            errorName === 'ENOTFOUND' ||
            errorName === 'ETIMEDOUT'
        ) {
            throw new S3DownloadError(
                `Network error downloading VTT: ${params.s3Key} - ${err.message}`,
                'NETWORK_ERROR',
                true, // Retryable
                err
            )
        }

        // Unknown S3 error - assume retryable
        throw new S3DownloadError(
            `Failed to download VTT from S3: ${params.s3Key} - ${err.message}`,
            'UNKNOWN',
            true,
            err
        )
    }
}

async function runKnowledgeContextJob(params: {
    prisma: PrismaClient
    jobId: string
    jobService: KnowledgeContextJobService
}) {
    const { prisma, jobId, jobService } = params

    const logContext = { jobId, workerId }
    let lastHeartbeatUpdate = 0
    const heartbeat = async (data: Partial<{ stage: KnowledgeContextJobStage; progress: number; currentStep: string }>) => {
        const now = Date.now()
        if (lastHeartbeatUpdate && now - lastHeartbeatUpdate < heartbeatThrottleMs) {
            return
        }
        lastHeartbeatUpdate = now

        const update: Prisma.KnowledgeContextJobUpdateInput = {
            lastHeartbeatAt: new Date(),
            leaseExpiresAt: new Date(Date.now() + leaseMs),
        }
        if (data.stage !== undefined) update.stage = data.stage
        if (data.progress !== undefined) update.progress = data.progress
        if (data.currentStep !== undefined) update.currentStep = data.currentStep

        await prisma.knowledgeContextJob.update({
            where: { id: jobId },
            data: update,
        })
    }

    try {
        const job = await prisma.knowledgeContextJob.findUnique({
            where: { id: jobId },
            include: {
                lesson: {
                    include: {
                        chapter: { include: { course: true } },
                        transcripts: { orderBy: { updatedAt: 'desc' }, take: 1 },
                    },
                },
                transcript: true,
            },
        })

        if (!job || job.state !== KnowledgeContextJobState.RUNNING) {
            return
        }

        const transcript = job.transcript ?? job.lesson.transcripts[0] ?? null
        if (!transcript) {
            throw new Error('No transcript found for lesson')
        }

        const promptTemplateId =
            (job.metrics as any)?.promptTemplateId && typeof (job.metrics as any).promptTemplateId === 'string'
                ? ((job.metrics as any).promptTemplateId as string)
                : null

        await jobService.appendEvent({
            jobId,
            level: 'info',
            stage: KnowledgeContextJobStage.PENDING,
            message: 'Job claimed',
            data: { ...logContext, lessonId: job.lessonId, transcriptId: transcript.id },
        })

        await heartbeat({
            stage: KnowledgeContextJobStage.DOWNLOADING_VTT,
            progress: 1,
            currentStep: 'Downloading VTT from S3',
        })

        const s3Start = Date.now()
        const { content: vttContent, bytes } = await downloadVtt({ s3Key: transcript.s3Key })
        if (!vttContent) {
            throw new Error('Empty VTT file downloaded from S3')
        }

        await jobService.appendEvent({
            jobId,
            level: 'info',
            stage: KnowledgeContextJobStage.DOWNLOADING_VTT,
            message: 'VTT downloaded',
            data: {
                ...logContext,
                lessonId: job.lessonId,
                transcriptId: transcript.id,
                s3Key: transcript.s3Key,
                bytes,
                durationMs: Date.now() - s3Start,
            },
        })

        await heartbeat({
            stage: KnowledgeContextJobStage.GENERATING_XML,
            progress: 10,
            currentStep: 'Generating XML knowledge context',
        })

        log('KnowledgeContext', 'info', 'Job started', {
            jobId,
            lessonId: job.lessonId,
            transcriptId: transcript.id,
            promptTemplateId,
        })

        const knowledgeService = new KnowledgeContextService(process.env.OPENAI_API_KEY)

        const context = {
            courseId: job.lesson.chapter.course.id,
            courseTitle: job.lesson.chapter.course.title,
            lessonId: job.lesson.id,
            lessonTitle: job.lesson.title,
            chapterTitle: job.lesson.chapter.title,
            lessonDescription: job.lesson.description || undefined,
            promptTemplateIdOverride: promptTemplateId ?? undefined,
        }

        await knowledgeService.generateAndStoreContext(job.lessonId, vttContent, context, {
            onJobStage: async ({ stage, progress, currentStep }) => {
                await heartbeat({
                    stage,
                    progress: progress ?? undefined,
                    currentStep: currentStep ?? undefined,
                })
                await jobService.appendEvent({
                    jobId,
                    level: 'info',
                    stage,
                    message: currentStep || `Stage: ${stage}`,
                    data: { ...logContext, lessonId: job.lessonId },
                })
            },
        })

        await prisma.knowledgeContextJob.update({
            where: { id: jobId },
            data: {
                state: KnowledgeContextJobState.SUCCEEDED,
                stage: KnowledgeContextJobStage.COMPLETED,
                progress: 100,
                currentStep: 'Completed',
                finishedAt: new Date(),
                leaseExpiresAt: null,
            },
        })

        workerState.jobsSucceeded++

        await jobService.appendEvent({
            jobId,
            level: 'info',
            stage: KnowledgeContextJobStage.COMPLETED,
            message: 'Job completed',
            data: logContext,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        const errorCode = error instanceof S3DownloadError ? error.errorCode : undefined
        const isRetryable = error instanceof S3DownloadError ? error.isRetryable : true

        const job = await prisma.knowledgeContextJob.findUnique({ where: { id: jobId } })
        const attempt = job?.attempt ?? 1
        const maxAttempts = job?.maxAttempts ?? 5
        // Only retry if error is retryable and we haven't exhausted attempts
        const canRetry = isRetryable && attempt < maxAttempts

        if (canRetry) {
            const backoffMs = computeBackoffMs(attempt)
            const scheduledAt = new Date(Date.now() + backoffMs)

            await prisma.knowledgeContextJob.update({
                where: { id: jobId },
                data: {
                    state: KnowledgeContextJobState.RETRY_WAIT,
                    stage: KnowledgeContextJobStage.FAILED,
                    currentStep: `Retry scheduled in ${Math.round(backoffMs / 1000)}s`,
                    errorCode: errorCode ?? null,
                    errorMessage: message,
                    scheduledAt,
                    leaseExpiresAt: null,
                    lastHeartbeatAt: new Date(),
                },
            })

            await jobService.appendEvent({
                jobId,
                level: 'warn',
                stage: KnowledgeContextJobStage.FAILED,
                message: 'Job failed; retry scheduled',
                data: { ...logContext, attempt, maxAttempts, error: message, errorCode, isRetryable, scheduledAt: scheduledAt.toISOString() },
            })
        } else {
            const failureReason = !isRetryable
                ? `Non-retryable error (${errorCode || 'unknown'})`
                : 'Retries exhausted'

            await prisma.knowledgeContextJob.update({
                where: { id: jobId },
                data: {
                    state: KnowledgeContextJobState.FAILED,
                    stage: KnowledgeContextJobStage.FAILED,
                    progress: 0,
                    currentStep: `Failed: ${failureReason}`,
                    errorCode: errorCode ?? null,
                    errorMessage: message,
                    finishedAt: new Date(),
                    leaseExpiresAt: null,
                    lastHeartbeatAt: new Date(),
                },
            })

            workerState.jobsFailed++

            await jobService.appendEvent({
                jobId,
                level: 'error',
                stage: KnowledgeContextJobStage.FAILED,
                message: `Job failed; ${failureReason.toLowerCase()}`,
                data: { ...logContext, attempt, maxAttempts, error: message, errorCode, isRetryable },
            })
        }
    }
}

async function runTranscriptJob(params: {
    prisma: PrismaClient
    jobId: string
    jobService: TranscriptJobService
}) {
    const { prisma, jobId, jobService } = params

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
            return
        }

        if (job.state !== TranscriptJobState.RUNNING) {
            return
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

        workerState.jobsSucceeded++

        await jobService.appendEvent({
            jobId,
            level: 'info',
            stage: TranscriptStatus.READY,
            message: 'Job completed',
            data: logContext,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        const errorCode = error instanceof S3DownloadError ? error.errorCode : undefined
        const isRetryable = error instanceof S3DownloadError ? error.isRetryable : true

        const job = await prisma.transcriptProcessingJob.findUnique({ where: { id: jobId } })
        const attempt = job?.attempt ?? 1
        const maxAttempts = job?.maxAttempts ?? 5
        const canRetry = isRetryable && attempt < maxAttempts

        if (canRetry) {
            const backoffMs = computeBackoffMs(attempt)
            const scheduledAt = new Date(Date.now() + backoffMs)

            await prisma.transcriptProcessingJob.update({
                where: { id: jobId },
                data: {
                    state: TranscriptJobState.RETRY_WAIT,
                    stage: TranscriptStatus.FAILED,
                    currentStep: `Retry scheduled in ${Math.round(backoffMs / 1000)}s`,
                    errorCode: errorCode ?? null,
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
                data: { ...logContext, attempt, maxAttempts, error: message, errorCode, isRetryable, scheduledAt: scheduledAt.toISOString() },
            })
        } else {
            const failureReason = !isRetryable
                ? `Non-retryable error (${errorCode || 'unknown'})`
                : 'Retries exhausted'

            await prisma.transcriptProcessingJob.update({
                where: { id: jobId },
                data: {
                    state: TranscriptJobState.FAILED,
                    stage: TranscriptStatus.FAILED,
                    progress: 0,
                    currentStep: `Failed: ${failureReason}`,
                    errorCode: errorCode ?? null,
                    errorMessage: message,
                    finishedAt: new Date(),
                    leaseExpiresAt: null,
                    lastHeartbeatAt: new Date(),
                },
            })

            workerState.jobsFailed++

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
                message: `Job failed; ${failureReason.toLowerCase()}`,
                data: { ...logContext, attempt, maxAttempts, error: message, errorCode, isRetryable },
            })
        }
    }
}

async function main() {
    const prisma = new PrismaClient()
    const jobService = new TranscriptJobService(prisma)
    const knowledgeJobService = new KnowledgeContextJobService(prisma)

    // Start health check server if configured
    const healthServer = startHealthCheckServer()

    process.on('SIGINT', async () => {
        log('Worker', 'info', 'Received SIGINT, shutting down', { workerId })
        healthServer?.close()
        await prisma.$disconnect()
        process.exit(0)
    })
    process.on('SIGTERM', async () => {
        log('Worker', 'info', 'Received SIGTERM, shutting down', { workerId })
        healthServer?.close()
        await prisma.$disconnect()
        process.exit(0)
    })

    log('Worker', 'info', 'Worker starting', {
        workerId,
        pollMs,
        leaseMs,
        staleRecoveryIntervalMs,
        healthCheckPort: healthCheckPort || 'disabled',
    })

    // Run stale job recovery on startup
    const startupRecovered = await runStaleJobRecovery(prisma)
    if (startupRecovered > 0) {
        log('Worker', 'info', 'Startup recovery completed', { workerId, recoveredJobs: startupRecovered })
    }

    let lastStaleRecoveryTime = Date.now()

    // eslint-disable-next-line no-constant-condition
    while (true) {
        // Update poll timestamp for health check
        workerState.lastPollAt = new Date()

        // Periodically run stale job recovery
        const now = Date.now()
        if (now - lastStaleRecoveryTime >= staleRecoveryIntervalMs) {
            await runStaleJobRecovery(prisma)
            lastStaleRecoveryTime = now
        }

        const knowledgeJobId = await claimNextKnowledgeJob(prisma)
        if (knowledgeJobId) {
            // Track current job for health check
            workerState.currentJobId = knowledgeJobId
            workerState.currentJobType = 'knowledge'

            await runKnowledgeContextJob({
                prisma,
                jobId: knowledgeJobId,
                jobService: knowledgeJobService,
            })

            // Update stats after job completes
            workerState.currentJobId = null
            workerState.currentJobType = null
            workerState.jobsProcessed++
            workerState.knowledgeJobsProcessed++
            continue
        }

        const jobId = await claimNextJob(prisma)
        if (!jobId) {
            await sleep(pollMs)
            continue
        }

        // Track current job for health check
        workerState.currentJobId = jobId
        workerState.currentJobType = 'transcript'

        await runTranscriptJob({ prisma, jobId, jobService })

        // Update stats after job completes
        workerState.currentJobId = null
        workerState.currentJobType = null
        workerState.jobsProcessed++
        workerState.transcriptJobsProcessed++
    }
}

main().catch(err => {
    console.error('[Transcript Worker] fatal', err)
    process.exit(1)
})
