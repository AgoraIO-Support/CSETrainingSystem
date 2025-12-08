import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { requireRole } from '../../middleware/auth.js'
import { appConfig } from '../../config/env.js'
import { s3Client } from '../../lib/aws.js'
import { randomUUID } from 'crypto'

const presignBody = z.object({
    courseId: z.string().uuid(),
    filename: z.string().min(1),
    contentType: z.string().min(1),
    assetType: z.string().default('DOCUMENT'),
})

export async function presignUploadRoutes(fastify: FastifyInstance) {
    fastify.post('/', { preHandler: [requireRole('ADMIN')] }, async (request, reply) => {
        const body = presignBody.parse(request.body)
        const safeName = body.filename.replace(/[^\w.-]/g, '_')
        const key = `${appConfig.s3.uploadPrefix}/${body.courseId}/${randomUUID()}-${safeName}`
        const command = new PutObjectCommand({
            Bucket: appConfig.s3.bucket,
            Key: key,
            ContentType: body.contentType,
        })
        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 * 30 })
        return reply.send({
            success: true,
            data: {
                uploadUrl,
                key,
                cloudfrontUrl: `https://${appConfig.cloudfront.domain}/${key}`,
                expiresInSeconds: 1800,
            },
        })
    })
}
