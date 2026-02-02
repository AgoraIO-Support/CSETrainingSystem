import prisma from '@/lib/prisma'
import { LessonAssetType } from '@prisma/client'
import { FileService } from '@/lib/services/file.service'
import { ASSET_S3_BUCKET_NAME } from '@/lib/aws-s3'
import { v4 as uuidv4 } from 'uuid'
import { log } from '@/lib/logger'

export class MaterialService {
    /**
     * Create a new course asset (material).
     */
    static async createMaterial(payload: {
        courseId: string
        title: string
        description?: string
        type: LessonAssetType
        s3Key: string
        cloudfrontUrl: string
        mimeType: string
        sizeBytes?: number
        durationSeconds?: number
    }) {
        return prisma.courseAsset.create({
            data: {
                id: uuidv4(),
                courseId: payload.courseId,
                title: payload.title,
                description: payload.description,
                type: payload.type,
                url: payload.cloudfrontUrl,
                cloudfrontUrl: payload.cloudfrontUrl,
                s3Key: payload.s3Key,
                contentType: payload.mimeType,
                mimeType: payload.mimeType,
            },
        })
    }

    /**
     * Delete a course asset and its S3 file.
     * Throws 'COURSE_ASSET_NOT_FOUND' if asset doesn't exist.
     */
    static async deleteMaterial(assetId: string): Promise<void> {
        const asset = await prisma.courseAsset.findUnique({ where: { id: assetId } })

        if (!asset) {
            throw new Error('COURSE_ASSET_NOT_FOUND')
        }

        // Delete from S3 first
        if (asset.s3Key) {
            log('S3', 'info', 'deleteObject', { bucket: ASSET_S3_BUCKET_NAME, key: asset.s3Key, assetId })
            await FileService.deleteFile(asset.s3Key, ASSET_S3_BUCKET_NAME)
        }

        // Delete from database
        await prisma.courseAsset.delete({ where: { id: assetId } })
    }

    /**
     * Get all assets for a lesson.
     */
    static async getLessonAssets(lessonId: string) {
        const assets = await prisma.lessonAsset.findMany({
            where: { lessonId },
            include: { courseAsset: true },
            orderBy: { createdAt: 'desc' },
        })

        return assets.map(a => ({
            id: a.courseAssetId,
            title: a.courseAsset?.title ?? 'Untitled',
            type: a.courseAsset?.type ?? 'DOCUMENT',
            cloudfrontUrl: a.courseAsset?.cloudfrontUrl ?? a.courseAsset?.url ?? null,
            url: a.courseAsset?.cloudfrontUrl ?? a.courseAsset?.url ?? null,
            mimeType: a.courseAsset?.mimeType ?? a.courseAsset?.contentType ?? null,
            s3Key: a.courseAsset?.s3Key ?? null,
            sizeBytes: null,
            updatedAt: a.courseAsset?.createdAt ?? a.createdAt,
        }))
    }

    /**
     * Delete a lesson asset binding and its course asset.
     * Returns the updated list of lesson assets.
     */
    static async deleteLessonAsset(lessonId: string, assetId: string): Promise<ReturnType<typeof this.getLessonAssets>> {
        // Find the asset to get its S3 key
        const asset = await prisma.courseAsset.findUnique({
            where: { id: assetId },
            select: { id: true, s3Key: true, courseId: true },
        })

        // Delete lesson asset binding and course asset in transaction
        await prisma.$transaction(async (tx) => {
            await tx.lessonAsset.deleteMany({ where: { lessonId, courseAssetId: assetId } })
            await tx.courseAsset.deleteMany({ where: { id: assetId } })
        })

        // Delete from S3 after transaction commits
        if (asset?.s3Key) {
            try {
                await FileService.deleteFile(asset.s3Key, ASSET_S3_BUCKET_NAME)
            } catch (err) {
                // Log but don't fail - DB records are already deleted
                log('S3', 'error', 'Failed to delete S3 object after lesson asset deletion', {
                    assetId,
                    s3Key: asset.s3Key,
                    error: err instanceof Error ? err.message : String(err),
                })
            }
        }

        // Return updated asset list
        return this.getLessonAssets(lessonId)
    }

    /**
     * Validate that a hierarchy is correct: course -> chapter -> lesson -> asset
     */
    static async validateHierarchy(params: {
        courseId: string
        chapterId: string
        lessonId: string
        assetId?: string
    }): Promise<{ ok: boolean; message: string }> {
        // Validate chapter belongs to course
        const chapter = await prisma.chapter.findUnique({
            where: { id: params.chapterId },
            select: { id: true, courseId: true },
        })
        if (!chapter || chapter.courseId !== params.courseId) {
            return { ok: false, message: 'Chapter does not belong to course' }
        }

        // Validate lesson belongs to chapter
        const lesson = await prisma.lesson.findUnique({
            where: { id: params.lessonId },
            select: { id: true, chapterId: true },
        })
        if (!lesson || lesson.chapterId !== params.chapterId) {
            return { ok: false, message: 'Lesson does not belong to chapter/course' }
        }

        // Validate asset belongs to course (if assetId provided)
        if (params.assetId) {
            const asset = await prisma.courseAsset.findUnique({
                where: { id: params.assetId },
                select: { id: true, courseId: true },
            })
            if (!asset || asset.courseId !== params.courseId) {
                return { ok: false, message: 'Asset does not belong to course' }
            }
        }

        return { ok: true, message: 'ok' }
    }
}
