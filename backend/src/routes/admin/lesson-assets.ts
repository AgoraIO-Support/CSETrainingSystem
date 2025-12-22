import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireRole } from '../../middleware/auth.js'
import { prisma } from '../../prisma.js'
import { deleteKeys } from '../../lib/s3-utils.js'
import { appConfig } from '../../config/env.js'

const paramsSchema = z.object({
    courseId: z.string().uuid(),
    chapterId: z.string().uuid(),
    lessonId: z.string().uuid(),
})

const deleteParamsSchema = paramsSchema.extend({
    assetId: z.string().uuid(),
})

export async function lessonAssetRoutes(fastify: FastifyInstance) {
    fastify.get(
        '/courses/:courseId/chapters/:chapterId/lessons/:lessonId/assets',
        { preHandler: [requireRole('ADMIN')] },
        async (request, reply) => {
            const params = paramsSchema.parse(request.params)
            const valid = await validateHierarchy(params)
            if (!valid.ok) {
                return reply.status(409).send({
                    success: false,
                    error: 'HierarchyMismatch',
                    message: valid.message,
                })
            }

            const assets = await prisma.lessonAsset.findMany({
                where: { lessonId: params.lessonId },
                include: {
                    courseAsset: true,
                },
                orderBy: { createdAt: 'desc' },
            })

            return reply.send({
                success: true,
                data: assets.map(a => ({
                    id: a.courseAssetId,
                    title: a.courseAsset?.title ?? 'Untitled',
                    type: a.courseAsset?.type ?? 'DOCUMENT',
                    cloudfrontUrl: a.courseAsset?.cloudfrontUrl ?? a.courseAsset?.url ?? null,
                    url: a.courseAsset?.cloudfrontUrl ?? a.courseAsset?.url ?? null,
                    mimeType: a.courseAsset?.mimeType ?? a.courseAsset?.contentType ?? null,
                    sizeBytes: null,
                    updatedAt: a.courseAsset?.createdAt ?? a.createdAt,
                })),
            })
        }
    )

    fastify.delete(
        '/courses/:courseId/chapters/:chapterId/lessons/:lessonId/assets/:assetId',
        { preHandler: [requireRole('ADMIN')] },
        async (request, reply) => {
            const params = deleteParamsSchema.parse(request.params)
            const valid = await validateHierarchy(params)
            if (!valid.ok) {
                return reply.status(409).send({
                    success: false,
                    error: 'HierarchyMismatch',
                    message: valid.message,
                })
            }

            // 找到将要删除的 asset 的 s3Key
            const asset = await prisma.courseAsset.findUnique({ where: { id: params.assetId }, select: { id: true, s3Key: true, courseId: true } })

            // DB 事务：删除 lesson 关联与 asset（资产不复用前提）
            await prisma.$transaction(async (tx) => {
                await tx.lessonAsset.deleteMany({ where: { lessonId: params.lessonId, courseAssetId: params.assetId } })
                await tx.courseAsset.deleteMany({ where: { id: params.assetId } })
            })

            // 提交后删除 S3 对象
            if (asset?.s3Key) {
                await deleteKeys([asset.s3Key])
            }

            const assets = await prisma.lessonAsset.findMany({
                where: { lessonId: params.lessonId },
                include: { courseAsset: true },
                orderBy: { createdAt: 'desc' },
            })

            return reply.send({
                success: true,
                data: assets.map(a => ({
                    id: a.courseAssetId,
                    title: a.courseAsset?.title ?? 'Untitled',
                    type: a.courseAsset?.type ?? 'DOCUMENT',
                    cloudfrontUrl: a.courseAsset?.cloudfrontUrl ?? a.courseAsset?.url ?? null,
                    url: a.courseAsset?.cloudfrontUrl ?? a.courseAsset?.url ?? null,
                    mimeType: a.courseAsset?.mimeType ?? a.courseAsset?.contentType ?? null,
                    sizeBytes: null,
                    updatedAt: a.courseAsset?.createdAt ?? a.createdAt,
                })),
            })
        }
    )
}

async function validateHierarchy(params: { courseId: string; chapterId: string; lessonId: string; assetId?: string }) {
    const chapter = await prisma.chapter.findUnique({
        where: { id: params.chapterId },
        select: { id: true, courseId: true },
    })
    if (!chapter || chapter.courseId !== params.courseId) {
        return { ok: false, message: 'Chapter does not belong to course' }
    }

    const lesson = await prisma.lesson.findUnique({
        where: { id: params.lessonId },
        select: { id: true, chapterId: true },
    })
    if (!lesson || lesson.chapterId !== params.chapterId) {
        return { ok: false, message: 'Lesson does not belong to chapter/course' }
    }

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
