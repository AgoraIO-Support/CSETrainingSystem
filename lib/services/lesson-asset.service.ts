import prisma from '@/lib/prisma'
import { LessonAssetType } from '@prisma/client'

export class LessonAssetService {
    static async listAssets(lessonId: string) {
        return prisma.lessonAsset.findMany({
            where: { lessonId },
            orderBy: { createdAt: 'desc' },
        })
    }

    static async addAsset(lessonId: string, courseAssetId: string) {
        const lesson = await prisma.lesson.findUnique({
            where: { id: lessonId },
            select: { id: true },
        })

        if (!lesson) {
            throw new Error('LESSON_NOT_FOUND')
        }

        return prisma.lessonAsset.create({
            data: {
                lessonId,
                courseAssetId,
            },
        })
    }

    static async deleteAsset(assetId: string) {
        return prisma.lessonAsset.delete({
            where: { id: assetId },
        })
    }
}
