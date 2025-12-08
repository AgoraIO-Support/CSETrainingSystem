import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export interface AnalyticsSummary {
    totalUsers: number
    activeUsers: number
    totalCourses: number
    totalEnrollments: number
    completionRate: number
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

export class AnalyticsService {
    static async getSummary(params: AnalyticsParams = {}): Promise<AnalyticsSummary> {
        const where: Prisma.SystemAnalyticsWhereInput = {}

        if (params.startDate || params.endDate) {
            where.date = {}
            if (params.startDate) {
                where.date.gte = params.startDate
            }
            if (params.endDate) {
                where.date.lte = params.endDate
            }
        }

        const [totalUsers, activeUsers, totalCourses, totalEnrollments, completedEnrollments, recentActivity] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { status: 'ACTIVE' } }),
            prisma.course.count(),
            prisma.enrollment.count(),
            prisma.enrollment.count({ where: { status: 'COMPLETED' } }),
            prisma.systemAnalytics.findMany({
                where,
                orderBy: { date: 'desc' },
                take: 14,
            }),
        ])

        const completionRate = totalEnrollments === 0 ? 0 : Number(((completedEnrollments / totalEnrollments) * 100).toFixed(1))

        return {
            totalUsers,
            activeUsers,
            totalCourses,
            totalEnrollments,
            completionRate,
            recentActivity,
        }
    }
}
