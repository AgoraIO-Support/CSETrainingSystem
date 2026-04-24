import prisma from '@/lib/prisma'
import { AssessmentKind, LearningEventFormat, Prisma, StarAwardSourceType } from '@prisma/client'

type RewardDbClient = typeof prisma | Prisma.TransactionClient

export class TrainingOpsRewardService {
    private static resolveStarSourceType(input: {
        assessmentKind: AssessmentKind
        eventFormat?: LearningEventFormat | null
    }): StarAwardSourceType {
        if (input.eventFormat === 'CASE_STUDY') {
            return 'CASE_STUDY'
        }

        if (input.eventFormat === 'RELEASE_BRIEFING' || input.assessmentKind === 'READINESS') {
            return 'LAUNCH_EXAM'
        }

        if (input.eventFormat === 'FINAL_EXAM' || input.assessmentKind === 'FORMAL') {
            return 'FINAL_EXAM'
        }

        return 'WEEKLY_QUIZ'
    }

    static async issueRewardsForPassedExamAttempt(attemptId: string, db: RewardDbClient = prisma) {
        const attempt = await db.examAttempt.findUnique({
            where: { id: attemptId },
            include: {
                exam: {
                    include: {
                        learningEvent: {
                            select: {
                                id: true,
                                format: true,
                            },
                        },
                    },
                },
            },
        })

        if (!attempt) {
            throw new Error('ATTEMPT_NOT_FOUND')
        }

        if (!attempt.passed) {
            return {
                starAwarded: false,
                stars: 0,
                newBadges: 0,
            }
        }

        if (!attempt.exam.awardsStars || !attempt.exam.starValue || attempt.exam.starValue <= 0) {
            return {
                starAwarded: false,
                stars: 0,
                newBadges: 0,
            }
        }

        const existingStarAward = await db.starAward.findFirst({
            where: {
                userId: attempt.userId,
                examId: attempt.examId,
            },
            select: { id: true },
        })

        let starsAwarded = 0
        if (!existingStarAward) {
            const sourceType = this.resolveStarSourceType({
                assessmentKind: attempt.exam.assessmentKind,
                eventFormat: attempt.exam.learningEvent?.format,
            })

            const starAward = await db.starAward.create({
                data: {
                    userId: attempt.userId,
                    domainId: attempt.exam.productDomainId ?? null,
                    eventId: attempt.exam.learningEventId ?? null,
                    examId: attempt.examId,
                    sourceType,
                    stars: attempt.exam.starValue,
                    reason: `Passed exam: ${attempt.exam.title}`,
                },
            })

            starsAwarded = starAward.stars
        }

        const eligibleBadges = attempt.exam.productDomainId
            ? await db.badgeMilestone.findMany({
                  where: {
                      active: true,
                      domainId: attempt.exam.productDomainId,
                  },
                  orderBy: [{ thresholdStars: 'asc' }, { createdAt: 'asc' }],
              })
            : []

        let newBadges = 0

        for (const badge of eligibleBadges) {
            const existingBadge = await db.badgeAward.findUnique({
                where: {
                    badgeId_userId: {
                        badgeId: badge.id,
                        userId: attempt.userId,
                    },
                },
                select: { id: true },
            })

            if (existingBadge) {
                continue
            }

            const aggregate = await db.starAward.aggregate({
                where: {
                    userId: attempt.userId,
                    domainId: badge.domainId ?? undefined,
                },
                _sum: { stars: true },
            })

            const totalStars = aggregate._sum.stars ?? 0
            if (totalStars < badge.thresholdStars) {
                continue
            }

            await db.badgeAward.create({
                data: {
                    badgeId: badge.id,
                    userId: attempt.userId,
                    domainId: badge.domainId ?? attempt.exam.productDomainId ?? null,
                    eventId: attempt.exam.learningEventId ?? null,
                    examId: attempt.examId,
                },
            })

            newBadges += 1
        }

        return {
            starAwarded: starsAwarded > 0,
            stars: starsAwarded,
            newBadges,
        }
    }

    static async issueMissingRewardsForPublishedExam(examId: string, db: RewardDbClient = prisma) {
        const exam = await db.exam.findUnique({
            where: { id: examId },
            select: {
                id: true,
                awardsStars: true,
                starValue: true,
            },
        })

        if (!exam) {
            throw new Error('EXAM_NOT_FOUND')
        }

        if (!exam.awardsStars || !exam.starValue || exam.starValue <= 0) {
            return {
                processedAttempts: 0,
                starAwardsIssued: 0,
                starsGranted: 0,
                newBadges: 0,
            }
        }

        const passedAttempts = await db.examAttempt.findMany({
            where: {
                examId,
                passed: true,
            },
            select: {
                id: true,
                userId: true,
            },
            orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
        })

        const processedUsers = new Set<string>()
        let processedAttempts = 0
        let starAwardsIssued = 0
        let starsGranted = 0
        let newBadges = 0

        for (const attempt of passedAttempts) {
            if (processedUsers.has(attempt.userId)) {
                continue
            }

            processedUsers.add(attempt.userId)
            processedAttempts += 1

            const rewardResult = await this.issueRewardsForPassedExamAttempt(attempt.id, db)
            if (rewardResult.starAwarded) {
                starAwardsIssued += 1
                starsGranted += rewardResult.stars
            }
            newBadges += rewardResult.newBadges
        }

        return {
            processedAttempts,
            starAwardsIssued,
            starsGranted,
            newBadges,
        }
    }
}
