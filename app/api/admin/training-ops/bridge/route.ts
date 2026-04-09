import { NextResponse } from 'next/server'
import { CertificateStatus, Prisma } from '@prisma/client'
import { withAdminAuth } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'
import { AnalyticsService } from '@/lib/services/analytics.service'

const optionalValue = async <T,>(fallback: T, loader: () => Promise<T>): Promise<T> => {
    try {
        return await loader()
    } catch (error) {
        console.warn('Training ops bridge optional query skipped:', error)
        return fallback
    }
}

const optionalCountQuery = async (query: Prisma.Sql): Promise<number | null> => {
    try {
        const result = await prisma.$queryRaw<Array<{ count: bigint | number | string }>>(query)
        return Number(result[0]?.count ?? 0)
    } catch (error) {
        console.warn('Training ops bridge optional count query skipped:', error)
        return null
    }
}

const optionalUserIdsQuery = async (query: Prisma.Sql): Promise<string[]> => {
    try {
        const result = await prisma.$queryRaw<Array<{ userId: string }>>(query)
        return result.map((entry) => entry.userId)
    } catch (error) {
        console.warn('Training ops bridge optional user-id query skipped:', error)
        return []
    }
}

export const GET = withAdminAuth(async () => {
    try {
        const analytics = await AnalyticsService.getSummary()

        const [
            totalExams,
            draftExams,
            pendingReviewExams,
            approvedExams,
            publishedExams,
            totalInvitations,
            totalAttempts,
            achievementTemplates,
            achievementAwards,
            issuedCertificates,
            formalCertificates,
            achievementUsers,
            certificateUsers,
            practiceExams,
            readinessExams,
            formalExams,
            performanceTrackedExams,
            starEnabledExams,
            examsMappedToDomain,
            questionsMappedToDomain,
            productDomains,
            activeProductDomains,
            learningSeries,
            activeLearningSeries,
            scheduledEvents,
            completedEvents,
            badgeMilestones,
            badgeAwards,
            starAwards,
            badgeUsers,
            starUsers,
            recentExams,
            previewDomains,
            previewSeries,
            previewEvents,
            topRewardDomains,
            rewardedEvents,
            topLearners,
            certificateExams,
        ] = await Promise.all([
            prisma.exam.count(),
            prisma.exam.count({ where: { status: 'DRAFT' } }),
            prisma.exam.count({ where: { status: 'PENDING_REVIEW' } }),
            prisma.exam.count({ where: { status: 'APPROVED' } }),
            prisma.exam.count({ where: { status: 'PUBLISHED' } }),
            prisma.examInvitation.count(),
            prisma.examAttempt.count(),
            prisma.achievement.count(),
            prisma.userAchievement.count(),
            prisma.certificate.count({ where: { status: CertificateStatus.ISSUED } }),
            optionalCountQuery(
                Prisma.sql`
                    SELECT COUNT(*)::bigint AS count
                    FROM "certificates" c
                    INNER JOIN "exams" e ON e."id" = c."examId"
                    WHERE c."status" = 'ISSUED'
                      AND e."assessmentKind" = 'FORMAL'
                `
            ),
            prisma.userAchievement.findMany({
                distinct: ['userId'],
                select: { userId: true },
            }),
            prisma.certificate.findMany({
                where: { status: CertificateStatus.ISSUED },
                distinct: ['userId'],
                select: { userId: true },
            }),
            optionalCountQuery(
                Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "exams" WHERE "assessmentKind" = 'PRACTICE'`
            ),
            optionalCountQuery(
                Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "exams" WHERE "assessmentKind" = 'READINESS'`
            ),
            optionalCountQuery(
                Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "exams" WHERE "assessmentKind" = 'FORMAL'`
            ),
            optionalCountQuery(
                Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "exams" WHERE "countsTowardPerformance" = true`
            ),
            optionalCountQuery(
                Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "exams" WHERE "awardsStars" = true`
            ),
            optionalCountQuery(
                Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "exams" WHERE "productDomainId" IS NOT NULL`
            ),
            optionalCountQuery(
                Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "exam_questions" WHERE "productDomainId" IS NOT NULL`
            ),
            optionalCountQuery(
                Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "product_domains"`
            ),
            optionalCountQuery(
                Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "product_domains" WHERE "active" = true`
            ),
            optionalCountQuery(
                Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "learning_series"`
            ),
            optionalCountQuery(
                Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "learning_series" WHERE "isActive" = true`
            ),
            optionalCountQuery(
                Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "learning_events" WHERE "status" = 'SCHEDULED'`
            ),
            optionalCountQuery(
                Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "learning_events" WHERE "status" = 'COMPLETED'`
            ),
            optionalCountQuery(
                Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "badge_milestones"`
            ),
            optionalCountQuery(
                Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "badge_awards"`
            ),
            optionalCountQuery(
                Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "star_awards"`
            ),
            optionalUserIdsQuery(
                Prisma.sql`SELECT DISTINCT "userId" FROM "badge_awards"`
            ),
            optionalUserIdsQuery(
                Prisma.sql`SELECT DISTINCT "userId" FROM "star_awards"`
            ),
            prisma.exam.findMany({
                orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
                take: 5,
                select: {
                    id: true,
                    title: true,
                    status: true,
                    updatedAt: true,
                    publishedAt: true,
                    allowReview: true,
                    maxAttempts: true,
                    _count: {
                        select: {
                            questions: true,
                            invitations: true,
                            attempts: true,
                        },
                    },
                },
            }),
            optionalValue([], () =>
                prisma.$queryRaw<Array<{ id: string; name: string; cadence: string | null; primarySmeName: string | null }>>(
                    Prisma.sql`
                        SELECT d."id",
                               d."name",
                               d."cadence",
                               u."name" AS "primarySmeName"
                        FROM "product_domains" d
                        LEFT JOIN "users" u ON u."id" = d."primarySmeId"
                        ORDER BY d."track" ASC, d."name" ASC
                        LIMIT 6
                    `
                )
            ),
            optionalValue([], () =>
                prisma.$queryRaw<Array<{ id: string; name: string; type: string; domainName: string | null; cadence: string | null; isActive: boolean }>>(
                    Prisma.sql`
                        SELECT s."id",
                               s."name",
                               s."type"::text AS "type",
                               d."name" AS "domainName",
                               s."cadence",
                               s."isActive"
                        FROM "learning_series" s
                        LEFT JOIN "product_domains" d ON d."id" = s."domainId"
                        ORDER BY s."updatedAt" DESC
                        LIMIT 6
                    `
                )
            ),
            optionalValue([], () =>
                prisma.$queryRaw<Array<{ id: string; title: string; status: string; scheduledAt: Date | string | null; domainName: string | null; hostName: string | null }>>(
                    Prisma.sql`
                        SELECT e."id",
                               e."title",
                               e."status"::text AS "status",
                               e."scheduledAt",
                               d."name" AS "domainName",
                               u."name" AS "hostName"
                        FROM "learning_events" e
                        LEFT JOIN "product_domains" d ON d."id" = e."domainId"
                        LEFT JOIN "users" u ON u."id" = e."hostId"
                        ORDER BY e."scheduledAt" ASC NULLS LAST, e."updatedAt" DESC
                        LIMIT 6
                    `
                )
            ),
            optionalValue([], () =>
                prisma.$queryRaw<Array<{
                    domainId: string | null
                    domainName: string | null
                    starAwards: bigint | number
                    badgeAwards: bigint | number
                    recognizedLearners: bigint | number
                }>>(
                    Prisma.sql`
                        WITH star_counts AS (
                            SELECT sa."domainId",
                                   COUNT(*)::bigint AS "starAwards",
                                   COUNT(DISTINCT sa."userId")::bigint AS "starUsers"
                            FROM "star_awards" sa
                            GROUP BY sa."domainId"
                        ),
                        badge_counts AS (
                            SELECT ba."domainId",
                                   COUNT(*)::bigint AS "badgeAwards",
                                   COUNT(DISTINCT ba."userId")::bigint AS "badgeUsers"
                            FROM "badge_awards" ba
                            GROUP BY ba."domainId"
                        )
                        SELECT COALESCE(sc."domainId", bc."domainId") AS "domainId",
                               d."name" AS "domainName",
                               COALESCE(sc."starAwards", 0)::bigint AS "starAwards",
                               COALESCE(bc."badgeAwards", 0)::bigint AS "badgeAwards",
                               GREATEST(COALESCE(sc."starUsers", 0), COALESCE(bc."badgeUsers", 0))::bigint AS "recognizedLearners"
                        FROM star_counts sc
                        FULL OUTER JOIN badge_counts bc ON bc."domainId" = sc."domainId"
                        LEFT JOIN "product_domains" d ON d."id" = COALESCE(sc."domainId", bc."domainId")
                        ORDER BY COALESCE(sc."starAwards", 0) DESC, COALESCE(bc."badgeAwards", 0) DESC, d."name" ASC NULLS LAST
                        LIMIT 6
                    `
                )
            ),
            optionalValue([], () =>
                prisma.$queryRaw<Array<{
                    id: string
                    title: string
                    scheduledAt: Date | string | null
                    domainName: string | null
                    starAwards: bigint | number
                    badgeAwards: bigint | number
                    recognizedLearners: bigint | number
                }>>(
                    Prisma.sql`
                        WITH star_counts AS (
                            SELECT sa."eventId",
                                   COUNT(*)::bigint AS "starAwards",
                                   COUNT(DISTINCT sa."userId")::bigint AS "starUsers"
                            FROM "star_awards" sa
                            WHERE sa."eventId" IS NOT NULL
                            GROUP BY sa."eventId"
                        ),
                        badge_counts AS (
                            SELECT ba."eventId",
                                   COUNT(*)::bigint AS "badgeAwards",
                                   COUNT(DISTINCT ba."userId")::bigint AS "badgeUsers"
                            FROM "badge_awards" ba
                            WHERE ba."eventId" IS NOT NULL
                            GROUP BY ba."eventId"
                        )
                        SELECT e."id",
                               e."title",
                               e."scheduledAt",
                               d."name" AS "domainName",
                               COALESCE(sc."starAwards", 0)::bigint AS "starAwards",
                               COALESCE(bc."badgeAwards", 0)::bigint AS "badgeAwards",
                               GREATEST(COALESCE(sc."starUsers", 0), COALESCE(bc."badgeUsers", 0))::bigint AS "recognizedLearners"
                        FROM "learning_events" e
                        LEFT JOIN "product_domains" d ON d."id" = e."domainId"
                        LEFT JOIN star_counts sc ON sc."eventId" = e."id"
                        LEFT JOIN badge_counts bc ON bc."eventId" = e."id"
                        WHERE COALESCE(sc."starAwards", 0) > 0 OR COALESCE(bc."badgeAwards", 0) > 0
                        ORDER BY COALESCE(sc."starAwards", 0) DESC, COALESCE(bc."badgeAwards", 0) DESC, e."scheduledAt" DESC NULLS LAST
                        LIMIT 6
                    `
                )
            ),
            optionalValue([], () =>
                prisma.$queryRaw<Array<{
                    userId: string
                    name: string
                    email: string
                    stars: bigint | number
                    badges: bigint | number
                    lastRewardedAt: Date | string | null
                    recentSources: string[] | null
                }>>(
                    Prisma.sql`
                        WITH star_totals AS (
                            SELECT sa."userId",
                                   SUM(sa."stars")::bigint AS "stars",
                                   MAX(sa."awardedAt") AS "lastStarAwardedAt"
                            FROM "star_awards" sa
                            GROUP BY sa."userId"
                        ),
                        badge_totals AS (
                            SELECT ba."userId",
                                   COUNT(*)::bigint AS "badges",
                                   MAX(ba."awardedAt") AS "lastBadgeAwardedAt"
                            FROM "badge_awards" ba
                            GROUP BY ba."userId"
                        ),
                        recent_source_rows AS (
                            SELECT sa."userId",
                                   sa."awardedAt",
                                   COALESCE(ex."title", le."title", pd."name", sa."sourceType"::text) AS source,
                                   ROW_NUMBER() OVER (
                                       PARTITION BY sa."userId"
                                       ORDER BY sa."awardedAt" DESC
                                   ) AS rn
                            FROM "star_awards" sa
                            LEFT JOIN "exams" ex ON ex."id" = sa."examId"
                            LEFT JOIN "learning_events" le ON le."id" = sa."eventId"
                            LEFT JOIN "product_domains" pd ON pd."id" = COALESCE(sa."domainId", ex."productDomainId", le."domainId")
                        ),
                        recent_sources AS (
                            SELECT rsr."userId",
                                   ARRAY_AGG(rsr.source ORDER BY rsr."awardedAt" DESC) AS "recentSources"
                            FROM recent_source_rows rsr
                            WHERE rsr.rn <= 3
                            GROUP BY rsr."userId"
                        )
                        SELECT u."id" AS "userId",
                               u."name",
                               u."email",
                               COALESCE(st."stars", 0)::bigint AS "stars",
                               COALESCE(bt."badges", 0)::bigint AS "badges",
                               CASE
                                   WHEN st."lastStarAwardedAt" IS NULL AND bt."lastBadgeAwardedAt" IS NULL THEN NULL
                                   ELSE GREATEST(
                                       COALESCE(st."lastStarAwardedAt", TO_TIMESTAMP(0)),
                                       COALESCE(bt."lastBadgeAwardedAt", TO_TIMESTAMP(0))
                                   )
                               END AS "lastRewardedAt",
                               COALESCE(rs."recentSources", ARRAY[]::text[]) AS "recentSources"
                        FROM "users" u
                        LEFT JOIN star_totals st ON st."userId" = u."id"
                        LEFT JOIN badge_totals bt ON bt."userId" = u."id"
                        LEFT JOIN recent_sources rs ON rs."userId" = u."id"
                        WHERE COALESCE(st."stars", 0) > 0 OR COALESCE(bt."badges", 0) > 0
                        ORDER BY COALESCE(st."stars", 0) DESC,
                                 COALESCE(bt."badges", 0) DESC,
                                 "lastRewardedAt" DESC NULLS LAST,
                                 u."name" ASC
                        LIMIT 20
                    `
                )
            ),
            optionalValue([], () =>
                prisma.$queryRaw<Array<{
                    examId: string
                    title: string
                    certificateCount: bigint | number
                    learnerCount: bigint | number
                }>>(
                    Prisma.sql`
                        SELECT e."id" AS "examId",
                               e."title",
                               COUNT(c."id")::bigint AS "certificateCount",
                               COUNT(DISTINCT c."userId")::bigint AS "learnerCount"
                        FROM "certificates" c
                        INNER JOIN "exams" e ON e."id" = c."examId"
                        WHERE c."status" = 'ISSUED'
                          AND e."assessmentKind" = 'FORMAL'
                        GROUP BY e."id", e."title"
                        ORDER BY COUNT(c."id") DESC, e."title" ASC
                        LIMIT 6
                    `
                )
            ),
        ])

        const recognizedUsers = new Set<string>()
        achievementUsers.forEach((entry) => recognizedUsers.add(entry.userId))
        certificateUsers.forEach((entry) => recognizedUsers.add(entry.userId))
        badgeUsers.forEach((userId) => recognizedUsers.add(userId))
        starUsers.forEach((userId) => recognizedUsers.add(userId))

        const data = {
            generatedAt: new Date().toISOString(),
            analytics: {
                totalUsers: analytics.totalUsers,
                activeUsers: analytics.activeUsers,
                totalCourses: analytics.totalCourses,
                totalEnrollments: analytics.totalEnrollments,
                completionRate: analytics.completionRate,
                learnerRows: analytics.learnerProgress.length,
                recentActivityEntries: analytics.recentActivity.length,
            },
            exams: {
                totalExams,
                draftExams,
                pendingReviewExams,
                approvedExams,
                publishedExams,
                invitations: totalInvitations,
                attempts: totalAttempts,
                practiceExams,
                readinessExams,
                formalExams,
                performanceTrackedExams,
                starEnabledExams,
                examsMappedToDomain,
                questionsMappedToDomain,
                recentExams: recentExams.map((exam) => ({
                    id: exam.id,
                    title: exam.title,
                    status: exam.status,
                    publishedAt: exam.publishedAt,
                    updatedAt: exam.updatedAt,
                    allowReview: exam.allowReview,
                    maxAttempts: exam.maxAttempts,
                    questionCount: exam._count.questions,
                    invitationCount: exam._count.invitations,
                    attemptCount: exam._count.attempts,
                })),
            },
            rewards: {
                achievementTemplates,
                achievementAwards,
                certificateCount: issuedCertificates,
                formalCertificateCount: formalCertificates,
                badgeMilestones,
                badgeAwards,
                starAwards,
                certificateExams: certificateExams.map((row) => ({
                    examId: row.examId,
                    title: row.title,
                    certificateCount: Number(row.certificateCount),
                    learnerCount: Number(row.learnerCount),
                })),
                learnersWithRecognition: recognizedUsers.size,
                topLearners: topLearners.map((row) => ({
                    userId: row.userId,
                    name: row.name,
                    email: row.email,
                    stars: Number(row.stars),
                    badges: Number(row.badges),
                    lastRewardedAt: row.lastRewardedAt,
                    recentSources: row.recentSources ?? [],
                })),
            },
            trainingOps: {
                productDomains,
                activeProductDomains,
                learningSeries,
                activeLearningSeries,
                scheduledEvents,
                completedEvents,
                migrated: productDomains !== null,
                previewDomains,
                previewSeries,
                previewEvents,
                topRewardDomains: topRewardDomains.map((row) => ({
                    domainId: row.domainId,
                    domainName: row.domainName,
                    starAwards: Number(row.starAwards),
                    badgeAwards: Number(row.badgeAwards),
                    recognizedLearners: Number(row.recognizedLearners),
                })),
                rewardedEvents: rewardedEvents.map((row) => ({
                    id: row.id,
                    title: row.title,
                    scheduledAt: row.scheduledAt,
                    domainName: row.domainName,
                    starAwards: Number(row.starAwards),
                    badgeAwards: Number(row.badgeAwards),
                    recognizedLearners: Number(row.recognizedLearners),
                })),
            },
        }

        return NextResponse.json({
            success: true,
            data,
        })
    } catch (error) {
        console.error('Get training ops bridge error:', error)

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load training operations bridge data',
                },
            },
            { status: 500 }
        )
    }
})
