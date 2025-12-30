import prisma from '@/lib/prisma'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function isWithinDays(date: Date | null | undefined, days: number) {
    if (!date) return false
    const threshold = Date.now() - days * MS_PER_DAY
    return date.getTime() >= threshold
}

export class CourseAnalyticsService {
    static async getCourseAnalytics(courseId: string) {
        const enrollments = await prisma.enrollment.findMany({
            where: { courseId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        avatar: true,
                        department: true,
                        title: true,
                    },
                },
            },
            orderBy: [
                { enrolledAt: 'desc' },
            ],
        })

        const enrolledUsers = enrollments.map(enrollment => ({
            user: enrollment.user,
            status: enrollment.status,
            progress: enrollment.progress,
            enrolledAt: enrollment.enrolledAt,
            lastAccessedAt: enrollment.lastAccessedAt,
            completedAt: enrollment.completedAt,
        }))

        const d7 = enrollments.filter(e => isWithinDays(e.lastAccessedAt, 7)).length
        const d14 = enrollments.filter(e => isWithinDays(e.lastAccessedAt, 14)).length
        const d30 = enrollments.filter(e => isWithinDays(e.lastAccessedAt, 30)).length

        const total = enrollments.length
        const completedEnrollments = enrollments.filter(e => e.status === 'COMPLETED' && e.completedAt)
        const completed = completedEnrollments.length

        const completionRate = total === 0 ? 0 : Number(((completed / total) * 100).toFixed(1))

        let averageCompletionTimeSeconds: number | null = null
        if (completedEnrollments.length > 0) {
            const totalSeconds = completedEnrollments.reduce((sum, enrollment) => {
                const diffMs = (enrollment.completedAt as Date).getTime() - enrollment.enrolledAt.getTime()
                return sum + Math.max(0, Math.floor(diffMs / 1000))
            }, 0)
            averageCompletionTimeSeconds = Math.round(totalSeconds / completedEnrollments.length)
        }

        return {
            courseId,
            enrolledUsers,
            activeLearners: { d7, d14, d30 },
            completionRate,
            averageCompletionTimeSeconds,
        }
    }
}

