import prisma from '@/lib/prisma'
import { ExamAttemptStatus, ExamStatus } from '@prisma/client'

export class LearnerWorkspaceService {
    static async getRewardsOverview(userId: string) {
        const [allStarAwards, recentStarAwards, badgeAwards, certificatesEarned, globalMilestones, seriesMilestones] = await Promise.all([
            prisma.starAward.findMany({
                where: { userId },
                include: {
                    domain: { select: { id: true, name: true, slug: true } },
                    learningSeries: { select: { id: true, name: true, slug: true } },
                    event: { select: { id: true, title: true } },
                    exam: { select: { id: true, title: true } },
                },
                orderBy: { awardedAt: 'desc' },
            }),
            prisma.starAward.findMany({
                where: { userId },
                include: {
                    domain: { select: { id: true, name: true, slug: true } },
                    learningSeries: { select: { id: true, name: true, slug: true } },
                    event: { select: { id: true, title: true } },
                    exam: { select: { id: true, title: true } },
                },
                orderBy: { awardedAt: 'desc' },
                take: 12,
            }),
            prisma.badgeAward.findMany({
                where: { userId },
                include: {
                    badge: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            description: true,
                            icon: true,
                            thresholdStars: true,
                            learningSeries: {
                                select: {
                                    id: true,
                                    name: true,
                                    slug: true,
                                },
                            },
                        },
                    },
                    domain: { select: { id: true, name: true, slug: true } },
                    learningSeries: { select: { id: true, name: true, slug: true } },
                    event: { select: { id: true, title: true } },
                },
                orderBy: { awardedAt: 'desc' },
            }),
            prisma.certificate.count({
                where: { userId },
            }),
            prisma.badgeMilestone.findMany({
                where: {
                    active: true,
                    domainId: null,
                    learningSeriesId: null,
                },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    thresholdStars: true,
                },
                orderBy: { thresholdStars: 'asc' },
            }),
            prisma.badgeMilestone.findMany({
                where: {
                    active: true,
                    learningSeriesId: { not: null },
                },
                include: {
                    learningSeries: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                },
                orderBy: [
                    { learningSeriesId: 'asc' },
                    { thresholdStars: 'asc' },
                ],
            }),
        ])

        const totalStars = allStarAwards.reduce((sum, award) => sum + award.stars, 0)
        const totalBadges = badgeAwards.length
        const recognizedEvents = new Set(
            [...allStarAwards.map((award) => award.eventId), ...badgeAwards.map((award) => award.eventId)].filter(Boolean)
        ).size

        const domainMap = new Map<string, { domainId: string | null; domainName: string; stars: number; badges: number }>()

        for (const award of allStarAwards) {
            const key = award.domainId ?? 'global'
            const current = domainMap.get(key) ?? {
                domainId: award.domainId ?? null,
                domainName: award.domain?.name ?? 'General Training',
                stars: 0,
                badges: 0,
            }
            current.stars += award.stars
            domainMap.set(key, current)
        }

        for (const award of badgeAwards) {
            const key = award.domainId ?? 'global'
            const current = domainMap.get(key) ?? {
                domainId: award.domainId ?? null,
                domainName: award.domain?.name ?? 'General Training',
                stars: 0,
                badges: 0,
            }
            current.badges += 1
            domainMap.set(key, current)
        }

        const topDomains = Array.from(domainMap.values()).sort((a, b) => {
            if (b.stars !== a.stars) return b.stars - a.stars
            return b.badges - a.badges
        })

        const earnedBadgeIds = new Set(badgeAwards.map((award) => award.badge.id))
        const nextBadge = globalMilestones.find((badge) => !earnedBadgeIds.has(badge.id) && badge.thresholdStars > totalStars)

        const seriesStarTotals = new Map<string, number>()
        for (const award of allStarAwards) {
            if (!award.learningSeriesId) continue
            seriesStarTotals.set(award.learningSeriesId, (seriesStarTotals.get(award.learningSeriesId) ?? 0) + award.stars)
        }

        const earnedBadgeIdsBySeries = new Map<string, Set<string>>()
        for (const award of badgeAwards) {
            const seriesId = award.learningSeriesId ?? award.badge.learningSeries?.id
            if (!seriesId) continue
            const ids = earnedBadgeIdsBySeries.get(seriesId) ?? new Set<string>()
            ids.add(award.badge.id)
            earnedBadgeIdsBySeries.set(seriesId, ids)
        }

        const milestonesBySeries = new Map<string, typeof seriesMilestones>()
        for (const milestone of seriesMilestones) {
            if (!milestone.learningSeriesId || !milestone.learningSeries) continue
            const current = milestonesBySeries.get(milestone.learningSeriesId) ?? []
            current.push(milestone)
            milestonesBySeries.set(milestone.learningSeriesId, current)
        }

        const seriesProgressions = Array.from(milestonesBySeries.entries()).map(([seriesId, milestones]) => {
            const stars = seriesStarTotals.get(seriesId) ?? 0
            const earnedForSeries = earnedBadgeIdsBySeries.get(seriesId) ?? new Set<string>()
            const currentBadge = [...milestones]
                .filter((milestone) => earnedForSeries.has(milestone.id) && milestone.thresholdStars <= stars)
                .sort((a, b) => b.thresholdStars - a.thresholdStars)[0] ?? null
            const nextSeriesBadge = [...milestones]
                .find((milestone) => !earnedForSeries.has(milestone.id) && milestone.thresholdStars > stars) ?? null
            const maxThreshold = milestones[milestones.length - 1]?.thresholdStars ?? 0
            const progressBasis = (nextSeriesBadge?.thresholdStars ?? maxThreshold) || 1

            return {
                learningSeries: milestones[0].learningSeries!,
                stars,
                unlockedBadges: earnedForSeries.size,
                currentBadge: currentBadge
                    ? {
                        id: currentBadge.id,
                        name: currentBadge.name,
                        slug: currentBadge.slug,
                        thresholdStars: currentBadge.thresholdStars,
                    }
                    : null,
                nextBadge: nextSeriesBadge
                    ? {
                        id: nextSeriesBadge.id,
                        name: nextSeriesBadge.name,
                        slug: nextSeriesBadge.slug,
                        thresholdStars: nextSeriesBadge.thresholdStars,
                        remainingStars: Math.max(nextSeriesBadge.thresholdStars - stars, 0),
                    }
                    : null,
                progressPercent: Math.max(0, Math.min(100, Math.round((stars / progressBasis) * 100))),
            }
        }).sort((a, b) => {
            if (b.stars !== a.stars) return b.stars - a.stars
            return a.learningSeries.name.localeCompare(b.learningSeries.name)
        })

        return {
            summary: {
                totalStars,
                totalBadges,
                recognizedEvents,
                activeDomains: topDomains.length,
                certificatesEarned,
            },
            recentStarAwards: recentStarAwards.map((award) => ({
                id: award.id,
                stars: award.stars,
                sourceType: award.sourceType,
                reason: award.reason,
                awardedAt: award.awardedAt,
                domain: award.domain,
                learningSeries: award.learningSeries,
                event: award.event,
                exam: award.exam,
            })),
            badges: badgeAwards.map((award) => ({
                id: award.id,
                awardedAt: award.awardedAt,
                badge: award.badge,
                domain: award.domain,
                learningSeries: award.learningSeries,
                event: award.event,
            })),
            topDomains,
            seriesProgressions,
            nextBadge: nextBadge
                ? {
                    id: nextBadge.id,
                    name: nextBadge.name,
                    slug: nextBadge.slug,
                    thresholdStars: nextBadge.thresholdStars,
                    remainingStars: Math.max(nextBadge.thresholdStars - totalStars, 0),
                }
                : null,
        }
    }

    static async getTrainingOverview(userId: string) {
        const [exams, recentAttempts] = await Promise.all([
            prisma.exam.findMany({
                where: {
                    status: ExamStatus.PUBLISHED,
                    invitations: {
                        some: { userId },
                    },
                },
                include: {
                    productDomain: {
                        select: { id: true, name: true, slug: true },
                    },
                    certificateTemplate: {
                        select: { isEnabled: true, title: true },
                    },
                    learningSeries: {
                        select: { id: true, name: true, slug: true, type: true },
                    },
                    learningEvent: {
                        select: {
                            id: true,
                            title: true,
                            format: true,
                            status: true,
                            scheduledAt: true,
                            startsAt: true,
                            isRequired: true,
                        },
                    },
                    attempts: {
                        where: { userId },
                        select: {
                            id: true,
                            attemptNumber: true,
                            status: true,
                            percentageScore: true,
                            passed: true,
                            submittedAt: true,
                        },
                        orderBy: { attemptNumber: 'desc' },
                    },
                },
                orderBy: [
                    { deadline: 'asc' },
                    { createdAt: 'desc' },
                ],
            }),
            prisma.examAttempt.findMany({
                where: {
                    userId,
                    status: {
                        in: [ExamAttemptStatus.SUBMITTED, ExamAttemptStatus.GRADED],
                    },
                },
                include: {
                    exam: {
                        select: {
                            id: true,
                            title: true,
                            assessmentKind: true,
                            productDomain: {
                                select: { name: true },
                            },
                            learningEvent: {
                                select: { title: true },
                            },
                        },
                    },
                },
                orderBy: [
                    { submittedAt: 'desc' },
                    { startedAt: 'desc' },
                ],
                take: 8,
            }),
        ])

        const assignedExams = exams.map((exam) => {
            const completedAttempts = exam.attempts.filter(
                (attempt) => attempt.status === ExamAttemptStatus.SUBMITTED || attempt.status === ExamAttemptStatus.GRADED
            ).length
            const inProgressAttempt = exam.attempts.find((attempt) => attempt.status === ExamAttemptStatus.IN_PROGRESS)
            const bestAttempt = exam.attempts
                .filter((attempt) => attempt.percentageScore !== null)
                .sort((a, b) => (b.percentageScore ?? 0) - (a.percentageScore ?? 0))[0]

            return {
                id: exam.id,
                title: exam.title,
                status: exam.status,
                assessmentKind: exam.assessmentKind,
                countsTowardPerformance: exam.countsTowardPerformance,
                awardsStars: exam.awardsStars,
                starValue: exam.starValue,
                deadline: exam.deadline,
                availableFrom: exam.availableFrom,
                domain: exam.productDomain,
                learningSeries: exam.learningSeries,
                certificateEligible: exam.assessmentKind === 'FORMAL' && Boolean(exam.certificateTemplate?.isEnabled),
                learningEvent: exam.learningEvent
                    ? {
                        id: exam.learningEvent.id,
                        title: exam.learningEvent.title,
                        format: exam.learningEvent.format,
                        scheduledAt: exam.learningEvent.scheduledAt,
                        isRequired: exam.learningEvent.isRequired,
                    }
                    : null,
                userStatus: {
                    completedAttempts,
                    remainingAttempts: Math.max(exam.maxAttempts - completedAttempts, 0),
                    hasInProgressAttempt: Boolean(inProgressAttempt),
                    inProgressAttemptId: inProgressAttempt?.id,
                    bestScore: bestAttempt?.percentageScore ?? null,
                    hasPassed: exam.attempts.some((attempt) => attempt.passed === true),
                },
            }
        })

        const upcomingEventMap = new Map<string, {
            id: string
            title: string
            format: string
            status: string
            scheduledAt?: Date | null
            startsAt?: Date | null
            isRequired: boolean
            domain?: { id: string; name: string; slug: string } | null
            linkedExams: Array<{ id: string; title: string; deadline?: Date | null }>
        }>()

        for (const exam of exams) {
            if (!exam.learningEvent) continue
            const existing = upcomingEventMap.get(exam.learningEvent.id) ?? {
                id: exam.learningEvent.id,
                title: exam.learningEvent.title,
                format: exam.learningEvent.format,
                status: exam.learningEvent.status,
                scheduledAt: exam.learningEvent.scheduledAt,
                startsAt: exam.learningEvent.startsAt,
                isRequired: exam.learningEvent.isRequired,
                domain: exam.productDomain,
                linkedExams: [],
            }
            existing.linkedExams.push({
                id: exam.id,
                title: exam.title,
                deadline: exam.deadline,
            })
            upcomingEventMap.set(exam.learningEvent.id, existing)
        }

        const now = Date.now()
        const upcomingEvents = Array.from(upcomingEventMap.values())
            .filter((event) => !event.scheduledAt || new Date(event.scheduledAt).getTime() >= now - 24 * 60 * 60 * 1000)
            .sort((a, b) => {
                const aTime = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER
                const bTime = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER
                return aTime - bTime
            })

        return {
            summary: {
                assignedExams: assignedExams.length,
                pendingExams: assignedExams.filter((exam) => !exam.userStatus.hasPassed && exam.userStatus.remainingAttempts > 0).length,
                inProgressExams: assignedExams.filter((exam) => exam.userStatus.hasInProgressAttempt).length,
                passedExams: assignedExams.filter((exam) => exam.userStatus.hasPassed).length,
                upcomingEvents: upcomingEvents.length,
                requiredItems: assignedExams.filter((exam) => exam.countsTowardPerformance || exam.learningEvent?.isRequired).length,
            },
            upcomingEvents,
            assignedExams,
            recentCompletions: recentAttempts.map((attempt) => ({
                attemptId: attempt.id,
                examId: attempt.examId,
                examTitle: attempt.exam.title,
                submittedAt: attempt.submittedAt,
                percentageScore: attempt.percentageScore,
                passed: attempt.passed,
                domainName: attempt.exam.productDomain?.name ?? null,
                eventTitle: attempt.exam.learningEvent?.title ?? null,
                assessmentKind: attempt.exam.assessmentKind,
            })),
        }
    }
}
