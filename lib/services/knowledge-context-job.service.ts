import { Prisma, PrismaClient, KnowledgeContextJobStage, KnowledgeContextJobState } from '@prisma/client'

export class KnowledgeContextJobService {
    private prisma: PrismaClient

    constructor(prisma: PrismaClient) {
        this.prisma = prisma
    }

    async getLatestJobForLesson(lessonId: string) {
        return this.prisma.knowledgeContextJob.findFirst({
            where: { lessonId },
            orderBy: { createdAt: 'desc' },
        })
    }

    async getRunningJobForLesson(lessonId: string) {
        return this.prisma.knowledgeContextJob.findFirst({
            where: { lessonId, state: KnowledgeContextJobState.RUNNING },
            orderBy: { createdAt: 'desc' },
        })
    }

    /**
     * Check if any active job exists (QUEUED, RUNNING, or RETRY_WAIT)
     * Use this for duplicate prevention - prevents creating new jobs while one is pending
     */
    async getActiveJobForLesson(lessonId: string) {
        return this.prisma.knowledgeContextJob.findFirst({
            where: {
                lessonId,
                state: {
                    in: [
                        KnowledgeContextJobState.QUEUED,
                        KnowledgeContextJobState.RUNNING,
                        KnowledgeContextJobState.RETRY_WAIT,
                    ],
                },
            },
            orderBy: { createdAt: 'desc' },
        })
    }

    async cancelActiveJobs(lessonId: string) {
        await this.prisma.knowledgeContextJob.updateMany({
            where: {
                lessonId,
                state: { in: [KnowledgeContextJobState.QUEUED, KnowledgeContextJobState.RUNNING, KnowledgeContextJobState.RETRY_WAIT] },
            },
            data: {
                state: KnowledgeContextJobState.CANCELED,
                finishedAt: new Date(),
            },
        })
    }

    async enqueueJob(params: {
        lessonId: string
        transcriptId?: string | null
        maxAttempts?: number
        metrics?: Prisma.InputJsonValue
    }) {
        return this.prisma.knowledgeContextJob.create({
            data: {
                lessonId: params.lessonId,
                transcriptId: params.transcriptId ?? null,
                state: KnowledgeContextJobState.QUEUED,
                stage: KnowledgeContextJobStage.PENDING,
                progress: 0,
                currentStep: 'Queued',
                maxAttempts: params.maxAttempts ?? 5,
                metrics: params.metrics ?? ({} satisfies Prisma.InputJsonObject),
            },
        })
    }

    async appendEvent(params: {
        jobId: string
        level: 'info' | 'warn' | 'error'
        stage?: KnowledgeContextJobStage
        message: string
        data?: Prisma.InputJsonValue
    }) {
        await this.prisma.knowledgeContextJobEvent.create({
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

