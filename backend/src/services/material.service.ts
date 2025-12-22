import { LessonAssetType } from '@prisma/client'
import { prisma } from '../prisma.js'
import { nanoid } from 'nanoid'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { s3Client } from '../lib/aws.js'
import { appConfig } from '../config/env.js'
import { log, timeAsync } from '../logger.js'

export class MaterialService {
    async createMaterial(payload: {
        courseId: string
        title: string
        description?: string
        type: string
        s3Key: string
        cloudfrontUrl: string
        mimeType: string
        sizeBytes: number
        durationSeconds?: number
    }) {
        return prisma.courseAsset.create({
            data: {
                id: nanoid(16),
                courseId: payload.courseId,
                title: payload.title,
                description: payload.description,
                type: payload.type as LessonAssetType,
                url: payload.cloudfrontUrl,
                cloudfrontUrl: payload.cloudfrontUrl,
                s3Key: payload.s3Key,
                contentType: payload.mimeType,
                mimeType: payload.mimeType,
            },
        })
    }

    async deleteMaterial(assetId: string) {
        const asset = await prisma.courseAsset.findUnique({ where: { id: assetId } })

        if (!asset) {
            throw new Error('COURSE_ASSET_NOT_FOUND')
        }

        if (asset.s3Key) {
            log('S3', 'info', 'deleteObject', { bucket: appConfig.s3.bucket, key: asset.s3Key, assetId })
            await timeAsync(
                'S3',
                'deleteObject result',
                { bucket: appConfig.s3.bucket, key: asset.s3Key, assetId },
                () => s3Client.send(new DeleteObjectCommand({ Bucket: appConfig.s3.bucket, Key: asset.s3Key! })).then(() => undefined)
            )
        }

        await prisma.courseAsset.delete({ where: { id: assetId } })
    }
}
