import prisma from '@/lib/prisma'
import { LessonAssetType } from '@prisma/client'
import { FileService } from '@/lib/services/file.service'

export class CourseAssetService {
    static async listAssets(courseId: string) {
        return prisma.courseAsset.findMany({
            where: { courseId },
            orderBy: { createdAt: 'desc' },
        })
    }

    static async addAsset(courseId: string, data: {
        title: string
        description?: string
        url: string
        s3Key: string
        contentType?: string
        type: LessonAssetType
    }) {
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            select: { id: true },
        })

        if (!course) {
            throw new Error('COURSE_NOT_FOUND')
        }

        return prisma.courseAsset.create({
            data: {
                courseId,
                ...data,
            },
        })
    }

    static async deleteAsset(assetId: string) {
        const asset = await prisma.courseAsset.findUnique({
            where: { id: assetId },
            select: { s3Key: true },
        })

        if (!asset) {
            throw new Error('COURSE_ASSET_NOT_FOUND')
        }

        if (asset.s3Key) {
            try {
                await FileService.deleteFile(asset.s3Key)
            } catch (error) {
                console.error('Failed to delete course asset file from S3:', error)
                throw new Error('COURSE_ASSET_FILE_DELETE_FAILED')
            }
        }

        await prisma.courseAsset.delete({
            where: { id: assetId },
        })
    }
}
