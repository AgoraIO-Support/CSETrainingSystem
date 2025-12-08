import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireRole } from '../../middleware/auth.js'

const createSchema = z.object({
    courseId: z.string().uuid(),
    title: z.string().min(1),
    description: z.string().optional(),
    type: z.enum(['VIDEO', 'DOCUMENT', 'IMAGE', 'AUDIO', 'OTHER']),
    s3Key: z.string().min(1),
    cloudfrontUrl: z.string().url(),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().positive(),
    durationSeconds: z.number().int().positive().optional(),
})

export async function materialRoutes(fastify: FastifyInstance) {
    fastify.post('/', { preHandler: [requireRole('ADMIN')] }, async (request, reply) => {
        const payload = createSchema.parse(request.body)
        const material = await request.services.materialService.createMaterial(payload)
        return reply.send({ success: true, data: material })
    })

    fastify.delete('/:assetId', { preHandler: [requireRole('ADMIN')] }, async (request, reply) => {
        const params = z.object({ assetId: z.string().min(1) }).parse(request.params)

        try {
            await request.services.materialService.deleteMaterial(params.assetId)
            return reply.send({ success: true })
        } catch (error) {
            if (error instanceof Error && error.message === 'COURSE_ASSET_NOT_FOUND') {
                return reply.status(404).send({ success: false, error: 'Asset not found' })
            }
            request.log.error({ error }, 'Failed to delete course asset')
            return reply.status(500).send({ success: false, error: 'Failed to delete asset' })
        }
    })
}
