import { prisma } from '../prisma.js'

export class EnrollmentService {
    async isUserEnrolled(userId: string, courseId: string): Promise<boolean> {
        const enrollment = await prisma.enrollment.findUnique({
            where: {
                userId_courseId: {
                    userId,
                    courseId,
                },
            },
        })
        return Boolean(enrollment)
    }
}
