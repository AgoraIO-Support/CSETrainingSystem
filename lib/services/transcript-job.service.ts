import { Prisma, PrismaClient, TranscriptJobState, TranscriptStatus } from '@prisma/client'

export class TranscriptJobService {
    private prisma: PrismaClient

    constructor(prisma: PrismaClient) {
        this.prisma = prisma
    }

    async getLatestJobForTranscript(transcriptId: string) {
        return this.prisma.transcriptProcessingJob.findFirst({
            where: { transcriptId },
            orderBy: { createdAt: 'desc' },
        })
    }

    async getRunningJobForTranscript(transcriptId: string) {
        return this.prisma.transcriptProcessingJob.findFirst({
            where: { transcriptId, state: TranscriptJobState.RUNNING },
            orderBy: { createdAt: 'desc' },
        })
    }

    /**
     * Check if any active job exists (QUEUED, RUNNING, or RETRY_WAIT)
     * Use this for duplicate prevention - prevents creating new jobs while one is pending
     */
    async getActiveJobForTranscript(transcriptId: string) {
        return this.prisma.transcriptProcessingJob.findFirst({
            where: {
                transcriptId,
                state: {
                    in: [
                        TranscriptJobState.QUEUED,
                        TranscriptJobState.RUNNING,
                        TranscriptJobState.RETRY_WAIT,
                    ],
                },
            },
            orderBy: { createdAt: 'desc' },
        })
    }

    async cancelActiveJobs(transcriptId: string) {
        await this.prisma.transcriptProcessingJob.updateMany({
            where: {
                transcriptId,
                state: { in: [TranscriptJobState.QUEUED, TranscriptJobState.RUNNING, TranscriptJobState.RETRY_WAIT] },
            },
            data: {
                state: TranscriptJobState.CANCELED,
                finishedAt: new Date(),
            },
        })
    }

    async enqueueJob(params: {
        transcriptId: string
        lessonId: string
        maxAttempts?: number
    }) {
        return this.prisma.transcriptProcessingJob.create({
            data: {
                transcriptId: params.transcriptId,
                lessonId: params.lessonId,
                state: TranscriptJobState.QUEUED,
                stage: TranscriptStatus.PENDING,
                progress: 0,
                currentStep: 'Queued',
                maxAttempts: params.maxAttempts ?? 5,
            },
        })
    }

    async appendEvent(params: {
        jobId: string
        level: 'info' | 'warn' | 'error'
        stage?: TranscriptStatus
        message: string
        data?: Prisma.InputJsonValue
    }) {
        await this.prisma.transcriptProcessingJobEvent.create({
            data: {
                jobId: params.jobId,
                level: params.level,
                stage: params.stage,
                message: params.message,
                data: params.data ?? ({} satisfies Prisma.InputJsonObject),
            },
        })
    }
}
