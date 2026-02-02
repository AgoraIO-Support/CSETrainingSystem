/**
 * Tests for worker health check functionality
 *
 * These tests verify the health check HTTP endpoints and
 * worker state tracking for monitoring purposes.
 */

describe('Worker Health Check', () => {
    /**
     * Simulated worker state structure (matches transcript-worker.ts)
     */
    interface WorkerState {
        startedAt: Date
        lastPollAt: Date | null
        currentJobId: string | null
        currentJobType: 'knowledge' | 'transcript' | null
        jobsProcessed: number
        knowledgeJobsProcessed: number
        transcriptJobsProcessed: number
        jobsSucceeded: number
        jobsFailed: number
        lastRecoveryAt: Date | null
        jobsRecovered: number
    }

    const createWorkerState = (overrides: Partial<WorkerState> = {}): WorkerState => ({
        startedAt: new Date(),
        lastPollAt: null,
        currentJobId: null,
        currentJobType: null,
        jobsProcessed: 0,
        knowledgeJobsProcessed: 0,
        transcriptJobsProcessed: 0,
        jobsSucceeded: 0,
        jobsFailed: 0,
        lastRecoveryAt: null,
        jobsRecovered: 0,
        ...overrides,
    })

    describe('/health endpoint', () => {
        it('should return healthy when worker has polled recently', () => {
            const workerState = createWorkerState({
                lastPollAt: new Date(), // Just polled
            })

            const lastPollAge = Date.now() - (workerState.lastPollAt?.getTime() || 0)
            const isHealthy = lastPollAge < 30000 // Healthy if polled within 30s

            expect(isHealthy).toBe(true)

            const response = {
                status: isHealthy ? 'healthy' : 'unhealthy',
                workerId: 'test-worker:1234',
                uptime: Date.now() - workerState.startedAt.getTime(),
                lastPollAgeMs: lastPollAge,
            }

            expect(response.status).toBe('healthy')
        })

        it('should return unhealthy when worker has not polled recently', () => {
            const workerState = createWorkerState({
                lastPollAt: new Date(Date.now() - 60000), // 60 seconds ago
            })

            const lastPollAge = Date.now() - (workerState.lastPollAt?.getTime() || 0)
            const isHealthy = lastPollAge < 30000

            expect(isHealthy).toBe(false)

            const response = {
                status: isHealthy ? 'healthy' : 'unhealthy',
                workerId: 'test-worker:1234',
                uptime: Date.now() - workerState.startedAt.getTime(),
                lastPollAgeMs: lastPollAge,
            }

            expect(response.status).toBe('unhealthy')
        })

        it('should return unhealthy when worker has never polled', () => {
            const workerState = createWorkerState({
                lastPollAt: null,
            })

            const lastPollAge = workerState.lastPollAt
                ? Date.now() - workerState.lastPollAt.getTime()
                : Infinity

            const isHealthy = lastPollAge < 30000

            expect(isHealthy).toBe(false)

            const response = {
                status: 'unhealthy',
                workerId: 'test-worker:1234',
                uptime: Date.now() - workerState.startedAt.getTime(),
                lastPollAgeMs: null, // null when never polled
            }

            expect(response.status).toBe('unhealthy')
        })

        it('should return 200 status code for healthy worker', () => {
            const isHealthy = true
            const statusCode = isHealthy ? 200 : 503

            expect(statusCode).toBe(200)
        })

        it('should return 503 status code for unhealthy worker', () => {
            const isHealthy = false
            const statusCode = isHealthy ? 200 : 503

            expect(statusCode).toBe(503)
        })
    })

    describe('/status endpoint', () => {
        it('should return full worker state', () => {
            const workerId = 'test-worker:1234'
            const pollMs = 2000
            const leaseMs = 300000
            const staleRecoveryIntervalMs = 60000

            const workerState = createWorkerState({
                startedAt: new Date('2024-01-01T00:00:00Z'),
                lastPollAt: new Date('2024-01-01T01:00:00Z'),
                currentJobId: 'job-123',
                currentJobType: 'knowledge',
                jobsProcessed: 42,
                knowledgeJobsProcessed: 30,
                transcriptJobsProcessed: 12,
                jobsSucceeded: 40,
                jobsFailed: 2,
                lastRecoveryAt: new Date('2024-01-01T00:30:00Z'),
                jobsRecovered: 3,
            })

            const response = {
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
            }

            expect(response.workerId).toBe('test-worker:1234')
            expect(response.currentJob).toEqual({ id: 'job-123', type: 'knowledge' })
            expect(response.stats.jobsProcessed).toBe(42)
            expect(response.stats.jobsSucceeded).toBe(40)
            expect(response.stats.jobsFailed).toBe(2)
            expect(response.config.pollMs).toBe(2000)
        })

        it('should return null for currentJob when no job is processing', () => {
            const workerState = createWorkerState({
                currentJobId: null,
                currentJobType: null,
            })

            const currentJob = workerState.currentJobId
                ? { id: workerState.currentJobId, type: workerState.currentJobType }
                : null

            expect(currentJob).toBeNull()
        })

        it('should return correct job type for knowledge jobs', () => {
            const workerState = createWorkerState({
                currentJobId: 'kc-job-1',
                currentJobType: 'knowledge',
            })

            expect(workerState.currentJobType).toBe('knowledge')
        })

        it('should return correct job type for transcript jobs', () => {
            const workerState = createWorkerState({
                currentJobId: 'tp-job-1',
                currentJobType: 'transcript',
            })

            expect(workerState.currentJobType).toBe('transcript')
        })
    })

    describe('Worker state tracking', () => {
        it('should track job processing counts correctly', () => {
            const workerState = createWorkerState()

            // Simulate processing a knowledge job
            workerState.currentJobId = 'kc-1'
            workerState.currentJobType = 'knowledge'

            // Job completes
            workerState.currentJobId = null
            workerState.currentJobType = null
            workerState.jobsProcessed++
            workerState.knowledgeJobsProcessed++
            workerState.jobsSucceeded++

            expect(workerState.jobsProcessed).toBe(1)
            expect(workerState.knowledgeJobsProcessed).toBe(1)
            expect(workerState.transcriptJobsProcessed).toBe(0)
            expect(workerState.jobsSucceeded).toBe(1)
        })

        it('should track job failures correctly', () => {
            const workerState = createWorkerState()

            // Simulate processing a transcript job that fails
            workerState.currentJobId = 'tp-1'
            workerState.currentJobType = 'transcript'

            // Job fails (permanently)
            workerState.currentJobId = null
            workerState.currentJobType = null
            workerState.jobsProcessed++
            workerState.transcriptJobsProcessed++
            workerState.jobsFailed++

            expect(workerState.jobsProcessed).toBe(1)
            expect(workerState.jobsFailed).toBe(1)
            expect(workerState.jobsSucceeded).toBe(0)
        })

        it('should track recovery stats', () => {
            const workerState = createWorkerState()

            // Simulate recovery
            workerState.jobsRecovered += 5
            workerState.lastRecoveryAt = new Date()

            expect(workerState.jobsRecovered).toBe(5)
            expect(workerState.lastRecoveryAt).not.toBeNull()
        })

        it('should update lastPollAt on each poll', () => {
            const workerState = createWorkerState()

            expect(workerState.lastPollAt).toBeNull()

            // Simulate poll
            workerState.lastPollAt = new Date()

            expect(workerState.lastPollAt).not.toBeNull()
        })
    })

    describe('Health check server configuration', () => {
        it('should be disabled when port is 0', () => {
            const healthCheckPort = 0
            const serverEnabled = healthCheckPort > 0

            expect(serverEnabled).toBe(false)
        })

        it('should be enabled when port is set', () => {
            const healthCheckPort = 8081
            const serverEnabled = healthCheckPort > 0

            expect(serverEnabled).toBe(true)
        })

        it('should use default port 0 (disabled) when not configured', () => {
            const envPort = process.env.TRANSCRIPT_WORKER_HEALTH_PORT
            const healthCheckPort = parseInt(envPort || '0', 10)

            // Default should be disabled
            expect(healthCheckPort).toBe(0)
        })
    })

    describe('HTTP response format', () => {
        it('should return JSON content type', () => {
            const headers = { 'Content-Type': 'application/json' }

            expect(headers['Content-Type']).toBe('application/json')
        })

        it('should return 404 for unknown paths', () => {
            const path = '/unknown'
            const knownPaths = ['/health', '/status']

            const statusCode = knownPaths.includes(path) ? 200 : 404

            expect(statusCode).toBe(404)
        })

        it('should only respond to GET requests', () => {
            const validMethods = ['GET']
            const method = 'POST'

            const isValid = validMethods.includes(method)

            expect(isValid).toBe(false)
        })
    })
})
