import prisma from '@/lib/prisma'
import { AssessmentKind, LearningEventFormat, StarAwardSourceType } from '@prisma/client'

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

    static async issueRewardsForPassedExamAttempt(attemptId: string) {
        const attempt = await prisma.examAttempt.findUnique({
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

        const existingStarAward = await prisma.starAward.findFirst({
            where: {
                userId: attempt.userId,
                examId: attempt.examId,
            },
            select: { id: true },
        })

        if (existingStarAward) {
            return {
                starAwarded: false,
                stars: 0,
                newBadges: 0,
            }
        }

        const sourceType = this.resolveStarSourceType({
            assessmentKind: attempt.exam.assessmentKind,
            eventFormat: attempt.exam.learningEvent?.format,
        })

        const starAward = await prisma.starAward.create({
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

        const eligibleBadges = attempt.exam.productDomainId
            ? await prisma.badgeMilestone.findMany({
                  where: {
                      active: true,
                      domainId: attempt.exam.productDomainId,
                  },
                  orderBy: [{ thresholdStars: 'asc' }, { createdAt: 'asc' }],
              })
            : []

        let newBadges = 0

        for (const badge of eligibleBadges) {
            const existingBadge = await prisma.badgeAward.findUnique({
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

            const aggregate = await prisma.starAward.aggregate({
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

            await prisma.badgeAward.create({
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
            starAwarded: true,
            stars: starAward.stars,
            newBadges,
        }
    }
}
