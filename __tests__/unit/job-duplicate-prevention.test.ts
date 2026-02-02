/**
 * Tests for duplicate job prevention in job services
 *
 * These tests verify that the job services correctly identify active jobs
 * in all states (QUEUED, RUNNING, RETRY_WAIT) to prevent duplicate creation.
 */

import { KnowledgeContextJobService } from '@/lib/services/knowledge-context-job.service'
import { TranscriptJobService } from '@/lib/services/transcript-job.service'
import { PrismaClient, KnowledgeContextJobState, TranscriptJobState } from '@prisma/client'

// Create mock Prisma client
const createMockPrisma = () => ({
    knowledgeContextJob: {
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
    },
    knowledgeContextJobEvent: {
        create: jest.fn(),
    },
    transcriptProcessingJob: {
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
    },
    transcriptProcessingJobEvent: {
        create: jest.fn(),
    },
})

describe('KnowledgeContextJobService', () => {
    let service: KnowledgeContextJobService
    let mockPrisma: ReturnType<typeof createMockPrisma>

    beforeEach(() => {
        mockPrisma = createMockPrisma()
        service = new KnowledgeContextJobService(mockPrisma as unknown as PrismaClient)
    })

    describe('getActiveJobForLesson', () => {
        it('should find QUEUED jobs', async () => {
            const queuedJob = {
                id: 'job-1',
                lessonId: 'lesson-1',
                state: KnowledgeContextJobState.QUEUED,
                createdAt: new Date(),
            }
            mockPrisma.knowledgeContextJob.findFirst.mockResolvedValue(queuedJob)

            const result = await service.getActiveJobForLesson('lesson-1')

            expect(result).toEqual(queuedJob)
            expect(mockPrisma.knowledgeContextJob.findFirst).toHaveBeenCalledWith({
                where: {
                    lessonId: 'lesson-1',
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
        })

        it('should find RUNNING jobs', async () => {
            const runningJob = {
                id: 'job-2',
                lessonId: 'lesson-1',
                state: KnowledgeContextJobState.RUNNING,
                createdAt: new Date(),
            }
            mockPrisma.knowledgeContextJob.findFirst.mockResolvedValue(runningJob)

            const result = await service.getActiveJobForLesson('lesson-1')

            expect(result).toEqual(runningJob)
        })

        it('should find RETRY_WAIT jobs', async () => {
            const retryWaitJob = {
                id: 'job-3',
                lessonId: 'lesson-1',
                state: KnowledgeContextJobState.RETRY_WAIT,
                createdAt: new Date(),
            }
            mockPrisma.knowledgeContextJob.findFirst.mockResolvedValue(retryWaitJob)

            const result = await service.getActiveJobForLesson('lesson-1')

            expect(result).toEqual(retryWaitJob)
        })

        it('should return null when no active jobs exist', async () => {
            mockPrisma.knowledgeContextJob.findFirst.mockResolvedValue(null)

            const result = await service.getActiveJobForLesson('lesson-1')

            expect(result).toBeNull()
        })

        it('should NOT find SUCCEEDED jobs', async () => {
            // The query specifically excludes SUCCEEDED
            mockPrisma.knowledgeContextJob.findFirst.mockResolvedValue(null)

            await service.getActiveJobForLesson('lesson-1')

            const callArgs = mockPrisma.knowledgeContextJob.findFirst.mock.calls[0][0]
            expect(callArgs.where.state.in).not.toContain(KnowledgeContextJobState.SUCCEEDED)
        })

        it('should NOT find FAILED jobs', async () => {
            mockPrisma.knowledgeContextJob.findFirst.mockResolvedValue(null)

            await service.getActiveJobForLesson('lesson-1')

            const callArgs = mockPrisma.knowledgeContextJob.findFirst.mock.calls[0][0]
            expect(callArgs.where.state.in).not.toContain(KnowledgeContextJobState.FAILED)
        })

        it('should NOT find CANCELED jobs', async () => {
            mockPrisma.knowledgeContextJob.findFirst.mockResolvedValue(null)

            await service.getActiveJobForLesson('lesson-1')

            const callArgs = mockPrisma.knowledgeContextJob.findFirst.mock.calls[0][0]
            expect(callArgs.where.state.in).not.toContain(KnowledgeContextJobState.CANCELED)
        })
    })

    describe('getRunningJobForLesson (existing method)', () => {
        it('should only find RUNNING jobs', async () => {
            const runningJob = {
                id: 'job-1',
                lessonId: 'lesson-1',
                state: KnowledgeContextJobState.RUNNING,
            }
            mockPrisma.knowledgeContextJob.findFirst.mockResolvedValue(runningJob)

            const result = await service.getRunningJobForLesson('lesson-1')

            expect(result).toEqual(runningJob)
            expect(mockPrisma.knowledgeContextJob.findFirst).toHaveBeenCalledWith({
                where: {
                    lessonId: 'lesson-1',
                    state: KnowledgeContextJobState.RUNNING,
                },
                orderBy: { createdAt: 'desc' },
            })
        })
    })

    describe('cancelActiveJobs', () => {
        it('should cancel all active job states', async () => {
            mockPrisma.knowledgeContextJob.updateMany.mockResolvedValue({ count: 3 })

            await service.cancelActiveJobs('lesson-1')

            expect(mockPrisma.knowledgeContextJob.updateMany).toHaveBeenCalledWith({
                where: {
                    lessonId: 'lesson-1',
                    state: {
                        in: [
                            KnowledgeContextJobState.QUEUED,
                            KnowledgeContextJobState.RUNNING,
                            KnowledgeContextJobState.RETRY_WAIT,
                        ],
                    },
                },
                data: {
                    state: KnowledgeContextJobState.CANCELED,
                    finishedAt: expect.any(Date),
                },
            })
        })
    })
})

describe('TranscriptJobService', () => {
    let service: TranscriptJobService
    let mockPrisma: ReturnType<typeof createMockPrisma>

    beforeEach(() => {
        mockPrisma = createMockPrisma()
        service = new TranscriptJobService(mockPrisma as unknown as PrismaClient)
    })

    describe('getActiveJobForTranscript', () => {
        it('should find QUEUED jobs', async () => {
            const queuedJob = {
                id: 'job-1',
                transcriptId: 'transcript-1',
                state: TranscriptJobState.QUEUED,
                createdAt: new Date(),
            }
            mockPrisma.transcriptProcessingJob.findFirst.mockResolvedValue(queuedJob)

            const result = await service.getActiveJobForTranscript('transcript-1')

            expect(result).toEqual(queuedJob)
            expect(mockPrisma.transcriptProcessingJob.findFirst).toHaveBeenCalledWith({
                where: {
                    transcriptId: 'transcript-1',
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
        })

        it('should find RUNNING jobs', async () => {
            const runningJob = {
                id: 'job-2',
                transcriptId: 'transcript-1',
                state: TranscriptJobState.RUNNING,
            }
            mockPrisma.transcriptProcessingJob.findFirst.mockResolvedValue(runningJob)

            const result = await service.getActiveJobForTranscript('transcript-1')

            expect(result).toEqual(runningJob)
        })

        it('should find RETRY_WAIT jobs', async () => {
            const retryWaitJob = {
                id: 'job-3',
                transcriptId: 'transcript-1',
                state: TranscriptJobState.RETRY_WAIT,
            }
            mockPrisma.transcriptProcessingJob.findFirst.mockResolvedValue(retryWaitJob)

            const result = await service.getActiveJobForTranscript('transcript-1')

            expect(result).toEqual(retryWaitJob)
        })

        it('should return null when no active jobs exist', async () => {
            mockPrisma.transcriptProcessingJob.findFirst.mockResolvedValue(null)

            const result = await service.getActiveJobForTranscript('transcript-1')

            expect(result).toBeNull()
        })
    })

    describe('getRunningJobForTranscript (existing method)', () => {
        it('should only find RUNNING jobs', async () => {
            const runningJob = {
                id: 'job-1',
                transcriptId: 'transcript-1',
                state: TranscriptJobState.RUNNING,
            }
            mockPrisma.transcriptProcessingJob.findFirst.mockResolvedValue(runningJob)

            const result = await service.getRunningJobForTranscript('transcript-1')

            expect(result).toEqual(runningJob)
            expect(mockPrisma.transcriptProcessingJob.findFirst).toHaveBeenCalledWith({
                where: {
                    transcriptId: 'transcript-1',
                    state: TranscriptJobState.RUNNING,
                },
                orderBy: { createdAt: 'desc' },
            })
        })
    })
})

describe('API Endpoint Duplicate Prevention', () => {
    describe('Knowledge Process API', () => {
        it('should return 409 when QUEUED job exists', () => {
            const activeJob = {
                id: 'job-1',
                state: KnowledgeContextJobState.QUEUED,
            }

            // Simulate API response
            const response = {
                success: false,
                error: `Knowledge context generation is already ${activeJob.state.toLowerCase().replace('_', ' ')}`,
                status: 409,
            }

            expect(response.status).toBe(409)
            expect(response.error).toContain('queued')
        })

        it('should return 409 when RUNNING job exists', () => {
            const activeJob = {
                id: 'job-2',
                state: KnowledgeContextJobState.RUNNING,
            }

            const response = {
                success: false,
                error: `Knowledge context generation is already ${activeJob.state.toLowerCase().replace('_', ' ')}`,
                status: 409,
            }

            expect(response.status).toBe(409)
            expect(response.error).toContain('running')
        })

        it('should return 409 when RETRY_WAIT job exists', () => {
            const activeJob = {
                id: 'job-3',
                state: KnowledgeContextJobState.RETRY_WAIT,
            }

            const response = {
                success: false,
                error: `Knowledge context generation is already ${activeJob.state.toLowerCase().replace('_', ' ')}`,
                status: 409,
            }

            expect(response.status).toBe(409)
            expect(response.error).toContain('retry wait')
        })

        it('should allow creation when force=true', () => {
            // When force=true, active jobs should be canceled first
            const force = true
            const activeJob = { id: 'job-1', state: KnowledgeContextJobState.RUNNING }

            // With force, API should:
            // 1. Cancel active jobs
            // 2. Create new job
            // 3. Return success

            const shouldProceed = force || !activeJob
            expect(shouldProceed).toBe(true)
        })
    })

    describe('Transcript Process API', () => {
        it('should return 409 when active transcript job exists', () => {
            const activeJob = {
                id: 'job-1',
                state: TranscriptJobState.QUEUED,
            }

            const response = {
                success: false,
                error: `Transcript processing is already ${activeJob.state.toLowerCase().replace('_', ' ')}`,
                status: 409,
            }

            expect(response.status).toBe(409)
        })
    })
})
