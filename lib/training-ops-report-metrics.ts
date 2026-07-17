export interface TrainingOpsEvidenceAttempt {
    userId: string
    examId: string
    submittedAt: Date | null
    updatedAt: Date
    percentageScore: number | null
    passed: boolean | null
}

const evidenceTimestamp = (attempt: TrainingOpsEvidenceAttempt) =>
    (attempt.submittedAt ?? attempt.updatedAt).getTime()

/**
 * Performance reporting uses one current evidence record per learner and exam so
 * repeated attempts do not give one learner extra statistical weight.
 */
export const selectLatestEvidenceAttempts = <T extends TrainingOpsEvidenceAttempt>(attempts: T[]): T[] => {
    const latestByLearnerExam = new Map<string, T>()

    attempts.forEach((attempt) => {
        const key = `${attempt.userId}:${attempt.examId}`
        const current = latestByLearnerExam.get(key)
        if (!current || evidenceTimestamp(attempt) > evidenceTimestamp(current)) {
            latestByLearnerExam.set(key, attempt)
        }
    })

    return Array.from(latestByLearnerExam.values())
}

export const percentage = (numerator: number, denominator: number) => {
    if (denominator <= 0) return 0
    return Math.round((numerator / denominator) * 100)
}

export const averageNumber = (values: Array<number | null | undefined>) => {
    const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    if (valid.length === 0) return 0
    return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length)
}
