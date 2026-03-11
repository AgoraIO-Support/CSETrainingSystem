import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export interface AnalyticsSummary {
    totalUsers: number
    activeUsers: number
    totalCourses: number
    totalEnrollments: number
    completionRate: number
    learnerProgress: Array<{
        userId: string
        name: string
        email: string
        status: 'ACTIVE' | 'SUSPENDED' | 'DELETED'
        lastLoginAt: Date | null
        enrollmentCount: number
        completedCourses: number
        averageProgress: number
        courses: Array<{
            courseId: string
            title: string
            progress: number
            status: 'ACTIVE' | 'COMPLETED' | 'DROPPED'
            enrolledAt: Date
            lastAccessedAt: Date | null
            completedAt: Date | null
        }>
    }>
    recentActivity: Array<{
        id: string
        date: Date
        activeUsers: number
        newEnrollments: number
        completedCourses: number
        totalViews: number
        aiInteractions: number
        createdAt: Date
    }>
}

interface AnalyticsParams {
    startDate?: Date
    endDate?: Date
}

interface DailyAnalyticsRow {
    id: string
    date: Date
    activeUsers: number
    newEnrollments: number
    completedCourses: number
    totalViews: number
    aiInteractions: number
    createdAt: Date
}

const startOfDayUtc = (value: Date) => {
    const normalized = new Date(value)
    normalized.setUTCHours(0, 0, 0, 0)
    return normalized
}

const endOfDayUtc = (value: Date) => {
    const normalized = new Date(value)
    normalized.setUTCHours(23, 59, 59, 999)
    return normalized
}

const toUtcDateOnly = (value: Date) => startOfDayUtc(value).toISOString().slice(0, 10)

const resolveRange = ({ startDate, endDate }: AnalyticsParams) => {
    const resolvedEnd = endDate ? endOfDayUtc(endDate) : endOfDayUtc(new Date())
    const resolvedStart = startDate
        ? startOfDayUtc(startDate)
        : startOfDayUtc(new Date(resolvedEnd.getTime() - 13 * 24 * 60 * 60 * 1000))

    return {
        startDate: resolvedStart,
        endDate: resolvedEnd,
    }
}

const getRecentActivity = async ({ startDate, endDate }: Required<AnalyticsParams>) => {
    const startDateSql = toUtcDateOnly(startDate)
    const endDateSql = toUtcDateOnly(endDate)

    return prisma.$queryRaw<DailyAnalyticsRow[]>(Prisma.sql`
        WITH bounds AS (
            SELECT ${startDateSql}::date AS start_date, ${endDateSql}::date AS end_date
        ),
        days AS (
            SELECT generate_series(
                (SELECT start_date FROM bounds),
                (SELECT end_date FROM bounds),
                interval '1 day'
            )::date AS day
        ),
        enrollment_created AS (
            SELECT
                date_trunc('day', "enrolledAt")::date AS day,
                count(*)::int AS "newEnrollments"
            FROM enrollments, bounds
            WHERE "enrolledAt" >= bounds.start_date
              AND "enrolledAt" < bounds.end_date + interval '1 day'
            GROUP BY 1
        ),
        enrollment_completed AS (
            SELECT
                date_trunc('day', "completedAt")::date AS day,
                count(*)::int AS "completedCourses"
            FROM enrollments, bounds
            WHERE "completedAt" IS NOT NULL
              AND "completedAt" >= bounds.start_date
              AND "completedAt" < bounds.end_date + interval '1 day'
            GROUP BY 1
        ),
        lesson_views AS (
            SELECT
                date_trunc('day', "updatedAt")::date AS day,
                count(*)::int AS "totalViews"
            FROM lesson_progress, bounds
            WHERE "updatedAt" >= bounds.start_date
              AND "updatedAt" < bounds.end_date + interval '1 day'
            GROUP BY 1
        ),
        ai_usage AS (
            SELECT
                date_trunc('day', "createdAt")::date AS day,
                count(*)::int AS "aiInteractions"
            FROM ai_messages, bounds
            WHERE "createdAt" >= bounds.start_date
              AND "createdAt" < bounds.end_date + interval '1 day'
            GROUP BY 1
        ),
        active_user_events AS (
            SELECT date_trunc('day', "enrolledAt")::date AS day, "userId"
            FROM enrollments, bounds
            WHERE "enrolledAt" >= bounds.start_date
              AND "enrolledAt" < bounds.end_date + interval '1 day'
            UNION
            SELECT date_trunc('day', "completedAt")::date AS day, "userId"
            FROM enrollments, bounds
            WHERE "completedAt" IS NOT NULL
              AND "completedAt" >= bounds.start_date
              AND "completedAt" < bounds.end_date + interval '1 day'
            UNION
            SELECT date_trunc('day', "lastAccessedAt")::date AS day, "userId"
            FROM enrollments, bounds
            WHERE "lastAccessedAt" IS NOT NULL
              AND "lastAccessedAt" >= bounds.start_date
              AND "lastAccessedAt" < bounds.end_date + interval '1 day'
            UNION
            SELECT date_trunc('day', "updatedAt")::date AS day, "userId"
            FROM lesson_progress, bounds
            WHERE "updatedAt" >= bounds.start_date
              AND "updatedAt" < bounds.end_date + interval '1 day'
            UNION
            SELECT date_trunc('day', m."createdAt")::date AS day, c."userId"
            FROM ai_messages m
            INNER JOIN ai_conversations c ON c.id = m."conversationId", bounds
            WHERE m."createdAt" >= bounds.start_date
              AND m."createdAt" < bounds.end_date + interval '1 day'
            UNION
            SELECT date_trunc('day', "lastLoginAt")::date AS day, id AS "userId"
            FROM users, bounds
            WHERE "lastLoginAt" IS NOT NULL
              AND "lastLoginAt" >= bounds.start_date
              AND "lastLoginAt" < bounds.end_date + interval '1 day'
        ),
        active_users AS (
            SELECT day, count(DISTINCT "userId")::int AS "activeUsers"
            FROM active_user_events
            GROUP BY 1
        )
        SELECT
            concat('derived-', to_char(days.day, 'YYYYMMDD')) AS id,
            days.day::timestamp AS date,
            COALESCE(active_users."activeUsers", 0) AS "activeUsers",
            COALESCE(enrollment_created."newEnrollments", 0) AS "newEnrollments",
            COALESCE(enrollment_completed."completedCourses", 0) AS "completedCourses",
            COALESCE(lesson_views."totalViews", 0) AS "totalViews",
            COALESCE(ai_usage."aiInteractions", 0) AS "aiInteractions",
            days.day::timestamp AS "createdAt"
        FROM days
        LEFT JOIN active_users ON active_users.day = days.day
        LEFT JOIN enrollment_created ON enrollment_created.day = days.day
        LEFT JOIN enrollment_completed ON enrollment_completed.day = days.day
        LEFT JOIN lesson_views ON lesson_views.day = days.day
        LEFT JOIN ai_usage ON ai_usage.day = days.day
        ORDER BY days.day DESC
    `)
}

