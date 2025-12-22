import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireRole } from '../../middleware/auth.js'
import { prisma } from '../../prisma.js'

const paramsSchema = z.object({
  courseId: z.string().uuid(),
  chapterId: z.string().uuid(),
  lessonId: z.string().uuid(),
})

export async function lessonAdminRoutes(fastify: FastifyInstance) {
  // DELETE /api/admin/courses/:courseId/chapters/:chapterId/lessons/:lessonId
  fastify.delete('/courses/:courseId/chapters/:chapterId/lessons/:lessonId', { preHandler: [requireRole('ADMIN')] }, async (request, reply) => {
    const params = paramsSchema.parse(request.params)

    // 若 lesson 不存在，视为幂等删除成功
    const lesson = await prisma.lesson.findUnique({ where: { id: params.lessonId }, select: { id: true, chapterId: true } })
    if (!lesson) {
      return reply.send({ success: true })
    }

    // 校验章节归属
    const chapter = await prisma.chapter.findUnique({ where: { id: params.chapterId }, select: { id: true, courseId: true } })
    if (!chapter || chapter.courseId !== params.courseId || lesson.chapterId !== params.chapterId) {
      return reply.status(409).send({ success: false, error: 'HierarchyMismatch', message: 'Lesson does not belong to chapter/course' })
    }

    await request.services.cascadeService.deleteLessonCascade(params.lessonId)
    return reply.send({ success: true })
  })
}
