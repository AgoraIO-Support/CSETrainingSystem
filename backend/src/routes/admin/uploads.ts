import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { requireRole } from '../../middleware/auth.js'
import { appConfig } from '../../config/env.js'
import { s3Client } from '../../lib/aws.js'
import { randomUUID } from 'crypto'
import { prisma } from '../../prisma.js'
import { LessonAssetType } from '@prisma/client'
import { log, timeAsync } from '../../logger.js'

const presignBody = z.object({
    courseId: z.string().uuid(),
    chapterId: z.string().uuid(),
    lessonId: z.string().uuid(),
    filename: z.string().min(1),
    contentType: z.string().min(1),
    assetType: z.string().default('DOCUMENT'),
})

export async function presignUploadRoutes(fastify: FastifyInstance) {
    fastify.post('/', { preHandler: [requireRole('ADMIN')] }, async (request, reply) => {
        const body = presignBody.parse(request.body)
        const safeName = body.filename.replace(/[^\w.-]/g, '_')
        const key = `${appConfig.s3.uploadPrefix}/${body.courseId}/${body.chapterId}/${body.lessonId}/${safeName}`
        const command = new PutObjectCommand({
            Bucket: appConfig.s3.bucket,
            Key: key,
            ContentType: body.contentType,
        })
        const uploadUrl = await timeAsync(
            'S3',
            'presign PutObject',
            { bucket: appConfig.s3.bucket, key, contentType: body.contentType, expiresIn: 60 * 30 },
            () => getSignedUrl(s3Client, command, { expiresIn: 60 * 30 })
        )

        const asset = await prisma.courseAsset.create({
            data: {
                courseId: body.courseId,
                title: safeName,
                description: null,
                type: (body.assetType as LessonAssetType) || 'DOCUMENT',
                url: `https://${appConfig.cloudfront.domain}/${key}`,
                cloudfrontUrl: `https://${appConfig.cloudfront.domain}/${key}`,
                s3Key: key,
                contentType: body.contentType,
                mimeType: body.contentType,
            },
            select: {
                id: true,
                title: true,
                type: true,
                cloudfrontUrl: true,
                url: true,
                s3Key: true,
                mimeType: true,
                contentType: true,
            },
        })

        log('S3', 'info', 'presign response', {
            assetId: asset.id,
            key,
            cloudfrontUrl: `https://${appConfig.cloudfront.domain}/${key}`,
        })

        return reply.send({
            success: true,
            data: {
                uploadUrl,
                key,
                cloudfrontUrl: `https://${appConfig.cloudfront.domain}/${key}`,
                assetId: asset.id,
                asset,
                expiresInSeconds: 1800,
            },
        })
    })
}
