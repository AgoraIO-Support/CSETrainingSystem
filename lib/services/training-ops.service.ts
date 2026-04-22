import prisma from '@/lib/prisma'
import { Prisma, ProductDomainCategory, ProductTrack, SmeKpiMode, LearningSeriesType, LearningEventFormat, LearningEventStatus, AssessmentKind, ExamStatus, ExamAttemptStatus } from '@prisma/client'
import { ExamService } from '@/lib/services/exam.service'
import { CourseService } from '@/lib/services/course.service'
import { CascadeDeleteService } from '@/lib/services/cascade-delete.service'
import { isEventFormatAllowedForSeriesType } from '@/lib/training-ops-series-event-rules'

type TrainingOpsOperatorRole = 'USER' | 'SME' | 'ADMIN'
type TrainingOpsOperator = {
    id: string
    role: TrainingOpsOperatorRole
}
type TrainingOpsScope = {
    domainIds: string[]
    seriesIds: string[]
    eventIds: string[]
}

type EventSummaryBase<TExam, TCourse> = Prisma.LearningEventGetPayload<{
    include: {
        domain: {
            select: {
                id: true
                name: true
                slug: true
            }
        }
        series: {
            select: {
                id: true
                name: true
                slug: true
                type: true
            }
        }
        host: {
            select: {
                id: true
                name: true
                email: true
            }
        }
        createdBy: {
            select: {
                id: true
                name: true
                email: true
            }
        }
    }
}> & {
    exams: TExam[]
    courses: TCourse[]
}

type EventCourseDeletionView = {
    id: string
    title: string
    slug: string
    status: string
    publishedAt?: Date | null
    enrolledCount: number
    sourceLearningEventId?: string | null
    linkedExamCount: number
    cascadeDeleteEligible: boolean
    cascadeDeleteReason: string | null
}

type EventExamDeletionView = {
    id: string
    title: string
    status: string
    publishedAt?: Date | null
    sourceLearningEventId?: string | null
    invitationCount: number
    attemptCount: number
    gradedAttemptCount: number
    passedCount: number
    failedCount: number
    passRate: number
    cascadeDeleteEligible: boolean
    cascadeDeleteReason: string | null
}

type EventDeletionImpact = {
    eligibleCourseCount: number
    eligibleExamCount: number
    detachableCourseCount: number
    detachableExamCount: number
}

export class TrainingOpsService {
    private static ensureTrainingOpsOperator(user: TrainingOpsOperator) {
        if (user.role === 'USER') {
            throw new Error('TRAINING_OPS_FORBIDDEN')
        }
    }

    private static async assertBadgeDomainScope(user: TrainingOpsOperator, domainId: string) {
        this.ensureTrainingOpsOperator(user)

        if (user.role === 'ADMIN') {
            return
        }

        try {
            await this.assertScopeAccess(user, { domainId })
        } catch {
            throw new Error('BADGE_DOMAIN_FORBIDDEN')
        }
    }

    private static async assertUniqueDomainBadgeThreshold(domainId: string, thresholdStars: number, excludeId?: string) {
        const existing = await prisma.badgeMilestone.findFirst({
            where: {
                domainId,
                thresholdStars,
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
            select: { id: true },
        })

        if (existing) {
            throw new Error('BADGE_THRESHOLD_EXISTS')
        }
    }

    private static async assertUniqueDomainBadgeSlug(domainId: string, slug: string, excludeId?: string) {
        const existing = await prisma.badgeMilestone.findFirst({
            where: {
                domainId,
                slug,
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
            select: { id: true },
        })

        if (existing) {
            throw new Error('BADGE_MILESTONE_SLUG_EXISTS')
        }
    }

    private static async getUserTrainingOpsScope(userId: string): Promise<TrainingOpsScope> {
        const [directDomains, ownedSeries, directEvents] = await Promise.all([
            prisma.productDomain.findMany({
                where: {
                    OR: [
                        { primarySmeId: userId },
                        { backupSmeId: userId },
                    ],
                },
                select: { id: true },
            }),
            prisma.learningSeries.findMany({
                where: { ownerId: userId },
                select: { id: true, domainId: true },
            }),
            prisma.learningEvent.findMany({
                where: {
                    OR: [
                        { hostId: userId },
                        { createdById: userId },
                    ],
                },
                select: { id: true, domainId: true, seriesId: true },
            }),
        ])

        const domainIds = new Set<string>()
        directDomains.forEach((row) => domainIds.add(row.id))
        ownedSeries.forEach((row) => {
            if (row.domainId) domainIds.add(row.domainId)
        })
        directEvents.forEach((row) => {
            if (row.domainId) domainIds.add(row.domainId)
        })

        const scopedSeries = domainIds.size > 0
            ? await prisma.learningSeries.findMany({
                where: {
                    OR: [
                        { ownerId: userId },
                        { domainId: { in: Array.from(domainIds) } },
                    ],
                },
                select: { id: true, domainId: true },
            })
            : ownedSeries

        const seriesIds = new Set<string>()
        scopedSeries.forEach((row) => {
            seriesIds.add(row.id)
            if (row.domainId) domainIds.add(row.domainId)
        })
        directEvents.forEach((row) => {
            if (row.seriesId) seriesIds.add(row.seriesId)
        })

        const scopedEvents = (domainIds.size > 0 || seriesIds.size > 0)
            ? await prisma.learningEvent.findMany({
                where: {
                    OR: [
                        { hostId: userId },
                        { createdById: userId },
                        ...(domainIds.size > 0 ? [{ domainId: { in: Array.from(domainIds) } }] : []),
                        ...(seriesIds.size > 0 ? [{ seriesId: { in: Array.from(seriesIds) } }] : []),
                    ],
                },
                select: { id: true },
            })
            : directEvents.map((row) => ({ id: row.id }))

        return {
            domainIds: Array.from(domainIds),
            seriesIds: Array.from(seriesIds),
            eventIds: Array.from(new Set(scopedEvents.map((row) => row.id))),
        }
    }

    private static async assertScopeAccess(
        user: TrainingOpsOperator,
        params: {
            domainId?: string | null
            seriesId?: string | null
            eventId?: string | null
            hostId?: string | null
            createdById?: string | null
        }
    ) {
        this.ensureTrainingOpsOperator(user)

        if (user.role === 'ADMIN') {
            return
        }

        const scope = await this.getUserTrainingOpsScope(user.id)

        if (params.domainId && scope.domainIds.includes(params.domainId)) {
            return
        }

        if (params.seriesId && scope.seriesIds.includes(params.seriesId)) {
            return
        }

        if (params.eventId && scope.eventIds.includes(params.eventId)) {
            return
        }

        if (params.hostId && params.hostId === user.id) {
            return
        }

        if (params.createdById && params.createdById === user.id) {
            return
        }

        throw new Error('TRAINING_OPS_SCOPE_FORBIDDEN')
    }

    private static async validateActiveUser(userId: string | null | undefined, errorCode: string) {
        if (!userId) return

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, status: true },
        })