export class AnalyticsService {
    static async getSummary(params: AnalyticsParams = {}): Promise<AnalyticsSummary> {
        const range = resolveRange(params)

        const [
            totalUsers,
            activeUsers,
            totalCourses,
            totalEnrollments,
            completedEnrollments,
            learnerProgress,
            recentActivity,
        ] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { status: 'ACTIVE' } }),
            prisma.course.count(),
            prisma.enrollment.count(),
            prisma.enrollment.count({ where: { status: 'COMPLETED' } }),
            prisma.user.findMany({
                where: { role: 'USER' },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    status: true,
                    lastLoginAt: true,
                    enrollments: {
                        select: {
                            courseId: true,
                            progress: true,
                            status: true,
                            enrolledAt: true,
                            lastAccessedAt: true,
                            completedAt: true,
                            course: {
                                select: {
                                    title: true,
                                },
                            },
                        },
                        orderBy: [
                            { lastAccessedAt: 'desc' },
                            { enrolledAt: 'desc' },
                        ],
                    },
                },
                orderBy: [
                    { lastLoginAt: 'desc' },
                    { createdAt: 'desc' },
                ],
            }),
            getRecentActivity(range),
        ])

        const completionRate = totalEnrollments === 0 ? 0 : Number(((completedEnrollments / totalEnrollments) * 100).toFixed(1))

        return {
            totalUsers,
            activeUsers,
            totalCourses,
            totalEnrollments,
            completionRate,
            learnerProgress: learnerProgress.map((user) => {
                const enrollmentCount = user.enrollments.length
                const completedCourses = user.enrollments.filter((enrollment) => enrollment.status === 'COMPLETED').length
                const averageProgress =
                    enrollmentCount > 0
                        ? Number(
                              (
                                  user.enrollments.reduce((sum, enrollment) => sum + enrollment.progress, 0) /
                                  enrollmentCount
                              ).toFixed(1)
                          )
                        : 0

                return {
                    userId: user.id,
                    name: user.name,
                    email: user.email,
                    status: user.status,
                    lastLoginAt: user.lastLoginAt,
                    enrollmentCount,
                    completedCourses,
                    averageProgress,
                    courses: user.enrollments.map((enrollment) => ({
                        courseId: enrollment.courseId,
                        title: enrollment.course.title,
                        progress: Number(enrollment.progress.toFixed(1)),
                        status: enrollment.status,
                        enrolledAt: enrollment.enrolledAt,
                        lastAccessedAt: enrollment.lastAccessedAt,
                        completedAt: enrollment.completedAt,
                    })),
                }
            }),
            recentActivity,
        }
    }
}
