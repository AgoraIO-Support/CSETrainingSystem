import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireRole } from '../../middleware/auth.js'
import { prisma } from '../../prisma.js'

const paramsSchema = z.object({
  courseId: z.string().uuid(),
  chapterId: z.string().uuid(),
})

export async function chapterAdminRoutes(fastify: FastifyInstance) {
  // DELETE /api/admin/courses/:courseId/chapters/:chapterId
  fastify.delete('/courses/:courseId/chapters/:chapterId', { preHandler: [requireRole('ADMIN')] }, async (request, reply) => {
    const params = paramsSchema.parse(request.params)

    // 祖先校验（课程-章节关系）
    const chapter = await prisma.chapter.findUnique({ where: { id: params.chapterId }, select: { id: true, courseId: true } })
    // 如果章节不存在，视为幂等删除成功
    if (!chapter) {
      return reply.send({ success: true })
    }
    if (chapter.courseId !== params.courseId) {
      return reply.status(409).send({ success: false, error: 'HierarchyMismatch', message: 'Chapter does not belong to course' })
    }

    try {
      await request.services.cascadeService.deleteChapterCascade(params.chapterId)
      return reply.send({ success: true })
    } catch (error) {
      request.log.error({ error }, 'Delete chapter cascade failed')
      const message = error instanceof Error ? error.message : String(error)
      if (message.startsWith('S3_CLEANUP_FAILED')) {
        return reply.status(502).send({
          success: false,
          error: { code: 'S3_CLEANUP_FAILED', message },
        })
      }
      return reply.status(500).send({
        success: false,
        error: { code: 'SYSTEM_001', message: 'Failed to delete chapter' },
      })
    }
  })
}
