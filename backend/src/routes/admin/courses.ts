import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireRole } from '../../middleware/auth.js'
import { prisma } from '../../prisma.js'

const paramsSchema = z.object({
  courseId: z.string().uuid(),
})

export async function courseAdminRoutes(fastify: FastifyInstance) {
  // DELETE /api/admin/courses/:courseId
  fastify.delete('/courses/:courseId', { preHandler: [requireRole('ADMIN')] }, async (request, reply) => {
    const params = paramsSchema.parse(request.params)

    // 确认课程存在，不存在则视为幂等删除成功
    const course = await prisma.course.findUnique({ where: { id: params.courseId }, select: { id: true } })
    if (!course) {
      return reply.send({ success: true })
    }

    await request.services.cascadeService.deleteCourseCascade(params.courseId)
    return reply.send({ success: true })
  })
}
