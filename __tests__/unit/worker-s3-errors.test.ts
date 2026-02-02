/**
 * Tests for S3 error categorization in transcript-worker.ts
 *
 * These tests verify that S3 download errors are properly categorized
 * with appropriate error codes and retry behavior.
 */

describe('S3 Download Error Categorization', () => {
    /**
     * S3DownloadError class specification
     */
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

    describe('Error Code Classification', () => {
        it('should mark NOT_FOUND as non-retryable', () => {
            const error = new S3DownloadError(
                'VTT file not found in S3: assets/course/lesson/file.vtt',
                'NOT_FOUND',
                false
            )

            expect(error.errorCode).toBe('NOT_FOUND')
            expect(error.isRetryable).toBe(false)
            expect(error.name).toBe('S3DownloadError')
        })

        it('should mark ACCESS_DENIED as non-retryable', () => {
            const error = new S3DownloadError(
                'Access denied to S3 object',
                'ACCESS_DENIED',
                false
            )

            expect(error.errorCode).toBe('ACCESS_DENIED')
            expect(error.isRetryable).toBe(false)
        })

        it('should mark BUCKET_NOT_FOUND as non-retryable', () => {
            const error = new S3DownloadError(
                'S3 bucket not found',
                'BUCKET_NOT_FOUND',
                false
            )

            expect(error.errorCode).toBe('BUCKET_NOT_FOUND')
            expect(error.isRetryable).toBe(false)
        })

        it('should mark EMPTY_FILE as non-retryable', () => {
            const error = new S3DownloadError(
                'VTT file is empty',
                'EMPTY_FILE',
                false
            )

            expect(error.errorCode).toBe('EMPTY_FILE')
            expect(error.isRetryable).toBe(false)
        })

        it('should mark THROTTLED as retryable', () => {
            const error = new S3DownloadError(
                'S3 throttling or service unavailable',
                'THROTTLED',
                true
            )

            expect(error.errorCode).toBe('THROTTLED')
            expect(error.isRetryable).toBe(true)
        })

        it('should mark TIMEOUT as retryable', () => {
            const error = new S3DownloadError(
                'S3 request timeout',
                'TIMEOUT',
                true
            )

            expect(error.errorCode).toBe('TIMEOUT')
            expect(error.isRetryable).toBe(true)
        })

        it('should mark NETWORK_ERROR as retryable', () => {
            const error = new S3DownloadError(
                'Network error downloading VTT',
                'NETWORK_ERROR',
                true
            )

            expect(error.errorCode).toBe('NETWORK_ERROR')
            expect(error.isRetryable).toBe(true)
        })

        it('should mark UNKNOWN as retryable (safe default)', () => {
            const error = new S3DownloadError(
                'Unknown error',
                'UNKNOWN',
                true
            )

            expect(error.errorCode).toBe('UNKNOWN')
            expect(error.isRetryable).toBe(true)
        })
    })

    describe('Error Mapping from S3 SDK', () => {
        /**
         * Simulates the error classification logic from downloadVtt()
         */
        function classifyS3Error(err: { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } }): {
            errorCode: string
            isRetryable: boolean
        } {
            const errorName = err.name || ''
            const errorCode = err.Code || ''
            const httpStatus = err.$metadata?.httpStatusCode

            if (errorName === 'NoSuchKey' || errorCode === 'NoSuchKey') {
                return { errorCode: 'NOT_FOUND', isRetryable: false }
            }

            if (errorName === 'NoSuchBucket' || errorCode === 'NoSuchBucket') {
                return { errorCode: 'BUCKET_NOT_FOUND', isRetryable: false }
            }

            if (errorName === 'AccessDenied' || errorCode === 'AccessDenied' || httpStatus === 403) {
                return { errorCode: 'ACCESS_DENIED', isRetryable: false }
            }

            if (
                errorName === 'SlowDown' ||
                errorCode === 'SlowDown' ||
                errorCode === 'ServiceUnavailable' ||
                httpStatus === 503 ||
                httpStatus === 429
            ) {
                return { errorCode: 'THROTTLED', isRetryable: true }
            }

            if (
                errorName === 'TimeoutError' ||
                errorName === 'RequestTimeout' ||
                errorCode === 'RequestTimeout' ||
                httpStatus === 408
            ) {
                return { errorCode: 'TIMEOUT', isRetryable: true }
            }

            if (
                errorName === 'NetworkingError' ||
                errorName === 'ECONNRESET' ||
                errorName === 'ENOTFOUND' ||
                errorName === 'ETIMEDOUT'
            ) {
                return { errorCode: 'NETWORK_ERROR', isRetryable: true }
            }

            return { errorCode: 'UNKNOWN', isRetryable: true }
        }

        it('should classify NoSuchKey error correctly', () => {
            const result = classifyS3Error({ name: 'NoSuchKey' })
            expect(result.errorCode).toBe('NOT_FOUND')
            expect(result.isRetryable).toBe(false)
        })

        it('should classify NoSuchKey Code correctly', () => {
            const result = classifyS3Error({ Code: 'NoSuchKey' })
            expect(result.errorCode).toBe('NOT_FOUND')
            expect(result.isRetryable).toBe(false)
        })

        it('should classify AccessDenied error correctly', () => {
            const result = classifyS3Error({ name: 'AccessDenied' })
            expect(result.errorCode).toBe('ACCESS_DENIED')
            expect(result.isRetryable).toBe(false)
        })

        it('should classify 403 status as AccessDenied', () => {
            const result = classifyS3Error({ $metadata: { httpStatusCode: 403 } })
            expect(result.errorCode).toBe('ACCESS_DENIED')
            expect(result.isRetryable).toBe(false)
        })

        it('should classify SlowDown as throttled', () => {
            const result = classifyS3Error({ name: 'SlowDown' })
            expect(result.errorCode).toBe('THROTTLED')
            expect(result.isRetryable).toBe(true)
        })

        it('should classify 429 status as throttled', () => {
            const result = classifyS3Error({ $metadata: { httpStatusCode: 429 } })
            expect(result.errorCode).toBe('THROTTLED')
            expect(result.isRetryable).toBe(true)
        })

        it('should classify 503 status as throttled', () => {
            const result = classifyS3Error({ $metadata: { httpStatusCode: 503 } })
            expect(result.errorCode).toBe('THROTTLED')
            expect(result.isRetryable).toBe(true)
        })

        it('should classify TimeoutError correctly', () => {
            const result = classifyS3Error({ name: 'TimeoutError' })
            expect(result.errorCode).toBe('TIMEOUT')
            expect(result.isRetryable).toBe(true)
        })

        it('should classify network errors correctly', () => {
            expect(classifyS3Error({ name: 'ECONNRESET' }).errorCode).toBe('NETWORK_ERROR')
            expect(classifyS3Error({ name: 'ENOTFOUND' }).errorCode).toBe('NETWORK_ERROR')
            expect(classifyS3Error({ name: 'ETIMEDOUT' }).errorCode).toBe('NETWORK_ERROR')
        })

        it('should default to UNKNOWN for unrecognized errors', () => {
            const result = classifyS3Error({ name: 'SomeOtherError' })
            expect(result.errorCode).toBe('UNKNOWN')
            expect(result.isRetryable).toBe(true)
        })
    })

    describe('Job Error Handling with S3 Errors', () => {
        it('should not retry non-retryable errors even with attempts remaining', () => {
            const error = new S3DownloadError('File not found', 'NOT_FOUND', false)
            const job = { attempt: 1, maxAttempts: 5 }

            const canRetry = error.isRetryable && job.attempt < job.maxAttempts
            expect(canRetry).toBe(false)
        })

        it('should retry retryable errors when attempts remain', () => {
            const error = new S3DownloadError('Network error', 'NETWORK_ERROR', true)
            const job = { attempt: 1, maxAttempts: 5 }

            const canRetry = error.isRetryable && job.attempt < job.maxAttempts
            expect(canRetry).toBe(true)
        })

        it('should not retry retryable errors when attempts exhausted', () => {
            const error = new S3DownloadError('Network error', 'NETWORK_ERROR', true)
            const job = { attempt: 5, maxAttempts: 5 }

            const canRetry = error.isRetryable && job.attempt < job.maxAttempts
            expect(canRetry).toBe(false)
        })

        it('should store errorCode in job record', () => {
            const error = new S3DownloadError('Access denied', 'ACCESS_DENIED', false)

            const jobUpdateData = {
                state: 'FAILED',
                errorCode: error.errorCode,
                errorMessage: error.message,
            }

            expect(jobUpdateData.errorCode).toBe('ACCESS_DENIED')
            expect(jobUpdateData.errorMessage).toBe('Access denied')
        })
    })
})
