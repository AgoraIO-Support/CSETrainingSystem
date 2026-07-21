import prisma from '@/lib/prisma'
import { AssessmentKind, LearningEventFormat, Prisma, StarAwardSourceType } from '@prisma/client'
import { resolveRewardDomainId } from '@/lib/training-ops-reward-domain'

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

    private static async awardEligibleBadgesForDomain(input: {
        userId: string
        domainId?: string | null
        eventId?: string | null
        examId: string
    }, db: RewardDbClient): Promise<number> {
        if (!input.domainId) {
            return 0
        }

        const eligibleBadges = await db.badgeMilestone.findMany({
            where: {
                active: true,
                domainId: input.domainId,
            },
            orderBy: [{ thresholdStars: 'asc' }, { createdAt: 'asc' }],
        })

        if (eligibleBadges.length === 0) {
            return 0
        }

        const aggregate = await db.starAward.aggregate({
            where: {
                userId: input.userId,
                domainId: input.domainId,
            },
            _sum: { stars: true },
        })

        const totalStars = aggregate._sum.stars ?? 0
        let newBadges = 0

        for (const badge of eligibleBadges) {
            const existingBadge = await db.badgeAward.findUnique({
                where: {
                    badgeId_userId: {
                        badgeId: badge.id,
                        userId: input.userId,
                    },
                },
                select: { id: true },
            })

            if (existingBadge || totalStars < badge.thresholdStars) {
                continue
            }

            await db.badgeAward.create({
                data: {
                    badgeId: badge.id,
                    userId: input.userId,
                    domainId: input.domainId,
                    eventId: input.eventId ?? null,
                    examId: input.examId,
                },
            })

            newBadges += 1
        }

        return newBadges
    }

    static async reconcileBadgeAwardsForDomain(domainId: string, db: RewardDbClient = prisma) {
        const [activeBadges, starTotals] = await Promise.all([
            db.badgeMilestone.findMany({
                where: { domainId, active: true },
                select: { id: true, thresholdStars: true },
                orderBy: [{ thresholdStars: 'asc' }, { createdAt: 'asc' }],
            }),
            db.starAward.groupBy({
                by: ['userId'],
                where: { domainId },
                _sum: { stars: true },
            }),
        ])

        if (activeBadges.length === 0 || starTotals.length === 0) {
            return { eligibleAwards: 0, awardsCreated: 0 }
        }

        const eligibleAwards = starTotals.flatMap((total) => {
            const stars = total._sum.stars ?? 0
            return activeBadges
                .filter((badge) => stars >= badge.thresholdStars)
                .map((badge) => ({
                    badgeId: badge.id,
                    userId: total.userId,
                    domainId,
                }))
        })

        if (eligibleAwards.length === 0) {
            return { eligibleAwards: 0, awardsCreated: 0 }
        }

        const result = await db.badgeAward.createMany({
            data: eligibleAwards,
            skipDuplicates: true,
        })

        return {
            eligibleAwards: eligibleAwards.length,
            awardsCreated: result.count,
        }
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
                                domainId: true,
                                series: {
                                    select: { domainId: true },
                                },
                            },
                        },
                        learningSeries: {
                            select: { domainId: true },
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

        const existingStarAward = await db.starAward.findFirst({
            where: {
                userId: attempt.userId,
                examId: attempt.examId,
            },
            select: {
                id: true,
                stars: true,
                domainId: true,
                eventId: true,
                event: {
                    select: {
                        domainId: true,
                        series: { select: { domainId: true } },
                    },
                },
            },
        })
        const resolvedDomainId = resolveRewardDomainId({
            examDomainId: attempt.exam.productDomainId,
            awardEventDomainId: existingStarAward?.event?.domainId,
            examEventDomainId: attempt.exam.learningEvent?.domainId,
            examSeriesDomainId: attempt.exam.learningSeries?.domainId,
            awardEventSeriesDomainId: existingStarAward?.event?.series?.domainId,
            examEventSeriesDomainId: attempt.exam.learningEvent?.series?.domainId,
        })
        const targetStars = attempt.exam.awardsStars && attempt.exam.starValue && attempt.exam.starValue > 0
            ? attempt.exam.starValue
            : 0

        let starsAdjusted = 0
        let starAwardAdjusted = false
        if (!existingStarAward && targetStars > 0) {
            const sourceType = this.resolveStarSourceType({
                assessmentKind: attempt.exam.assessmentKind,
                eventFormat: attempt.exam.learningEvent?.format,
            })

            const starAward = await db.starAward.create({
                data: {
                    userId: attempt.userId,
                    domainId: resolvedDomainId,
                    eventId: attempt.exam.learningEventId ?? null,
                    examId: attempt.examId,
                    sourceType,
                    stars: targetStars,
                    reason: `Passed exam: ${attempt.exam.title}`,
                },
            })

            starsAdjusted = starAward.stars
        } else if (existingStarAward) {
            const delta = targetStars - existingStarAward.stars
            const nextDomainId = existingStarAward.domainId ?? resolvedDomainId
            const nextEventId = existingStarAward.eventId ?? attempt.exam.learningEventId ?? null
            const shouldUpdateMetadata =
                nextDomainId !== existingStarAward.domainId || nextEventId !== existingStarAward.eventId

            if (delta !== 0 || shouldUpdateMetadata) {
                await db.starAward.update({
                    where: { id: existingStarAward.id },
                    data: {
                        domainId: nextDomainId,
                        eventId: nextEventId,
                        ...(delta !== 0 ? { stars: targetStars } : {}),
                        reason: `Passed exam: ${attempt.exam.title}`,
                    },
                })
            }

            starsAdjusted = delta
            starAwardAdjusted = delta !== 0
        }
        const rewardDomainId = existingStarAward?.domainId ?? resolvedDomainId
        const newBadges = targetStars > 0
            ? await this.awardEligibleBadgesForDomain({
                userId: attempt.userId,
                domainId: rewardDomainId,
                eventId: attempt.exam.learningEventId ?? null,
                examId: attempt.examId,
            }, db)
            : 0

        return {
            starAwarded: starsAdjusted > 0,
            stars: starsAdjusted,
            starAwardAdjusted,
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
        let starAwardsAdjusted = 0
        let starsGranted = 0
        let starsRevoked = 0
        let newBadges = 0

        for (const attempt of passedAttempts) {
            if (processedUsers.has(attempt.userId)) {
                continue
            }

            processedUsers.add(attempt.userId)
            processedAttempts += 1

            const rewardResult = await this.issueRewardsForPassedExamAttempt(attempt.id, db)
            if (rewardResult.starAwardAdjusted) {
                starAwardsAdjusted += 1
                starsGranted += Math.max(0, rewardResult.stars)
                starsRevoked += Math.max(0, -rewardResult.stars)
            } else if (rewardResult.starAwarded) {
                starAwardsIssued += 1
                starsGranted += rewardResult.stars
            }
            newBadges += rewardResult.newBadges
        }

        return {
            processedAttempts,
            starAwardsIssued,
            starAwardsAdjusted,
            starsGranted,
            starsRevoked,
            newBadges,
        }
    }

    static async syncRewardsForPublishedExam(examId: string, db: RewardDbClient = prisma) {
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
        let starAwardsAdjusted = 0
        let starsGranted = 0
        let starsRevoked = 0
        let newBadges = 0

        for (const attempt of passedAttempts) {
            if (processedUsers.has(attempt.userId)) {
                continue
            }

            processedUsers.add(attempt.userId)
            processedAttempts += 1

            const rewardResult = await this.issueRewardsForPassedExamAttempt(attempt.id, db)
            if (rewardResult.starAwardAdjusted) {
                starAwardsAdjusted += 1
                starsGranted += Math.max(0, rewardResult.stars)
                starsRevoked += Math.max(0, -rewardResult.stars)
            } else if (rewardResult.starAwarded) {
                starAwardsIssued += 1
                starsGranted += rewardResult.stars
            }
            newBadges += rewardResult.newBadges
        }

        return {
            processedAttempts,
            starAwardsIssued,
            starAwardsAdjusted,
            starsGranted,
            starsRevoked,
            newBadges,
        }
    }
}
