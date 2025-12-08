import prisma from '@/lib/prisma'
import { LessonAssetType } from '@prisma/client'

export class LessonAssetService {
    static async listAssets(lessonId: string) {
        return prisma.lessonAsset.findMany({
            where: { lessonId },
            orderBy: { createdAt: 'desc' },
        })
    }

    static async addAsset(lessonId: string, data: {
        title: string
        description?: string
        url: string
        s3Key: string
        contentType?: string
        type: LessonAssetType
    }) {
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
                ...data,
            },
        })
    }

    static async deleteAsset(assetId: string) {
        return prisma.lessonAsset.delete({
            where: { id: assetId },
        })
    }
}