        if (!user || user.status !== 'ACTIVE') {
            throw new Error(errorCode)
        }
    }

    private static mapEvent<TExam, TCourse>(event: EventSummaryBase<TExam, TCourse>) {
        return {
            id: event.id,
            title: event.title,
            format: event.format,
            status: event.status,
            description: event.description,
            releaseVersion: event.releaseVersion,
            scheduledAt: event.scheduledAt,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            isRequired: event.isRequired,
            countsTowardPerformance: event.countsTowardPerformance,
            starValue: event.starValue,
            domain: event.domain,
            series: event.series,
            host: event.host,
            createdBy: event.createdBy,
            exams: event.exams,
            courses: event.courses,
            createdAt: event.createdAt,
            updatedAt: event.updatedAt,
            completedAt: event.completedAt,
        }
    }

    private static getCourseCascadeDeleteState(course: {
        status: string
        enrolledCount: number
        sourceLearningEventId?: string | null
        linkedExamCount: number
    }, eventId: string) {
        if (course.sourceLearningEventId !== eventId) {
            return {
                cascadeDeleteEligible: false,
                cascadeDeleteReason: 'Attached existing course. It will only be unlinked.',
            }
        }

        if (course.status !== 'DRAFT') {
            return {
                cascadeDeleteEligible: false,
                cascadeDeleteReason: 'Published or archived courses cannot be deleted with the event.',
            }
        }

        if (course.enrolledCount > 0) {
            return {
                cascadeDeleteEligible: false,
                cascadeDeleteReason: 'Courses with enrollments cannot be deleted with the event.',
            }
        }

        if (course.linkedExamCount > 0) {
            return {
                cascadeDeleteEligible: false,
                cascadeDeleteReason: 'Courses with linked exams cannot be deleted with the event.',
            }
        }

        return {
            cascadeDeleteEligible: true,
            cascadeDeleteReason: null,
        }
    }

    private static getExamCascadeDeleteState(exam: {
        status: string
        invitationCount: number
        attemptCount: number
        sourceLearningEventId?: string | null
    }, eventId: string) {
        if (exam.sourceLearningEventId !== eventId) {
            return {
                cascadeDeleteEligible: false,
                cascadeDeleteReason: 'Attached existing exam. It will only be unlinked.',
            }
        }

        if (exam.status !== 'DRAFT') {
            return {
                cascadeDeleteEligible: false,
                cascadeDeleteReason: 'Published or archived exams cannot be deleted with the event.',
            }
        }

        if (exam.invitationCount > 0) {
            return {
                cascadeDeleteEligible: false,
                cascadeDeleteReason: 'Exams with invitations cannot be deleted with the event.',
            }
        }

        if (exam.attemptCount > 0) {
            return {
                cascadeDeleteEligible: false,
                cascadeDeleteReason: 'Exams with attempts cannot be deleted with the event.',
            }
        }

        return {
            cascadeDeleteEligible: true,
            cascadeDeleteReason: null,
        }
    }

    private static resolveAssessmentKindForEvent(event: {
        countsTowardPerformance: boolean
        format: LearningEventFormat
        series?: { type: LearningSeriesType } | null
    }): AssessmentKind {
        if (
            event.countsTowardPerformance ||
            event.format === 'FINAL_EXAM' ||
            event.series?.type === 'QUARTERLY_FINAL' ||
            event.series?.type === 'YEAR_END_FINAL'
        ) {
            return 'FORMAL'
        }

        if (
            event.format === 'RELEASE_BRIEFING' ||
            event.series?.type === 'RELEASE_READINESS'
        ) {
            return 'READINESS'
        }

        return 'PRACTICE'
    }

    private static assertEventFormatMatchesSeriesType(input: {
        format: LearningEventFormat
        seriesType?: LearningSeriesType | null
        allowLegacyMismatch?: boolean
    }) {
        if (!input.seriesType) {
            return
        }

        if (isEventFormatAllowedForSeriesType(input.seriesType, input.format)) {
            return
        }

        if (input.allowLegacyMismatch) {
            return
        }

        throw new Error('INVALID_EVENT_FORMAT_FOR_SERIES')
    }

    private static async buildExamStats(examIds: string[]) {
        if (examIds.length === 0) {
            return new Map<string, {
                invitationCount: number
                attemptCount: number
                gradedAttemptCount: number
                passedCount: number
                failedCount: number
                passRate: number
            }>()
        }

        const [invitationCounts, attemptCounts, gradedCounts, passedCounts, failedCounts] = await Promise.all([
            prisma.examInvitation.groupBy({
                by: ['examId'],
                where: { examId: { in: examIds } },
                _count: { _all: true },
            }),
            prisma.examAttempt.groupBy({
                by: ['examId'],
                where: { examId: { in: examIds } },
                _count: { _all: true },
            }),
            prisma.examAttempt.groupBy({
                by: ['examId'],
                where: {
                    examId: { in: examIds },
                    status: ExamAttemptStatus.GRADED,
                },
                _count: { _all: true },
            }),
            prisma.examAttempt.groupBy({
                by: ['examId'],
                where: {
                    examId: { in: examIds },
                    passed: true,
                },
                _count: { _all: true },
            }),
            prisma.examAttempt.groupBy({
                by: ['examId'],
                where: {
                    examId: { in: examIds },
                    passed: false,
                },
                _count: { _all: true },
            }),
        ])

        const stats = new Map<string, {
            invitationCount: number
            attemptCount: number
            gradedAttemptCount: number
            passedCount: number
            failedCount: number
            passRate: number
        }>()

        const ensure = (examId: string) => {
            if (!stats.has(examId)) {
                stats.set(examId, {
                    invitationCount: 0,
                    attemptCount: 0,
                    gradedAttemptCount: 0,
                    passedCount: 0,
                    failedCount: 0,
                    passRate: 0,
                })
            }
            return stats.get(examId)!
        }

        invitationCounts.forEach((row) => {
            ensure(row.examId).invitationCount = row._count._all
        })

        attemptCounts.forEach((row) => {
            ensure(row.examId).attemptCount = row._count._all
        })

        gradedCounts.forEach((row) => {
            ensure(row.examId).gradedAttemptCount = row._count._all
        })

        passedCounts.forEach((row) => {
            ensure(row.examId).passedCount = row._count._all
        })

        failedCounts.forEach((row) => {
            ensure(row.examId).failedCount = row._count._all
        })

        stats.forEach((value) => {
            value.passRate = value.gradedAttemptCount > 0
                ? Math.round((value.passedCount / value.gradedAttemptCount) * 100)
                : 0
        })

        return stats
    }

    static async getScopedSummary(user: TrainingOpsOperator) {
        this.ensureTrainingOpsOperator(user)

        const scope = user.role === 'ADMIN'
            ? null
            : await this.getUserTrainingOpsScope(user.id)

        const [allDomains, allSeries, allEvents, allEffectiveness] = await Promise.all([
            this.getDomains({ limit: 100, active: true }),
            this.getLearningSeries({ limit: 100, active: true }),
            this.getLearningEvents({ limit: 100 }),
            this.getDomainEffectiveness(),
        ])

        const domains = scope
            ? allDomains.domains.filter((domain) => scope.domainIds.includes(domain.id))
            : allDomains.domains

        const series = scope
            ? allSeries.series.filter((item) => scope.seriesIds.includes(item.id) || (item.domain?.id ? scope.domainIds.includes(item.domain.id) : false))
            : allSeries.series

        const events = scope
            ? allEvents.events.filter((event) =>
                scope.eventIds.includes(event.id) ||
                (event.series?.id ? scope.seriesIds.includes(event.series.id) : false) ||
                (event.domain?.id ? scope.domainIds.includes(event.domain.id) : false) ||
                event.host?.id === user.id ||
                event.createdBy?.id === user.id
            )
            : allEvents.events

        const effectiveness = scope
            ? allEffectiveness.filter((row) => scope.domainIds.includes(row.id))
            : allEffectiveness

        return {
            domains,
            series,
            events,
            effectiveness,
            scope,
        }
    }

    static async getDomains(params: {
        page?: number
        limit?: number
        search?: string
        category?: ProductDomainCategory
        track?: ProductTrack
        active?: boolean
    }) {
        const page = params.page || 1
        const limit = params.limit || 20
        const skip = (page - 1) * limit

        const where: Prisma.ProductDomainWhereInput = {}

        if (params.category) {
            where.category = params.category
        }

        if (params.track) {
            where.track = params.track
        }

        if (typeof params.active === 'boolean') {
            where.active = params.active
        }

        if (params.search?.trim()) {
            const query = params.search.trim()
            where.OR = [
                { name: { contains: query, mode: 'insensitive' } },
                { slug: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
            ]
        }

        const [domains, total, recentEvents, rewardRows] = await Promise.all([
            prisma.productDomain.findMany({
                where,
                skip,
                take: limit,
                include: {
                    primarySme: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    backupSme: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    _count: {
                        select: {
                            learningSeries: true,
                            learningEvents: true,
                            exams: true,
                            badgeMilestones: true,
                        },
                    },
                },
                orderBy: [{ track: 'asc' }, { name: 'asc' }],
            }),
            prisma.productDomain.count({ where }),
            prisma.$queryRaw<Array<{ domainId: string; eventId: string; title: string; scheduledAt: Date | null }>>(Prisma.sql`
                SELECT DISTINCT ON (e."domainId")
                       e."domainId" AS "domainId",
                       e."id" AS "eventId",
                       e."title",
                       e."scheduledAt"
                FROM "learning_events" e
                WHERE e."domainId" IS NOT NULL
                ORDER BY e."domainId", e."scheduledAt" DESC NULLS LAST, e."updatedAt" DESC
            `),
            prisma.$queryRaw<Array<{ domainId: string; starAwards: bigint | number; badgeAwards: bigint | number; recognizedLearners: bigint | number }>>(Prisma.sql`
                WITH star_counts AS (
                    SELECT sa."domainId",
                           COUNT(*)::bigint AS "starAwards",
                           COUNT(DISTINCT sa."userId")::bigint AS "starUsers"
                    FROM "star_awards" sa
                    WHERE sa."domainId" IS NOT NULL
                    GROUP BY sa."domainId"
                ),
                badge_counts AS (
                    SELECT ba."domainId",
                           COUNT(*)::bigint AS "badgeAwards",
                           COUNT(DISTINCT ba."userId")::bigint AS "badgeUsers"
                    FROM "badge_awards" ba
                    WHERE ba."domainId" IS NOT NULL
                    GROUP BY ba."domainId"
                )
                SELECT COALESCE(sc."domainId", bc."domainId") AS "domainId",
                       COALESCE(sc."starAwards", 0)::bigint AS "starAwards",
                       COALESCE(bc."badgeAwards", 0)::bigint AS "badgeAwards",
                       GREATEST(COALESCE(sc."starUsers", 0), COALESCE(bc."badgeUsers", 0))::bigint AS "recognizedLearners"
                FROM star_counts sc
                FULL OUTER JOIN badge_counts bc ON bc."domainId" = sc."domainId"
            `),
        ])

        const recentEventByDomain = new Map(
            recentEvents.map((event) => [
                event.domainId,
                {
                    id: event.eventId,
                    title: event.title,
                    scheduledAt: event.scheduledAt,
                },
            ])
        )

        const rewardsByDomain = new Map(
            rewardRows.map((row) => [
                row.domainId,
                {
                    starAwards: Number(row.starAwards),
                    badgeAwards: Number(row.badgeAwards),
                    recognizedLearners: Number(row.recognizedLearners),
                },
            ])
        )

        return {
            domains: domains.map((domain) => ({
                id: domain.id,
                name: domain.name,
                slug: domain.slug,
                category: domain.category,
                track: domain.track,
                kpiMode: domain.kpiMode,
                description: domain.description,
                cadence: domain.cadence,
                active: domain.active,
                baselinePassRate: domain.baselinePassRate,
                targetPassRate: domain.targetPassRate,
                challengeThreshold: domain.challengeThreshold,
                primarySme: domain.primarySme,
                backupSme: domain.backupSme,
                counts: {
                    learningSeries: domain._count.learningSeries,
                    learningEvents: domain._count.learningEvents,
                    exams: domain._count.exams,
                    badgeMilestones: domain._count.badgeMilestones,
                },
                recentEvent: recentEventByDomain.get(domain.id) ?? null,
                rewards: rewardsByDomain.get(domain.id) ?? {
                    starAwards: 0,
                    badgeAwards: 0,
                    recognizedLearners: 0,
                },
                createdAt: domain.createdAt,
                updatedAt: domain.updatedAt,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        }
    }

    static async getDomainById(id: string) {
        const domain = await prisma.productDomain.findUnique({
            where: { id },
            include: {
                primarySme: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                backupSme: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                _count: {
                    select: {
                        learningSeries: true,
                        learningEvents: true,
                        exams: true,
                        badgeMilestones: true,
                    },
                },
            },
        })

        if (!domain) {
            throw new Error('PRODUCT_DOMAIN_NOT_FOUND')
        }

        return {
            id: domain.id,
            name: domain.name,
            slug: domain.slug,
            category: domain.category,
            track: domain.track,
            kpiMode: domain.kpiMode,
            description: domain.description,
            cadence: domain.cadence,
            active: domain.active,
            baselinePassRate: domain.baselinePassRate,
            targetPassRate: domain.targetPassRate,
            challengeThreshold: domain.challengeThreshold,
            primarySme: domain.primarySme,
            backupSme: domain.backupSme,
            counts: {
                learningSeries: domain._count.learningSeries,
                learningEvents: domain._count.learningEvents,
                exams: domain._count.exams,
                badgeMilestones: domain._count.badgeMilestones,
            },
            createdAt: domain.createdAt,
            updatedAt: domain.updatedAt,
        }
    }

    static async createDomain(payload: {
        name: string
        slug: string
        category: ProductDomainCategory
        track: ProductTrack
        kpiMode: SmeKpiMode
        description?: string | null
        cadence?: string | null
        active: boolean
        baselinePassRate?: number | null
        targetPassRate?: number | null
        challengeThreshold?: number | null
        primarySmeId?: string | null
        backupSmeId?: string | null
    }) {
        const existing = await prisma.productDomain.findUnique({
            where: { slug: payload.slug },
            select: { id: true },
        })

        if (existing) {
            throw new Error('PRODUCT_DOMAIN_SLUG_EXISTS')
        }

        await Promise.all([
            this.validateActiveUser(payload.primarySmeId, 'PRIMARY_SME_NOT_FOUND'),
            this.validateActiveUser(payload.backupSmeId, 'BACKUP_SME_NOT_FOUND'),
        ])

        const domain = await prisma.productDomain.create({
            data: {
                name: payload.name,
                slug: payload.slug,
                category: payload.category,
                track: payload.track,
                kpiMode: payload.kpiMode,
                description: payload.description ?? null,
                cadence: payload.cadence ?? null,
                active: payload.active,
                baselinePassRate: payload.baselinePassRate ?? null,
                targetPassRate: payload.targetPassRate ?? null,
                challengeThreshold: payload.challengeThreshold ?? null,
                primarySmeId: payload.primarySmeId ?? null,
                backupSmeId: payload.backupSmeId ?? null,
            },
        })

        return this.getDomainById(domain.id)
    }

    static async updateDomain(id: string, payload: {
        name?: string
        slug?: string
        category?: ProductDomainCategory
        track?: ProductTrack
        kpiMode?: SmeKpiMode
        description?: string | null
        cadence?: string | null
        active?: boolean
        baselinePassRate?: number | null
        targetPassRate?: number | null
        challengeThreshold?: number | null
        primarySmeId?: string | null
        backupSmeId?: string | null
    }) {
        const domain = await prisma.productDomain.findUnique({
            where: { id },
            select: { id: true, slug: true },
        })

        if (!domain) {
            throw new Error('PRODUCT_DOMAIN_NOT_FOUND')
        }

        if (payload.slug && payload.slug !== domain.slug) {
            const existing = await prisma.productDomain.findUnique({
                where: { slug: payload.slug },
                select: { id: true },
            })

            if (existing && existing.id !== id) {
                throw new Error('PRODUCT_DOMAIN_SLUG_EXISTS')
            }
        }

        await Promise.all([
            this.validateActiveUser(payload.primarySmeId, 'PRIMARY_SME_NOT_FOUND'),
            this.validateActiveUser(payload.backupSmeId, 'BACKUP_SME_NOT_FOUND'),
        ])

        await prisma.productDomain.update({
            where: { id },
            data: {
                name: payload.name,
                slug: payload.slug,
                category: payload.category,
                track: payload.track,
                kpiMode: payload.kpiMode,
                description: payload.description,
                cadence: payload.cadence,
                active: payload.active,
                baselinePassRate: payload.baselinePassRate,
                targetPassRate: payload.targetPassRate,
                challengeThreshold: payload.challengeThreshold,
                primarySmeId: payload.primarySmeId,
                backupSmeId: payload.backupSmeId,
            },
        })

        return this.getDomainById(id)
    }

    static async getDomainEffectiveness() {
        const [domains, performanceStats, scheduledEventCounts] = await Promise.all([
            prisma.productDomain.findMany({
                include: {
                    primarySme: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    _count: {
                        select: {
                            exams: true,
                            learningEvents: true,
                        },
                    },
                },
                orderBy: [{ track: 'asc' }, { name: 'asc' }],
            }),
            prisma.$queryRaw<Array<{
                productDomainId: string
                linkedExamCount: bigint | number
                performanceExamCount: bigint | number
                gradedAttempts: bigint | number
                passedAttempts: bigint | number
                failedAttempts: bigint | number
            }>>(Prisma.sql`
                SELECT e."productDomainId" AS "productDomainId",
                       COUNT(DISTINCT e."id")::bigint AS "linkedExamCount",
                       COUNT(DISTINCT CASE WHEN e."countsTowardPerformance" = true THEN e."id" END)::bigint AS "performanceExamCount",
                       COUNT(CASE WHEN ea."status" = 'GRADED' THEN 1 END)::bigint AS "gradedAttempts",
                       COUNT(CASE WHEN ea."status" = 'GRADED' AND ea."passed" = true THEN 1 END)::bigint AS "passedAttempts",
                       COUNT(CASE WHEN ea."status" = 'GRADED' AND ea."passed" = false THEN 1 END)::bigint AS "failedAttempts"
                FROM "exams" e
                LEFT JOIN "exam_attempts" ea ON ea."examId" = e."id"
                WHERE e."productDomainId" IS NOT NULL
                GROUP BY e."productDomainId"
            `),
            prisma.$queryRaw<Array<{
                domainId: string
                scheduledEventCount: bigint | number
            }>>(Prisma.sql`
                SELECT le."domainId" AS "domainId",
                       COUNT(*)::bigint AS "scheduledEventCount"
                FROM "learning_events" le
                WHERE le."domainId" IS NOT NULL
                  AND le."status" IN ('DRAFT', 'SCHEDULED', 'IN_PROGRESS')
                GROUP BY le."domainId"
            `),
        ])

        const performanceByDomain = new Map(
            performanceStats.map((row) => [
                row.productDomainId,
                {
                    linkedExamCount: Number(row.linkedExamCount),
                    performanceExamCount: Number(row.performanceExamCount),
                    gradedAttempts: Number(row.gradedAttempts),
                    passedAttempts: Number(row.passedAttempts),
                    failedAttempts: Number(row.failedAttempts),
                },
            ])
        )

        const scheduledEventsByDomain = new Map(
            scheduledEventCounts.map((row) => [row.domainId, Number(row.scheduledEventCount)])
        )

        return domains.map((domain) => {
            const performance = performanceByDomain.get(domain.id) ?? {
                linkedExamCount: 0,
                performanceExamCount: 0,
                gradedAttempts: 0,
                passedAttempts: 0,
                failedAttempts: 0,
            }

            const currentPassRate = performance.gradedAttempts > 0
                ? Math.round((performance.passedAttempts / performance.gradedAttempts) * 100)
                : 0

            const deltaFromBaseline = domain.baselinePassRate === null
                ? null
                : currentPassRate - domain.baselinePassRate

            const targetGap = domain.targetPassRate === null
                ? null
                : domain.targetPassRate - currentPassRate

            let status: 'ON_TRACK' | 'MONITOR' | 'AT_RISK' | 'INSUFFICIENT_DATA' = 'INSUFFICIENT_DATA'

            if (performance.gradedAttempts > 0) {
                if (domain.targetPassRate !== null && currentPassRate >= domain.targetPassRate) {
                    status = 'ON_TRACK'
                } else if (domain.challengeThreshold !== null && currentPassRate < domain.challengeThreshold) {
                    status = 'AT_RISK'
                } else {
                    status = 'MONITOR'
                }
            }

            return {
                id: domain.id,
                name: domain.name,
                slug: domain.slug,
                category: domain.category,
                track: domain.track,
                kpiMode: domain.kpiMode,
                cadence: domain.cadence,
                baselinePassRate: domain.baselinePassRate,
                targetPassRate: domain.targetPassRate,
                challengeThreshold: domain.challengeThreshold,
                currentPassRate,
                deltaFromBaseline,
                targetGap,
                gradedAttempts: performance.gradedAttempts,
                passedAttempts: performance.passedAttempts,
                failedAttempts: performance.failedAttempts,
                linkedExamCount: performance.linkedExamCount || domain._count.exams,
                performanceExamCount: performance.performanceExamCount,
                scheduledEventCount: scheduledEventsByDomain.get(domain.id) ?? 0,
                status,
                primarySme: domain.primarySme,
            }
        })
    }

    static async getLearningSeries(params: {
        page?: number
        limit?: number
        search?: string
        domainId?: string
        type?: LearningSeriesType
        active?: boolean
    }) {
        const page = params.page || 1
        const limit = params.limit || 20
        const skip = (page - 1) * limit

        const where: Prisma.LearningSeriesWhereInput = {}

        if (params.domainId) {
            where.domainId = params.domainId
        }

        if (params.type) {
            where.type = params.type
        }

        if (typeof params.active === 'boolean') {
            where.isActive = params.active
        }

        if (params.search?.trim()) {
            const query = params.search.trim()
            where.OR = [
                { name: { contains: query, mode: 'insensitive' } },
                { slug: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
            ]
        }

        const [series, total, recentEvents, rewardRows] = await Promise.all([
            prisma.learningSeries.findMany({
                where,
                skip,
                take: limit,
                include: {
                    domain: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            track: true,
                        },
                    },
                    owner: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    _count: {
                        select: {
                            events: true,
                            exams: true,
                        },
                    },
                },
                orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
            }),
            prisma.learningSeries.count({ where }),
            prisma.$queryRaw<Array<{ seriesId: string; eventId: string; title: string; scheduledAt: Date | null }>>(Prisma.sql`
                SELECT DISTINCT ON (e."seriesId")
                       e."seriesId" AS "seriesId",
                       e."id" AS "eventId",
                       e."title",
                       e."scheduledAt"
                FROM "learning_events" e
                WHERE e."seriesId" IS NOT NULL
                ORDER BY e."seriesId", e."scheduledAt" DESC NULLS LAST, e."updatedAt" DESC
            `),
            prisma.$queryRaw<Array<{ seriesId: string; starAwards: bigint | number; badgeAwards: bigint | number; recognizedLearners: bigint | number }>>(Prisma.sql`
                WITH series_exam_links AS (
                    SELECT ls."id" AS "seriesId", e."id" AS "examId"
                    FROM "learning_series" ls
                    JOIN "exams" e ON e."learningSeriesId" = ls."id"
                ),
                star_counts AS (
                    SELECT sel."seriesId",
                           COUNT(sa."id")::bigint AS "starAwards",
                           COUNT(DISTINCT sa."userId")::bigint AS "starUsers"
                    FROM series_exam_links sel
                    JOIN "star_awards" sa ON sa."examId" = sel."examId"
                    GROUP BY sel."seriesId"
                ),
                badge_counts AS (
                    SELECT le."seriesId",
                           COUNT(ba."id")::bigint AS "badgeAwards",
                           COUNT(DISTINCT ba."userId")::bigint AS "badgeUsers"
                    FROM "learning_events" le
                    JOIN "badge_awards" ba ON ba."eventId" = le."id"
                    WHERE le."seriesId" IS NOT NULL
                    GROUP BY le."seriesId"
                )
                SELECT COALESCE(sc."seriesId", bc."seriesId") AS "seriesId",
                       COALESCE(sc."starAwards", 0)::bigint AS "starAwards",
                       COALESCE(bc."badgeAwards", 0)::bigint AS "badgeAwards",
                       GREATEST(COALESCE(sc."starUsers", 0), COALESCE(bc."badgeUsers", 0))::bigint AS "recognizedLearners"
                FROM star_counts sc
                FULL OUTER JOIN badge_counts bc ON bc."seriesId" = sc."seriesId"
            `),
        ])

        const recentEventBySeries = new Map(
            recentEvents.map((event) => [
                event.seriesId,
                {
                    id: event.eventId,
                    title: event.title,
                    scheduledAt: event.scheduledAt,
                },
            ])
        )

        const rewardsBySeries = new Map(
            rewardRows.map((row) => [
                row.seriesId,
                {
                    starAwards: Number(row.starAwards),
                    badgeAwards: Number(row.badgeAwards),
                    recognizedLearners: Number(row.recognizedLearners),
                },
            ])
        )

        return {
            series: series.map((item) => ({
                id: item.id,
                name: item.name,
                slug: item.slug,
                type: item.type,
                description: item.description,
                cadence: item.cadence,
                isActive: item.isActive,
                countsTowardPerformance: item.countsTowardPerformance,
                defaultStarValue: item.defaultStarValue,
                domain: item.domain,
                owner: item.owner,
                counts: {
                    events: item._count.events,
                    exams: item._count.exams,
                },
                recentEvent: recentEventBySeries.get(item.id) ?? null,
                rewards: rewardsBySeries.get(item.id) ?? {
                    starAwards: 0,
                    badgeAwards: 0,
                    recognizedLearners: 0,
                },
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        }
    }

    static async getLearningSeriesById(id: string) {
        const item = await prisma.learningSeries.findUnique({
            where: { id },
            include: {
                domain: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        track: true,
                    },
                },
                owner: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                _count: {
                    select: {
                        events: true,
                        exams: true,
                    },
                },
            },
        })

        if (!item) {
            throw new Error('LEARNING_SERIES_NOT_FOUND')
        }

        return {
            id: item.id,
            name: item.name,
            slug: item.slug,
            type: item.type,
            description: item.description,
            cadence: item.cadence,
            isActive: item.isActive,
            countsTowardPerformance: item.countsTowardPerformance,
            defaultStarValue: item.defaultStarValue,
            domain: item.domain,
            owner: item.owner,
            counts: {
                events: item._count.events,
                exams: item._count.exams,
            },
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        }
    }

    static async createLearningSeriesRecord(payload: {
        name: string
        slug: string
        type: LearningSeriesType
        domainId?: string | null
        description?: string | null
        cadence?: string | null
        isActive: boolean
        badgeEligible?: boolean
        countsTowardPerformance: boolean
        defaultStarValue?: number | null
        ownerId?: string | null
    }) {
        const existing = await prisma.learningSeries.findUnique({
            where: { slug: payload.slug },
            select: { id: true },
        })

        if (existing) {
            throw new Error('LEARNING_SERIES_SLUG_EXISTS')
        }

        if (payload.domainId) {
            const domain = await prisma.productDomain.findUnique({
                where: { id: payload.domainId },
                select: { id: true },
            })
            if (!domain) {
                throw new Error('PRODUCT_DOMAIN_NOT_FOUND')
            }
        }

        await this.validateActiveUser(payload.ownerId, 'SERIES_OWNER_NOT_FOUND')

        const series = await prisma.learningSeries.create({
            data: {
                name: payload.name,
                slug: payload.slug,
                type: payload.type,
                domainId: payload.domainId ?? null,
                description: payload.description ?? null,
                cadence: payload.cadence ?? null,
                isActive: payload.isActive,
                badgeEligible: payload.badgeEligible ?? true,
                countsTowardPerformance: payload.countsTowardPerformance,
                defaultStarValue: payload.defaultStarValue ?? null,
                ownerId: payload.ownerId ?? null,
            },
        })

        return this.getLearningSeriesById(series.id)
    }

    static async updateLearningSeriesRecord(id: string, payload: {
        name?: string
        slug?: string
        type?: LearningSeriesType
        domainId?: string | null
        description?: string | null
        cadence?: string | null
        isActive?: boolean
        badgeEligible?: boolean
        countsTowardPerformance?: boolean
        defaultStarValue?: number | null
        ownerId?: string | null
    }) {
        const existingSeries = await prisma.learningSeries.findUnique({
            where: { id },
            select: { id: true, slug: true },
        })

        if (!existingSeries) {
            throw new Error('LEARNING_SERIES_NOT_FOUND')
        }

        if (payload.slug && payload.slug !== existingSeries.slug) {
            const conflict = await prisma.learningSeries.findUnique({
                where: { slug: payload.slug },
                select: { id: true },
            })

            if (conflict && conflict.id !== id) {
                throw new Error('LEARNING_SERIES_SLUG_EXISTS')
            }
        }

        if (payload.domainId) {
            const domain = await prisma.productDomain.findUnique({
                where: { id: payload.domainId },
                select: { id: true },
            })
            if (!domain) {
                throw new Error('PRODUCT_DOMAIN_NOT_FOUND')
            }
        }

        await this.validateActiveUser(payload.ownerId, 'SERIES_OWNER_NOT_FOUND')

        await prisma.learningSeries.update({
            where: { id },
            data: {
                name: payload.name,
                slug: payload.slug,
                type: payload.type,
                domainId: payload.domainId,
                description: payload.description,
                cadence: payload.cadence,
                isActive: payload.isActive,
                ...(payload.badgeEligible !== undefined && { badgeEligible: payload.badgeEligible }),
                countsTowardPerformance: payload.countsTowardPerformance,
                defaultStarValue: payload.defaultStarValue,
                ownerId: payload.ownerId,
            },
        })

        return this.getLearningSeriesById(id)
    }

    static async getBadgeMilestones(params: {
        page?: number
        limit?: number
        search?: string
        domainId?: string
        active?: boolean
    }) {
        const page = params.page || 1
        const limit = params.limit || 20
        const skip = (page - 1) * limit

        const where: Prisma.BadgeMilestoneWhereInput = {
            domainId: { not: null },
        }

        if (params.domainId) {
            where.domainId = params.domainId
        }

        if (typeof params.active === 'boolean') {
            where.active = params.active
        }

        if (params.search?.trim()) {
            const query = params.search.trim()
            where.OR = [
                { name: { contains: query, mode: 'insensitive' } },
                { slug: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
            ]
        }

        const [milestones, total] = await Promise.all([
            prisma.badgeMilestone.findMany({
                where,
                skip,
                take: limit,
                include: {
                    domain: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                    _count: {
                        select: {
                            awards: true,
                        },
                    },
                },
                orderBy: [{ thresholdStars: 'asc' }, { name: 'asc' }],
            }),
            prisma.badgeMilestone.count({ where }),
        ])

        return {
            milestones: milestones.map((item) => ({
                id: item.id,
                name: item.name,
                slug: item.slug,
                description: item.description,
                icon: item.icon,
                thresholdStars: item.thresholdStars,
                active: item.active,
                domain: item.domain,
                awardCount: item._count.awards,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        }
    }

    static async getBadgeMilestoneById(id: string) {
        const item = await prisma.badgeMilestone.findUnique({
            where: { id },
            include: {
                domain: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                _count: {
                    select: {
                        awards: true,
                    },
                },
            },
        })

        if (!item || !item.domainId) {
            throw new Error('BADGE_MILESTONE_NOT_FOUND')
        }

        return {
            id: item.id,
            name: item.name,
            slug: item.slug,
            description: item.description,
            icon: item.icon,
            thresholdStars: item.thresholdStars,
            active: item.active,
            domain: item.domain,
            awardCount: item._count.awards,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        }
    }

    static async createBadgeMilestone(payload: {
        name: string
        slug: string
        description?: string | null
        icon?: string | null
        thresholdStars: number
        active: boolean
        domainId: string
    }) {
        const domain = await prisma.productDomain.findUnique({
            where: { id: payload.domainId },
            select: { id: true },
        })
        if (!domain) {
            throw new Error('PRODUCT_DOMAIN_NOT_FOUND')
        }

        await this.assertUniqueDomainBadgeSlug(payload.domainId, payload.slug)
        await this.assertUniqueDomainBadgeThreshold(payload.domainId, payload.thresholdStars)

        const badge = await prisma.badgeMilestone.create({
            data: {
                name: payload.name,
                slug: payload.slug,
                description: payload.description ?? null,
                icon: payload.icon ?? null,
                thresholdStars: payload.thresholdStars,
                active: payload.active,
                domainId: payload.domainId,
            },
        })

        return this.getBadgeMilestoneById(badge.id)
    }

    static async updateBadgeMilestone(id: string, payload: {
        name?: string
        slug?: string
        description?: string | null
        icon?: string | null
        thresholdStars?: number
        active?: boolean
        domainId?: string | null
    }) {
        const existing = await prisma.badgeMilestone.findUnique({
            where: { id },
            select: {
                id: true,
                slug: true,
                domainId: true,
                thresholdStars: true,
                _count: {
                    select: {
                        awards: true,
                    },
                },
            },
        })

        if (!existing || !existing.domainId) {
            throw new Error('BADGE_MILESTONE_NOT_FOUND')
        }

        const nextDomainId = payload.domainId === undefined ? existing.domainId : payload.domainId
        if (!nextDomainId) {
            throw new Error('BADGE_DOMAIN_REQUIRED')
        }

        const nextSlug = payload.slug ?? existing.slug

        const domain = await prisma.productDomain.findUnique({
            where: { id: nextDomainId },
            select: { id: true },
        })
        if (!domain) {
            throw new Error('PRODUCT_DOMAIN_NOT_FOUND')
        }

        if (existing._count.awards > 0) {
            if (payload.thresholdStars !== undefined && payload.thresholdStars !== existing.thresholdStars) {
                throw new Error('BADGE_THRESHOLD_LOCKED')
            }

            if (payload.domainId !== undefined && payload.domainId !== existing.domainId) {
                throw new Error('BADGE_DOMAIN_LOCKED')
            }
        }

        const nextThresholdStars = payload.thresholdStars ?? existing.thresholdStars
        if (nextDomainId !== existing.domainId || nextThresholdStars !== existing.thresholdStars) {
            await this.assertUniqueDomainBadgeThreshold(nextDomainId, nextThresholdStars, id)
        }

        if (nextDomainId !== existing.domainId || nextSlug !== existing.slug) {
            await this.assertUniqueDomainBadgeSlug(nextDomainId, nextSlug, id)
        }

        await prisma.badgeMilestone.update({
            where: { id },
            data: {
                name: payload.name,
                slug: payload.slug,
                description: payload.description,
                icon: payload.icon,
                thresholdStars: payload.thresholdStars,
                active: payload.active,
                domainId: nextDomainId,
            },
        })

        return this.getBadgeMilestoneById(id)
    }

    static async createScopedBadgeMilestone(
        user: TrainingOpsOperator,
        payload: {
            name: string
            slug: string
            description?: string | null
            icon?: string | null
            thresholdStars: number
            active: boolean
            domainId: string
        }
    ) {
        await this.assertBadgeDomainScope(user, payload.domainId)
        return this.createBadgeMilestone(payload)
    }

    static async getScopedBadgeMilestoneById(user: TrainingOpsOperator, id: string) {
        const badge = await this.getBadgeMilestoneById(id)
        if (!badge.domain?.id) {
            throw new Error('BADGE_MILESTONE_NOT_FOUND')
        }
        await this.assertBadgeDomainScope(user, badge.domain.id)
        return badge
    }

    static async updateScopedBadgeMilestone(
        user: TrainingOpsOperator,
        id: string,
        payload: {
            name?: string
            slug?: string
            description?: string | null
            icon?: string | null
            thresholdStars?: number
            active?: boolean
            domainId?: string | null
        }
    ) {
        const existing = await this.getBadgeMilestoneById(id)
        if (!existing.domain?.id) {
            throw new Error('BADGE_MILESTONE_NOT_FOUND')
        }

        await this.assertBadgeDomainScope(user, existing.domain.id)

        const nextDomainId = payload.domainId === undefined ? existing.domain.id : payload.domainId
        if (!nextDomainId) {
            throw new Error('BADGE_DOMAIN_REQUIRED')
        }

        await this.assertBadgeDomainScope(user, nextDomainId)

        return this.updateBadgeMilestone(id, payload)
    }

    static async getLearningEvents(params: {
        page?: number
        limit?: number
        search?: string
        domainId?: string
        seriesId?: string
        format?: LearningEventFormat
        status?: LearningEventStatus
        startDate?: Date
        endDate?: Date
    }) {
        const page = params.page || 1
        const limit = params.limit || 20
        const skip = (page - 1) * limit

        const where: Prisma.LearningEventWhereInput = {}

        if (params.domainId) {
            where.domainId = params.domainId
        }

        if (params.seriesId) {
            where.seriesId = params.seriesId
        }

        if (params.format) {
            where.format = params.format
        }

        if (params.status) {
            where.status = params.status
        }

        if (params.startDate || params.endDate) {
            where.scheduledAt = {}
            if (params.startDate) {
                where.scheduledAt.gte = params.startDate
            }
            if (params.endDate) {
                where.scheduledAt.lte = params.endDate
            }
        }

        if (params.search?.trim()) {
            const query = params.search.trim()
            where.OR = [
                { title: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
                { releaseVersion: { contains: query, mode: 'insensitive' } },
            ]
        }

        const [events, total] = await Promise.all([
            prisma.learningEvent.findMany({
                where,
                skip,
                take: limit,
                include: {
                    domain: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                    series: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            type: true,
                        },
                    },
                    host: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    createdBy: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    exams: {
                        select: {
                            id: true,
                            title: true,
                            status: true,
                            publishedAt: true,
                        },
                        orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
                    },
                    courses: {
                        select: {
                            id: true,
                            title: true,
                            slug: true,
                            status: true,
                            publishedAt: true,
                            enrolledCount: true,
                        },
                        orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
                    },
                },
                orderBy: [{ scheduledAt: 'asc' }, { updatedAt: 'desc' }],
            }),
            prisma.learningEvent.count({ where }),
        ])

        return {
            events: events.map((item) => ({
                ...this.mapEvent(item),
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        }
    }

    static async createLearningEvent(payload: {
        title: string
        format: LearningEventFormat
        status: LearningEventStatus
        seriesId?: string | null
        domainId?: string | null
        description?: string | null
        releaseVersion?: string | null
        scheduledAt?: Date | null
        startsAt?: Date | null
        endsAt?: Date | null
        isRequired: boolean
        countsTowardPerformance: boolean
        starValue?: number | null
        hostId?: string | null
    }, createdById: string) {
        const creator = await prisma.user.findUnique({
            where: { id: createdById },
            select: { id: true },
        })

        if (!creator) {
            throw new Error('CREATOR_NOT_FOUND')
        }

        const series = payload.seriesId
            ? await prisma.learningSeries.findUnique({
                where: { id: payload.seriesId },
                select: { id: true, domainId: true, type: true },
            })
            : null

        if (payload.seriesId && !series) {
            throw new Error('LEARNING_SERIES_NOT_FOUND')
        }

        const resolvedDomainId = payload.domainId ?? series?.domainId ?? null

        if (payload.domainId) {
            const domain = await prisma.productDomain.findUnique({
                where: { id: payload.domainId },
                select: { id: true },
            })

            if (!domain) {
                throw new Error('PRODUCT_DOMAIN_NOT_FOUND')
            }
        }

        if (series?.domainId && payload.domainId && series.domainId !== payload.domainId) {
            throw new Error('SERIES_DOMAIN_MISMATCH')
        }

        if (payload.hostId) {
            const host = await prisma.user.findUnique({
                where: { id: payload.hostId },
                select: { id: true, status: true },
            })

            if (!host || host.status !== 'ACTIVE') {
                throw new Error('HOST_NOT_FOUND')
            }
        }

        if (payload.scheduledAt && payload.endsAt && payload.endsAt < payload.scheduledAt) {
            throw new Error('INVALID_EVENT_TIME_RANGE')
        }

        if (payload.startsAt && payload.endsAt && payload.endsAt < payload.startsAt) {
            throw new Error('INVALID_EVENT_TIME_RANGE')
        }

        this.assertEventFormatMatchesSeriesType({
            format: payload.format,
            seriesType: series?.type ?? null,
        })

        const event = await prisma.learningEvent.create({
            data: {
                title: payload.title,
                format: payload.format,
                status: payload.status,
                seriesId: payload.seriesId ?? null,
                domainId: resolvedDomainId,
                description: payload.description ?? null,
                releaseVersion: payload.releaseVersion ?? null,
                scheduledAt: payload.scheduledAt ?? null,
                startsAt: payload.startsAt ?? null,
                endsAt: payload.endsAt ?? null,
                isRequired: payload.isRequired,
                countsTowardPerformance: payload.countsTowardPerformance,
                starValue: payload.starValue ?? null,
                hostId: payload.hostId ?? null,
                createdById,
            },
            include: {
                domain: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                series: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        type: true,
                    },
                },
                host: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                exams: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        publishedAt: true,
                    },
                },
                courses: {
                    select: {
                        id: true,
                        title: true,
                        slug: true,
                        status: true,
                        publishedAt: true,
                        enrolledCount: true,
                    },
                },
            },
        })

        return this.mapEvent(event)
    }

    static async updateLearningEvent(id: string, payload: {
        title?: string
        format?: LearningEventFormat
        status?: LearningEventStatus
        seriesId?: string | null
        domainId?: string | null
        description?: string | null
        releaseVersion?: string | null
        scheduledAt?: Date | null
        startsAt?: Date | null
        endsAt?: Date | null
        isRequired?: boolean
        countsTowardPerformance?: boolean
        starValue?: number | null
        hostId?: string | null
    }) {
        const existing = await prisma.learningEvent.findUnique({
            where: { id },
            select: {
                id: true,
                seriesId: true,
                domainId: true,
                title: true,
                format: true,
                status: true,
                description: true,
                releaseVersion: true,
                scheduledAt: true,
                startsAt: true,
                endsAt: true,
                isRequired: true,
                countsTowardPerformance: true,
                starValue: true,
                hostId: true,
                series: {
                    select: {
                        type: true,
                    },
                },
            },
        })

        if (!existing) {
            throw new Error('LEARNING_EVENT_NOT_FOUND')
        }

        const nextSeriesId = payload.seriesId === undefined ? existing.seriesId : payload.seriesId
        const nextDomainId = payload.domainId === undefined ? existing.domainId : payload.domainId

        const series = nextSeriesId
            ? await prisma.learningSeries.findUnique({
                where: { id: nextSeriesId },
                select: { id: true, domainId: true, type: true },
            })
            : null

        if (nextSeriesId && !series) {
            throw new Error('LEARNING_SERIES_NOT_FOUND')
        }

        const resolvedDomainId = nextDomainId ?? series?.domainId ?? null

        if (nextDomainId) {
            const domain = await prisma.productDomain.findUnique({
                where: { id: nextDomainId },
                select: { id: true },
            })

            if (!domain) {
                throw new Error('PRODUCT_DOMAIN_NOT_FOUND')
            }
        }

        if (series?.domainId && nextDomainId && series.domainId !== nextDomainId) {
            throw new Error('SERIES_DOMAIN_MISMATCH')
        }

        const nextHostId = payload.hostId === undefined ? existing.hostId : payload.hostId
        if (nextHostId) {
            const host = await prisma.user.findUnique({
                where: { id: nextHostId },
                select: { id: true, status: true },
            })

            if (!host || host.status !== 'ACTIVE') {
                throw new Error('HOST_NOT_FOUND')
            }
        }

        const nextScheduledAt = payload.scheduledAt === undefined ? existing.scheduledAt : payload.scheduledAt
        const nextStartsAt = payload.startsAt === undefined ? existing.startsAt : payload.startsAt
        const nextEndsAt = payload.endsAt === undefined ? existing.endsAt : payload.endsAt

        if (nextScheduledAt && nextEndsAt && nextEndsAt < nextScheduledAt) {
            throw new Error('INVALID_EVENT_TIME_RANGE')
        }

        if (nextStartsAt && nextEndsAt && nextEndsAt < nextStartsAt) {
            throw new Error('INVALID_EVENT_TIME_RANGE')
        }

        const nextFormat = payload.format === undefined ? existing.format : payload.format
        this.assertEventFormatMatchesSeriesType({
            format: nextFormat,
            seriesType: series?.type ?? existing.series?.type ?? null,
            allowLegacyMismatch:
                existing.seriesId === nextSeriesId &&
                existing.format === nextFormat,
        })

        await prisma.learningEvent.update({
            where: { id },
            data: {
                title: payload.title,
                format: payload.format,
                status: payload.status,
                seriesId: nextSeriesId,
                domainId: resolvedDomainId,
                description: payload.description,
                releaseVersion: payload.releaseVersion,
                scheduledAt: nextScheduledAt,
                startsAt: nextStartsAt,
                endsAt: nextEndsAt,
                isRequired: payload.isRequired,
                countsTowardPerformance: payload.countsTowardPerformance,
                starValue: payload.starValue,
                hostId: nextHostId,
            },
        })

        return this.getLearningEventById(id)
    }

    static async getLearningEventById(id: string) {
        const event = await prisma.learningEvent.findUnique({
            where: { id },
            include: {
                domain: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                series: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        type: true,
                    },
                },
                host: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                exams: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        publishedAt: true,
                        sourceLearningEventId: true,
                    },
                    orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
                },
                courses: {
                    select: {
                        id: true,
                        title: true,
                        slug: true,
                        status: true,
                        publishedAt: true,
                        enrolledCount: true,
                        sourceLearningEventId: true,
                        _count: {
                            select: {
                                exams: true,
                            },
                        },
                    },
                    orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
                },
            },
        })

        if (!event) {
            throw new Error('LEARNING_EVENT_NOT_FOUND')
        }

        const examIds = event.exams.map((exam) => exam.id)
        const [examStats, starAwardCount, badgeAwardCount, recognizedUsers] = await Promise.all([
            this.buildExamStats(examIds),
            prisma.starAward.count({
                where: { eventId: id },
            }),
            prisma.badgeAward.count({
                where: { eventId: id },
            }),
            prisma.starAward.findMany({
                where: { eventId: id },
                distinct: ['userId'],
                select: { userId: true },
            }),
        ])

        const exams: EventExamDeletionView[] = event.exams.map((exam) => {
            const stats = examStats.get(exam.id)
            const examWithStats = {
                ...exam,
                invitationCount: stats?.invitationCount ?? 0,
                attemptCount: stats?.attemptCount ?? 0,
                gradedAttemptCount: stats?.gradedAttemptCount ?? 0,
                passedCount: stats?.passedCount ?? 0,
                failedCount: stats?.failedCount ?? 0,
                passRate: stats?.passRate ?? 0,
            }
            const cascadeState = this.getExamCascadeDeleteState(examWithStats, event.id)

            return {
                ...examWithStats,
                ...cascadeState,
            }
        })

        const courses: EventCourseDeletionView[] = event.courses.map((course) => {
            const courseWithCounts = {
                ...course,
                linkedExamCount: course._count.exams,
            }
            const cascadeState = this.getCourseCascadeDeleteState(courseWithCounts, event.id)

            return {
                ...courseWithCounts,
                ...cascadeState,
            }
        })

        const deletionImpact: EventDeletionImpact = {
            eligibleCourseCount: courses.filter((course) => course.cascadeDeleteEligible).length,
            eligibleExamCount: exams.filter((exam) => exam.cascadeDeleteEligible).length,
            detachableCourseCount: courses.filter((course) => !course.cascadeDeleteEligible).length,
            detachableExamCount: exams.filter((exam) => !exam.cascadeDeleteEligible).length,
        }

        const analytics = exams.reduce(
            (summary, exam) => {
                summary.linkedExamCount += 1
                summary.invitationCount += exam.invitationCount ?? 0
                summary.attemptCount += exam.attemptCount ?? 0
                summary.gradedAttemptCount += exam.gradedAttemptCount ?? 0
                summary.passedCount += exam.passedCount ?? 0
                summary.failedCount += exam.failedCount ?? 0
                return summary
            },
            {
                linkedCourseCount: event.courses.length,
                linkedExamCount: 0,
                invitationCount: 0,
                attemptCount: 0,
                gradedAttemptCount: 0,
                passedCount: 0,
                failedCount: 0,
                passRate: 0,
                starAwardCount,
                badgeAwardCount,
                recognizedLearners: recognizedUsers.length,
            }
        )

        analytics.passRate = analytics.gradedAttemptCount > 0
            ? Math.round((analytics.passedCount / analytics.gradedAttemptCount) * 100)
            : 0

        return {
            ...this.mapEvent(event),
            exams,
            courses,
            deletionImpact,
            analytics,
        }
    }

    static async attachCourseToEvent(eventId: string, courseId: string) {
        const event = await prisma.learningEvent.findUnique({
            where: { id: eventId },
            select: { id: true },
        })

        if (!event) {
            throw new Error('LEARNING_EVENT_NOT_FOUND')
        }

        const course = await prisma.course.findUnique({
            where: { id: courseId },
            select: {
                id: true,
                status: true,
                learningEventId: true,
            },
        })

        if (!course) {
            throw new Error('COURSE_NOT_FOUND')
        }

        if (course.status === 'ARCHIVED') {
            throw new Error('COURSE_ARCHIVED')
        }

        if (course.learningEventId && course.learningEventId !== eventId) {
            throw new Error('COURSE_ALREADY_LINKED_TO_OTHER_EVENT')
        }

        await prisma.course.update({
            where: { id: courseId },
            data: {
                learningEventId: event.id,
            },
        })

        return this.getLearningEventById(eventId)
    }

    static async detachCourseFromEvent(eventId: string, courseId: string) {
        const event = await prisma.learningEvent.findUnique({
            where: { id: eventId },
            select: { id: true },
        })

        if (!event) {
            throw new Error('LEARNING_EVENT_NOT_FOUND')
        }

        const course = await prisma.course.findUnique({
            where: { id: courseId },
            select: { id: true, learningEventId: true },
        })

        if (!course) {
            throw new Error('COURSE_NOT_FOUND')
        }

        if (course.learningEventId !== eventId) {
            throw new Error('COURSE_NOT_LINKED_TO_EVENT')
        }

        await prisma.course.update({
            where: { id: courseId },
            data: {
                learningEventId: null,
            },
        })

        return this.getLearningEventById(eventId)
    }

    static async attachExamToEvent(eventId: string, examId: string) {
        const event = await prisma.learningEvent.findUnique({
            where: { id: eventId },
            include: {
                series: {
                    select: { id: true, type: true, domainId: true },
                },
                domain: {
                    select: { id: true },
                },
            },
        })

        if (!event) {
            throw new Error('LEARNING_EVENT_NOT_FOUND')
        }

        const exam = await prisma.exam.findUnique({
            where: { id: examId },
            select: {
                id: true,
                title: true,
                status: true,
                learningEventId: true,
                learningSeriesId: true,
                productDomainId: true,
            },
        })

        if (!exam) {
            throw new Error('EXAM_NOT_FOUND')
        }

        if (exam.status === ExamStatus.ARCHIVED) {
            throw new Error('EXAM_ARCHIVED')
        }

        if (exam.learningEventId && exam.learningEventId !== eventId) {
            throw new Error('EXAM_ALREADY_LINKED_TO_OTHER_EVENT')
        }

        const resolvedDomainId = event.domainId ?? event.series?.domainId ?? null
        const resolvedSeriesId = event.seriesId ?? null

        if (exam.productDomainId && resolvedDomainId && exam.productDomainId !== resolvedDomainId) {
            throw new Error('EXAM_DOMAIN_MISMATCH')
        }

        if (exam.learningSeriesId && resolvedSeriesId && exam.learningSeriesId !== resolvedSeriesId) {
            throw new Error('EXAM_SERIES_MISMATCH')
        }

        await prisma.exam.update({
            where: { id: examId },
            data: {
                learningEventId: event.id,
                learningSeriesId: exam.learningSeriesId ?? resolvedSeriesId,
                productDomainId: exam.productDomainId ?? resolvedDomainId,
                assessmentKind: this.resolveAssessmentKindForEvent(event),
                countsTowardPerformance: event.countsTowardPerformance,
                awardsStars: event.starValue !== null && event.starValue !== undefined && event.starValue > 0,
                starValue: event.starValue ?? null,
            },
        })

        return this.getLearningEventById(eventId)
    }

    static async detachExamFromEvent(eventId: string, examId: string) {
        const event = await prisma.learningEvent.findUnique({
            where: { id: eventId },
            select: { id: true },
        })

        if (!event) {
            throw new Error('LEARNING_EVENT_NOT_FOUND')
        }

        const exam = await prisma.exam.findUnique({
            where: { id: examId },
            select: { id: true, learningEventId: true },
        })

        if (!exam) {
            throw new Error('EXAM_NOT_FOUND')
        }

        if (exam.learningEventId !== eventId) {
            throw new Error('EXAM_NOT_LINKED_TO_EVENT')
        }

        await prisma.exam.update({
            where: { id: examId },
            data: {
                learningEventId: null,
            },
        })

        return this.getLearningEventById(eventId)
    }

    static async getScopedDomains(user: TrainingOpsOperator) {
        const { domains } = await this.getScopedSummary(user)
        return domains
    }

    static async getScopedSeries(user: TrainingOpsOperator) {
        const { series } = await this.getScopedSummary(user)
        return series
    }

    static async createScopedLearningSeries(
        user: TrainingOpsOperator,
        payload: {
            name: string
            slug: string
            type: LearningSeriesType
            domainId?: string | null
            description?: string | null
            cadence?: string | null
            isActive: boolean
            badgeEligible?: boolean
            countsTowardPerformance: boolean
            defaultStarValue?: number | null
            ownerId?: string | null
        }
    ) {
        this.ensureTrainingOpsOperator(user)

        if (user.role === 'SME') {
            if (!payload.domainId) {
                throw new Error('SME_SERIES_DOMAIN_REQUIRED')
            }

            await this.assertScopeAccess(user, { domainId: payload.domainId })
        }

        return this.createLearningSeriesRecord({
            ...payload,
            ownerId: user.role === 'SME' ? user.id : payload.ownerId,
        })
    }

    static async getScopedLearningSeriesById(user: TrainingOpsOperator, id: string) {
        this.ensureTrainingOpsOperator(user)

        const series = await this.getLearningSeriesById(id)

        if (user.role === 'SME') {
            await this.assertScopeAccess(user, {
                seriesId: series.id,
                domainId: series.domain?.id ?? null,
            })
        }

        return series
    }

    static async updateScopedLearningSeries(
        user: TrainingOpsOperator,
        id: string,
        payload: {
            name?: string
            slug?: string
            type?: LearningSeriesType
            domainId?: string | null
            description?: string | null
            cadence?: string | null
            isActive?: boolean
            countsTowardPerformance?: boolean
            defaultStarValue?: number | null
            ownerId?: string | null
        }
    ) {
        this.ensureTrainingOpsOperator(user)

        const existingSeries = await this.getLearningSeriesById(id)

        if (user.role === 'SME') {
            await this.assertScopeAccess(user, {
                seriesId: existingSeries.id,
                domainId: existingSeries.domain?.id ?? null,
            })

            const nextDomainId = payload.domainId === undefined ? existingSeries.domain?.id ?? null : payload.domainId

            if (!nextDomainId) {
                throw new Error('SME_SERIES_DOMAIN_REQUIRED')
            }

            await this.assertScopeAccess(user, { domainId: nextDomainId })

            return this.updateLearningSeriesRecord(id, {
                ...payload,
                ownerId: existingSeries.owner?.id ?? null,
            })
        }

        return this.updateLearningSeriesRecord(id, payload)
    }

    static async getScopedBadgeLadders(user: TrainingOpsOperator) {
        this.ensureTrainingOpsOperator(user)

        const { domains } = await this.getScopedSummary(user)
        const domainIds = domains.map((item) => item.id)

        if (domainIds.length === 0) {
            return {
                domains: [],
                domainLadders: [],
                recentUnlocks: [],
            }
        }

        const [milestones, recentUnlocks, learnerCounts] = await Promise.all([
            prisma.badgeMilestone.findMany({
                where: {
                    active: true,
                    domainId: { in: domainIds },
                },
                include: {
                    domain: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                    _count: {
                        select: {
                            awards: true,
                        },
                    },
                },
                orderBy: [{ domainId: 'asc' }, { thresholdStars: 'asc' }, { name: 'asc' }],
            }),
            prisma.badgeAward.findMany({
                where: {
                    domainId: { in: domainIds },
                    badge: {
                        is: {
                            domainId: { in: domainIds },
                        },
                    },
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    badge: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            thresholdStars: true,
                        },
                    },
                    domain: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                    event: {
                        select: {
                            id: true,
                            title: true,
                        },
                    },
                    exam: {
                        select: {
                            id: true,
                            title: true,
                        },
                    },
                },
                orderBy: { awardedAt: 'desc' },
                take: 20,
            }),
            prisma.$queryRaw<Array<{ domainId: string; recognizedLearners: bigint | number }>>(Prisma.sql`
                SELECT ba."domainId" AS "domainId",
                       COUNT(DISTINCT ba."userId")::bigint AS "recognizedLearners"
                FROM "badge_awards" ba
                JOIN "badge_milestones" bm ON bm."id" = ba."badgeId"
                WHERE ba."domainId" IN (${Prisma.join(domainIds)})
                GROUP BY ba."domainId"
            `),
        ])

        const learnerCountByDomain = new Map(
            learnerCounts.map((row) => [row.domainId, Number(row.recognizedLearners)])
        )

        const milestonesByDomain = new Map<string, typeof milestones>()
        for (const milestone of milestones) {
            if (!milestone.domainId || !milestone.domain) continue
            const existing = milestonesByDomain.get(milestone.domainId) ?? []
            existing.push(milestone)
            milestonesByDomain.set(milestone.domainId, existing)
        }

        const latestUnlockByDomain = new Map<string, Date>()
        for (const unlock of recentUnlocks) {
            if (!unlock.domainId || latestUnlockByDomain.has(unlock.domainId)) continue
            latestUnlockByDomain.set(unlock.domainId, unlock.awardedAt)
        }

        return {
            domains: domains.map((item) => ({
                id: item.id,
                name: item.name,
                slug: item.slug,
            })),
            domainLadders: domains.map((item) => {
                const domainMilestones = milestonesByDomain.get(item.id) ?? []
                const totalUnlocks = domainMilestones.reduce((sum, milestone) => sum + milestone._count.awards, 0)

                return {
                    domain: {
                        id: item.id,
                        name: item.name,
                        slug: item.slug,
                    },
                    totalUnlocks,
                    recognizedLearners: learnerCountByDomain.get(item.id) ?? 0,
                    latestUnlockedAt: latestUnlockByDomain.get(item.id) ?? null,
                    milestones: domainMilestones.map((milestone) => ({
                        id: milestone.id,
                        name: milestone.name,
                        slug: milestone.slug,
                        description: milestone.description,
                        icon: milestone.icon,
                        thresholdStars: milestone.thresholdStars,
                        awardCount: milestone._count.awards,
                    })),
                }
            }),
            recentUnlocks: recentUnlocks.map((award) => ({
                id: award.id,
                awardedAt: award.awardedAt,
                user: award.user,
                badge: award.badge,
                domain: award.domain!,
                event: award.event,
                exam: award.exam,
            })),
        }
    }

    static async getScopedEvents(
        user: TrainingOpsOperator,
        params: {
            search?: string
            status?: LearningEventStatus
            format?: LearningEventFormat
            seriesId?: string
        } = {}
    ) {
        const { events } = await this.getScopedSummary(user)

        return events.filter((event) => {
            if (params.seriesId && event.series?.id !== params.seriesId) return false
            if (params.status && event.status !== params.status) return false
            if (params.format && event.format !== params.format) return false
            if (params.search?.trim()) {
                const query = params.search.trim().toLowerCase()
                const haystack = [
                    event.title,
                    event.description ?? '',
                    event.releaseVersion ?? '',
                    event.domain?.name ?? '',
                    event.series?.name ?? '',
                ].join(' ').toLowerCase()
                if (!haystack.includes(query)) return false
            }
            return true
        })
    }

    static async getScopedEffectiveness(user: TrainingOpsOperator) {
        const { effectiveness } = await this.getScopedSummary(user)
        return effectiveness
    }

    static async getScopedHosts(user: TrainingOpsOperator) {
        this.ensureTrainingOpsOperator(user)

        const users = await prisma.user.findMany({
            where: { status: 'ACTIVE' },
            select: {
                id: true,
                name: true,
                email: true,
                wecomUserId: true,
                avatar: true,
                role: true,
                status: true,
                department: true,
                title: true,
                createdAt: true,
                lastLoginAt: true,
                _count: {
                    select: {
                        enrollments: true,
                    },
                },
            },
            orderBy: [{ name: 'asc' }],
        })

        return users.map((item) => ({
            id: item.id,
            name: item.name,
            email: item.email,
            wecomUserId: item.wecomUserId,
            avatar: item.avatar,
            role: item.role,
            status: item.status,
            department: item.department,
            title: item.title,
            createdAt: item.createdAt,
            lastLoginAt: item.lastLoginAt,
            enrollmentCount: item._count.enrollments,
            completedCourses: 0,
        }))
    }

    static async getScopedExams(user: TrainingOpsOperator) {
        this.ensureTrainingOpsOperator(user)

        let where: Prisma.ExamWhereInput = {
            status: { not: ExamStatus.ARCHIVED },
        }

        if (user.role !== 'ADMIN') {
            where = {
                ...where,
                createdById: user.id,
            }
        }

        const exams = await prisma.exam.findMany({
            where,
            select: {
                id: true,
                title: true,
                status: true,
                publishedAt: true,
                productDomainId: true,
                learningSeriesId: true,
                learningEventId: true,
                _count: {
                    select: {
                        invitations: true,
                        attempts: true,
                    },
                },
            },
            orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
            take: 200,
        })

        const examIds = exams.map((item) => item.id)
        const stats = await this.buildExamStats(examIds)

        return exams.map((item) => {
            const examStats = stats.get(item.id)
            return {
                id: item.id,
                title: item.title,
                status: item.status,
                publishedAt: item.publishedAt,
                productDomainId: item.productDomainId,
                learningSeriesId: item.learningSeriesId,
                learningEventId: item.learningEventId,
                invitationCount: examStats?.invitationCount ?? item._count.invitations,
                attemptCount: examStats?.attemptCount ?? item._count.attempts,
                gradedAttemptCount: examStats?.gradedAttemptCount ?? 0,
                passedCount: examStats?.passedCount ?? 0,
                failedCount: examStats?.failedCount ?? 0,
                passRate: examStats?.passRate ?? 0,
            }
        })
    }

    static async getScopedExamById(user: TrainingOpsOperator, examId: string) {
        this.ensureTrainingOpsOperator(user)

        const exam = await prisma.exam.findUnique({
            where: { id: examId },
            select: {
                id: true,
                title: true,
                description: true,
                instructions: true,
                status: true,
                assessmentKind: true,
                awardsStars: true,
                starValue: true,
                countsTowardPerformance: true,
                publishedAt: true,
                createdAt: true,
                updatedAt: true,
                productDomainId: true,
                learningSeriesId: true,
                learningEventId: true,
                createdById: true,
                productDomain: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                learningSeries: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                learningEvent: {
                    select: {
                        id: true,
                        title: true,
                        format: true,
                        status: true,
                    },
                },
                _count: {
                    select: {
                        questions: true,
                        invitations: true,
                        attempts: true,
                    },
                },
            },
        })

        if (!exam || exam.status === ExamStatus.ARCHIVED) {
            throw new Error('EXAM_NOT_FOUND')
        }

        if (user.role !== 'ADMIN' && exam.createdById !== user.id) {
            throw new Error('TRAINING_OPS_SCOPE_FORBIDDEN')
        }

        const stats = await this.buildExamStats([exam.id])
        const examStats = stats.get(exam.id)

        return {
            id: exam.id,
            title: exam.title,
            description: exam.description,
            instructions: exam.instructions,
            status: exam.status,
            assessmentKind: exam.assessmentKind,
            awardsStars: exam.awardsStars,
            starValue: exam.starValue,
            countsTowardPerformance: exam.countsTowardPerformance,
            publishedAt: exam.publishedAt,
            createdAt: exam.createdAt,
            updatedAt: exam.updatedAt,
            productDomainId: exam.productDomainId,
            learningSeriesId: exam.learningSeriesId,
            learningEventId: exam.learningEventId,
            domain: exam.productDomain,
            series: exam.learningSeries,
            event: exam.learningEvent,
            questionCount: exam._count.questions,
            invitationCount: exam._count.invitations,
            attemptCount: exam._count.attempts,
            gradedAttemptCount: examStats?.gradedAttemptCount ?? 0,
            passedCount: examStats?.passedCount ?? 0,
            failedCount: examStats?.failedCount ?? 0,
            passRate: examStats?.passRate ?? 0,
        }
    }

    static async canAccessScopedExam(user: TrainingOpsOperator, examId: string) {
        try {
            await this.getScopedExamById(user, examId)
            return true
        } catch (error) {
            if (
                error instanceof Error &&
                (error.message === 'EXAM_NOT_FOUND' || error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN')
            ) {
                return false
            }

            throw error
        }
    }

    static async assertScopedExamAccess(user: TrainingOpsOperator, examId: string) {
        const canAccess = await this.canAccessScopedExam(user, examId)
        if (!canAccess) {
            throw new Error('TRAINING_OPS_SCOPE_FORBIDDEN')
        }
    }

    static async getScopedCourses(user: TrainingOpsOperator) {
        this.ensureTrainingOpsOperator(user)

        let where: Prisma.CourseWhereInput = {
            status: { not: 'ARCHIVED' },
        }

        if (user.role !== 'ADMIN') {
            where = {
                ...where,
                instructorId: user.id,
            }
        }

        const courses = await prisma.course.findMany({
            where,
            select: {
                id: true,
                title: true,
                slug: true,
                thumbnail: true,
                status: true,
                publishedAt: true,
                enrolledCount: true,
                category: true,
                level: true,
                rating: true,
                learningEventId: true,
                learningEvent: {
                    select: {
                        domainId: true,
                        seriesId: true,
                    },
                },
                instructor: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                _count: {
                    select: {
                        chapters: true,
                    },
                },
            },
            orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
            take: 200,
        })

        return courses.map((course) => ({
            id: course.id,
            title: course.title,
            slug: course.slug,
            thumbnail: course.thumbnail,
            status: course.status,
            publishedAt: course.publishedAt,
            enrolledCount: course.enrolledCount,
            category: course.category,
            level: course.level,
            rating: course.rating,
            learningEventId: course.learningEventId,
            productDomainId: course.learningEvent?.domainId ?? null,
            learningSeriesId: course.learningEvent?.seriesId ?? null,
            instructor: course.instructor,
            chapters: Array.from({ length: course._count.chapters }).map((_, index) => ({ id: `${course.id}-chapter-${index}` })),
        }))
    }

    static async getScopedCourseById(user: TrainingOpsOperator, courseId: string) {
        this.ensureTrainingOpsOperator(user)

        const course = await prisma.course.findUnique({
            where: { id: courseId },
            select: {
                id: true,
                title: true,
                slug: true,
                description: true,
                status: true,
                publishedAt: true,
                enrolledCount: true,
                category: true,
                level: true,
                tags: true,
                learningOutcomes: true,
                requirements: true,
                instructorId: true,
                learningEventId: true,
                createdAt: true,
                updatedAt: true,
                instructor: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                learningEvent: {
                    select: {
                        id: true,
                        title: true,
                        format: true,
                        status: true,
                    },
                },
                _count: {
                    select: {
                        chapters: true,
                        enrollments: true,
                        exams: true,
                    },
                },
            },
        })

        if (!course || course.status === 'ARCHIVED') {
            throw new Error('COURSE_NOT_FOUND')
        }

        if (user.role !== 'ADMIN') {
            const isInstructor = course.instructorId === user.id

            if (!isInstructor) {
                throw new Error('TRAINING_OPS_SCOPE_FORBIDDEN')
            }
        }

        return {
            id: course.id,
            title: course.title,
            slug: course.slug,
            description: course.description,
            status: course.status,
            publishedAt: course.publishedAt,
            enrolledCount: course.enrolledCount,
            category: course.category,
            level: course.level,
            tags: course.tags,
            learningOutcomes: course.learningOutcomes,
            requirements: course.requirements,
            learningEventId: course.learningEventId,
            createdAt: course.createdAt,
            updatedAt: course.updatedAt,
            instructor: course.instructor,
            event: course.learningEvent,
            chapterCount: course._count.chapters,
            enrollmentCount: course._count.enrollments,
            linkedExamCount: course._count.exams,
        }
    }

    static async canAccessScopedCourse(user: TrainingOpsOperator, courseId: string) {
        try {
            await this.getScopedCourseById(user, courseId)
            return true
        } catch (error) {
            if (
                error instanceof Error &&
                (error.message === 'COURSE_NOT_FOUND' || error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN')
            ) {
                return false
            }

            throw error
        }
    }

    static async assertScopedCourseAccess(user: TrainingOpsOperator, courseId: string) {
        const canAccess = await this.canAccessScopedCourse(user, courseId)
        if (!canAccess) {
            throw new Error('TRAINING_OPS_SCOPE_FORBIDDEN')
        }
    }

    static async assertScopedLessonAccess(user: TrainingOpsOperator, lessonId: string) {
        if (user.role === 'ADMIN') {
            return
        }

        this.ensureTrainingOpsOperator(user)

        const lesson = await prisma.lesson.findUnique({
            where: { id: lessonId },
            select: {
                chapter: {
                    select: {
                        courseId: true,
                    },
                },
            },
        })

        if (!lesson) {
            throw new Error('LESSON_NOT_FOUND')
        }

        await this.assertScopedCourseAccess(user, lesson.chapter.courseId)
    }

    static async getScopedLearningEventById(user: TrainingOpsOperator, eventId: string) {
        const event = await this.getLearningEventById(eventId)

        await this.assertScopeAccess(user, {
            eventId: event.id,
            domainId: event.domain?.id ?? null,
            seriesId: event.series?.id ?? null,
            hostId: event.host?.id ?? null,
            createdById: event.createdBy?.id ?? null,
        })

        return event
    }

    static async createScopedLearningEvent(
        user: TrainingOpsOperator,
        payload: {
            title: string
            format: LearningEventFormat
            status: LearningEventStatus
            seriesId?: string | null
            domainId?: string | null
            description?: string | null
            releaseVersion?: string | null
            scheduledAt?: Date | null
            startsAt?: Date | null
            endsAt?: Date | null
            isRequired: boolean
            countsTowardPerformance: boolean
            starValue?: number | null
            hostId?: string | null
        }
    ) {
        this.ensureTrainingOpsOperator(user)

        if (user.role === 'SME') {
            if (!payload.domainId && !payload.seriesId) {
                throw new Error('SME_DOMAIN_REQUIRED')
            }

            if (payload.domainId) {
                await this.assertScopeAccess(user, { domainId: payload.domainId })
            }

            if (payload.seriesId) {
                await this.assertScopeAccess(user, { seriesId: payload.seriesId })
            }
        }

        return this.createLearningEvent(payload, user.id)
    }

    static async updateScopedLearningEventForUser(
        user: TrainingOpsOperator,
        eventId: string,
        payload: {
            title?: string
            format?: LearningEventFormat
            status?: LearningEventStatus
            seriesId?: string | null
            domainId?: string | null
            description?: string | null
            releaseVersion?: string | null
            scheduledAt?: Date | null
            startsAt?: Date | null
            endsAt?: Date | null
            isRequired?: boolean
            countsTowardPerformance?: boolean
            starValue?: number | null
            hostId?: string | null
        }
    ) {
        const event = await this.getLearningEventById(eventId)

        await this.assertScopeAccess(user, {
            eventId: event.id,
            domainId: event.domain?.id ?? null,
            seriesId: event.series?.id ?? null,
            hostId: event.host?.id ?? null,
            createdById: event.createdBy?.id ?? null,
        })

        if (user.role === 'SME') {
            if (payload.domainId) {
                await this.assertScopeAccess(user, { domainId: payload.domainId })
            }

            if (payload.seriesId) {
                await this.assertScopeAccess(user, { seriesId: payload.seriesId })
            }
        }

        return this.updateLearningEvent(eventId, payload)
    }

    static async attachScopedExamToEvent(user: TrainingOpsOperator, eventId: string, examId: string) {
        const event = await this.getLearningEventById(eventId)

        await this.assertScopeAccess(user, {
            eventId: event.id,
            domainId: event.domain?.id ?? null,
            seriesId: event.series?.id ?? null,
            hostId: event.host?.id ?? null,
            createdById: event.createdBy?.id ?? null,
        })

        await this.assertScopedExamAccess(user, examId)

        return this.attachExamToEvent(eventId, examId)
    }

    static async attachScopedCourseToEvent(user: TrainingOpsOperator, eventId: string, courseId: string) {
        const event = await this.getLearningEventById(eventId)

        await this.assertScopeAccess(user, {
            eventId: event.id,
            domainId: event.domain?.id ?? null,
            seriesId: event.series?.id ?? null,
            hostId: event.host?.id ?? null,
            createdById: event.createdBy?.id ?? null,
        })

        await this.assertScopedCourseAccess(user, courseId)

        return this.attachCourseToEvent(eventId, courseId)
    }

    static async detachScopedExamFromEvent(user: TrainingOpsOperator, eventId: string, examId: string) {
        const event = await this.getLearningEventById(eventId)

        await this.assertScopeAccess(user, {
            eventId: event.id,
            domainId: event.domain?.id ?? null,
            seriesId: event.series?.id ?? null,
            hostId: event.host?.id ?? null,
            createdById: event.createdBy?.id ?? null,
        })

        await this.assertScopedExamAccess(user, examId)

        return this.detachExamFromEvent(eventId, examId)
    }

    static async detachScopedCourseFromEvent(user: TrainingOpsOperator, eventId: string, courseId: string) {
        const event = await this.getLearningEventById(eventId)

        await this.assertScopeAccess(user, {
            eventId: event.id,
            domainId: event.domain?.id ?? null,
            seriesId: event.series?.id ?? null,
            hostId: event.host?.id ?? null,
            createdById: event.createdBy?.id ?? null,
        })

        await this.assertScopedCourseAccess(user, courseId)

        return this.detachCourseFromEvent(eventId, courseId)
    }

    static async createScopedDraftExamFromEvent(user: TrainingOpsOperator, eventId: string) {
        const event = await this.getLearningEventById(eventId)

        await this.assertScopeAccess(user, {
            eventId: event.id,
            domainId: event.domain?.id ?? null,
            seriesId: event.series?.id ?? null,
            hostId: event.host?.id ?? null,
            createdById: event.createdBy?.id ?? null,
        })

        return ExamService.createExam(
            {
                title: `${event.title} Assessment`,
                description: event.description ?? undefined,
                instructions: event.description ?? undefined,
                timezone: 'UTC',
                learningEventId: event.id,
                sourceLearningEventId: event.id,
                learningSeriesId: event.series?.id ?? null,
                productDomainId: event.domain?.id ?? null,
            },
            user.id
        )
    }

    static async createScopedDraftCourseFromEvent(user: TrainingOpsOperator, eventId: string) {
        const event = await this.getLearningEventById(eventId)

        await this.assertScopeAccess(user, {
            eventId: event.id,
            domainId: event.domain?.id ?? null,
            seriesId: event.series?.id ?? null,
            hostId: event.host?.id ?? null,
            createdById: event.createdBy?.id ?? null,
        })

        const slug = `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-course`

        return CourseService.createCourse({
            title: `${event.title} Course`,
            slug,
            description: event.description ?? `Course created from learning event: ${event.title}`,
            level: 'INTERMEDIATE',
            category: event.domain?.name ?? 'Training Ops',
            tags: [event.domain?.slug, event.series?.slug, 'training-ops', 'event-course'].filter((value): value is string => Boolean(value)),
            learningOutcomes: [],
            requirements: [],
            instructorId: user.id,
            learningEventId: event.id,
            sourceLearningEventId: event.id,
            status: 'DRAFT',
        })
    }

    static async deleteLearningEvent(eventId: string) {
        const existing = await prisma.learningEvent.findUnique({
            where: { id: eventId },
            select: { id: true },
        })

        if (!existing) {
            throw new Error('LEARNING_EVENT_NOT_FOUND')
        }

        await prisma.learningEvent.delete({
            where: { id: eventId },
        })
    }

    static async deleteScopedLearningEventForUser(
        user: TrainingOpsOperator,
        eventId: string,
        options?: { cascadeDraftAssets?: boolean }
    ) {
        const event = await this.getLearningEventById(eventId)

        await this.assertScopeAccess(user, {
            eventId: event.id,
            domainId: event.domain?.id ?? null,
            seriesId: event.series?.id ?? null,
            hostId: event.host?.id ?? null,
            createdById: event.createdBy?.id ?? null,
        })

        if (options?.cascadeDraftAssets) {
            for (const exam of event.exams.filter((item) => item.cascadeDeleteEligible)) {
                await ExamService.deleteExam(exam.id, { force: true })
            }

            for (const course of event.courses.filter((item) => item.cascadeDeleteEligible)) {
                await CascadeDeleteService.deleteCourseCascade(course.id)
            }
        }

        await this.deleteLearningEvent(eventId)
    }

    static async getScopedLearnerGaps(user: TrainingOpsOperator) {
        const { scope } = await this.getScopedSummary(user)
        const domainIds = scope?.domainIds ?? (
            await prisma.productDomain.findMany({ select: { id: true } })
        ).map((row) => row.id)

        if (domainIds.length === 0) {
            return {
                weakTopics: [],
                learnerGaps: [],
            }
        }

        const domainIdSql = Prisma.join(domainIds)

        const [weakTopics, learnerGaps] = await Promise.all([
            prisma.$queryRaw<Array<{
                topic: string | null
                misses: bigint | number
                answered: bigint | number
                domainName: string | null
            }>>(Prisma.sql`
                SELECT snap."topic" AS "topic",
                       COUNT(*) FILTER (WHERE ans."isCorrect" = false)::bigint AS "misses",
                       COUNT(*)::bigint AS "answered",
                       MAX(pd."name") AS "domainName"
                FROM "exam_answers" ans
                JOIN "exam_attempts" att ON att."id" = ans."attemptId"
                JOIN "exams" e ON e."id" = att."examId"
                JOIN "exam_attempt_question_snapshots" snap
                  ON snap."attemptId" = att."id"
                 AND snap."questionId" = ans."questionId"
                LEFT JOIN "product_domains" pd ON pd."id" = COALESCE(snap."productDomainId", e."productDomainId")
                WHERE e."productDomainId" IN (${domainIdSql})
                  AND ans."gradingStatus" IN ('AUTO_GRADED', 'MANUALLY_GRADED')
                  AND snap."topic" IS NOT NULL
                  AND snap."topic" <> ''
                GROUP BY snap."topic"
                HAVING COUNT(*) FILTER (WHERE ans."isCorrect" = false) > 0
                ORDER BY "misses" DESC, "answered" DESC
                LIMIT 8
            `),
            prisma.$queryRaw<Array<{
                userId: string
                name: string
                email: string
                gradedAttempts: bigint | number
                passedAttempts: bigint | number
                failedAttempts: bigint | number
                passRate: bigint | number
                lastSubmittedAt: Date | null
            }>>(Prisma.sql`
                SELECT u."id" AS "userId",
                       u."name",
                       u."email",
                       COUNT(*) FILTER (WHERE att."status" = 'GRADED')::bigint AS "gradedAttempts",
                       COUNT(*) FILTER (WHERE att."status" = 'GRADED' AND att."passed" = true)::bigint AS "passedAttempts",
                       COUNT(*) FILTER (WHERE att."status" = 'GRADED' AND att."passed" = false)::bigint AS "failedAttempts",
                       COALESCE(ROUND(
                           (
                               COUNT(*) FILTER (WHERE att."status" = 'GRADED' AND att."passed" = true)::numeric
                               / NULLIF(COUNT(*) FILTER (WHERE att."status" = 'GRADED'), 0)
                           ) * 100
                       ), 0)::bigint AS "passRate",
                       MAX(att."submittedAt") AS "lastSubmittedAt"
                FROM "exam_attempts" att
                JOIN "exams" e ON e."id" = att."examId"
                JOIN "users" u ON u."id" = att."userId"
                WHERE e."productDomainId" IN (${domainIdSql})
                GROUP BY u."id", u."name", u."email"
                HAVING COUNT(*) FILTER (WHERE att."status" = 'GRADED') > 0
                ORDER BY "passRate" ASC, "failedAttempts" DESC, "gradedAttempts" DESC
                LIMIT 10
            `),
        ])

        return {
            weakTopics: weakTopics.map((row) => ({
                topic: row.topic,
                misses: Number(row.misses),
                answered: Number(row.answered),
                domainName: row.domainName,
            })),
            learnerGaps: learnerGaps.map((row) => ({
                userId: row.userId,
                name: row.name,
                email: row.email,
                gradedAttempts: Number(row.gradedAttempts),
                passedAttempts: Number(row.passedAttempts),
                failedAttempts: Number(row.failedAttempts),
                passRate: Number(row.passRate),
                lastSubmittedAt: row.lastSubmittedAt,
            })),
        }
    }
}
