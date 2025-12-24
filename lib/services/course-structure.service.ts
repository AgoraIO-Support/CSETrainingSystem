import prisma from '@/lib/prisma'
import { LessonAssetType, LessonCompletionRule, LessonType } from '@prisma/client'
import { FileService } from '@/lib/services/file.service'
import { S3_ASSET_BASE_PREFIX } from '@/lib/aws-s3'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'

const joinPathSegments = (...segments: (string | undefined | null)[]) => {
    return segments
        .filter(Boolean)
        .map(segment => segment!.replace(/^\/+|\/+$/g, ''))
        .filter(segment => segment.length > 0)
        .join('/')
}

const extensionForContentType = (contentType: string): string => {
    const t = contentType.toLowerCase()
    if (t === 'video/mp4') return '.mp4'
    if (t === 'text/vtt') return '.vtt'
    if (t === 'application/pdf') return '.pdf'
    return ''
}

export class CourseStructureService {
    static async assertChapterAncestry(courseId: string, chapterId: string) {
        const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { id: true, courseId: true } })
        if (!chapter) throw new Error('CHAPTER_NOT_FOUND')
        if (chapter.courseId !== courseId) throw new Error('ANCESTRY_MISMATCH')
        return chapter
    }

    static async assertLessonAncestry(courseId: string, chapterId: string, lessonId: string) {
        const lesson = await prisma.lesson.findUnique({
            where: { id: lessonId },
            include: { chapter: { select: { id: true, courseId: true } } },
        })
        if (!lesson) throw new Error('LESSON_NOT_FOUND')
        if (lesson.chapter.id !== chapterId || lesson.chapter.courseId !== courseId) throw new Error('ANCESTRY_MISMATCH')
        return lesson
    }

    static async listLessons(chapterId: string) {
        return prisma.lesson.findMany({ where: { chapterId }, orderBy: { order: 'asc' }, include: { assets: { include: { courseAsset: true }, orderBy: { createdAt: 'asc' } } } })
    }

    static async listChapters(courseId: string) {
        return prisma.chapter.findMany({ where: { courseId }, orderBy: { order: 'asc' } })
    }
    static async createChapter(courseId: string, data: { title: string; description?: string | null; order?: number }) {
        const maxOrder = await prisma.chapter.aggregate({
            where: { courseId },
            _max: { order: true },
        })

        const order = data.order ?? ((maxOrder._max.order ?? 0) + 1)

        return prisma.chapter.create({
            data: {
                courseId,
                title: data.title,
                description: data.description,
                order,
            },
        })
    }

    static async updateChapter(chapterId: string, data: Partial<{ title: string; description?: string | null; order?: number }>) {
        return prisma.chapter.update({
            where: { id: chapterId },
            data,
        })
    }

    static async deleteChapter(chapterId: string) {
        return prisma.chapter.delete({ where: { id: chapterId } })
    }

    static async reorderChapters(courseId: string, chapterOrder: string[]) {
        const updates = chapterOrder.map((id, idx) =>
            prisma.chapter.update({
                where: { id },
                data: { order: idx + 1 },
            })
        )
        await prisma.$transaction(updates)
    }

    static async createLesson(chapterId: string, data: {
        title: string
        description?: string | null
        durationMinutes?: number | null
        lessonType?: LessonType | null
        learningObjectives?: string[]
        completionRule?: LessonCompletionRule | null
        order?: number
        courseAssetIds?: string[]
    }) {
        const maxOrder = await prisma.lesson.aggregate({
            where: { chapterId },
            _max: { order: true },
        })
        const order = data.order ?? ((maxOrder._max.order ?? 0) + 1)
        const durationSeconds = data.durationMinutes ? data.durationMinutes * 60 : 0

        // Validate assets belong to course
        let courseId: string | null = null
        if (data.courseAssetIds && data.courseAssetIds.length > 0) {
            const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { courseId: true } })
            if (!chapter) throw new Error('CHAPTER_NOT_FOUND')
            courseId = chapter.courseId
            const count = await prisma.courseAsset.count({
                where: { id: { in: data.courseAssetIds }, courseId: chapter.courseId },
            })
            if (count !== data.courseAssetIds.length) {
                throw new Error('ASSET_COURSE_MISMATCH')
            }
        }

        const lesson = await prisma.$transaction(async (tx) => {
            const created = await tx.lesson.create({
                data: {
                    chapterId,
                    title: data.title,
                    description: data.description,
                    durationMinutes: data.durationMinutes ?? null,
                    duration: durationSeconds,
                    lessonType: data.lessonType ?? null,
                    learningObjectives: data.learningObjectives ?? [],
                    completionRule: data.completionRule ?? 'VIEW_ASSETS',
                    order,
                },
            })

            if (data.courseAssetIds && data.courseAssetIds.length > 0) {
                await tx.lessonAsset.createMany({
                    data: data.courseAssetIds.map((courseAssetId: string) => ({
                        lessonId: created.id,
                        courseAssetId,
                    })),
                })
            }

            return created
        })

        return lesson
    }

    static async updateLesson(lessonId: string, data: Partial<{
        title: string
        description?: string | null
        durationMinutes?: number | null
        lessonType?: LessonType | null
        learningObjectives?: string[]
        completionRule?: LessonCompletionRule | null
        order?: number
        courseAssetIds?: string[]
    }>) {
        const { courseAssetIds, ...rest } = data as any
        const patch: any = { ...rest }
        if (data.durationMinutes !== undefined) {
            patch.durationMinutes = data.durationMinutes
            patch.duration = data.durationMinutes ? data.durationMinutes * 60 : 0
        }

        // Validate lesson and course ownership
        const lesson = await prisma.lesson.findUnique({
            where: { id: lessonId },
            include: { chapter: { select: { courseId: true } } },
        })
        if (!lesson) throw new Error('LESSON_NOT_FOUND')

        if (courseAssetIds && courseAssetIds.length > 0) {
            const count = await prisma.courseAsset.count({
                where: { id: { in: courseAssetIds }, courseId: lesson.chapter.courseId },
            })
            if (count !== courseAssetIds.length) {
                throw new Error('ASSET_COURSE_MISMATCH')
            }
        }

        const updated = await prisma.$transaction(async (tx) => {
            const l = await tx.lesson.update({
                where: { id: lessonId },
                data: patch,
            })

            if (courseAssetIds) {
                await tx.lessonAsset.deleteMany({ where: { lessonId } })
                if (courseAssetIds.length > 0) {
                    await tx.lessonAsset.createMany({
                        data: courseAssetIds.map((courseAssetId: string) => ({ lessonId, courseAssetId })),
                    })
                }
            }

            return l
        })

        const lessonWithAssets = await prisma.lesson.findUnique({
            where: { id: updated.id },
            include: {
                assets: {
                    include: { courseAsset: true },
                    orderBy: { createdAt: 'asc' },
                },
            },
        })

        return lessonWithAssets ?? updated
    }

    static async deleteLesson(lessonId: string) {
        return prisma.lesson.delete({ where: { id: lessonId } })
    }

    static async reorderLessons(chapterId: string, lessonOrder: string[]) {
        const updates = lessonOrder.map((id, idx) =>
            prisma.lesson.update({
                where: { id },
                data: { order: idx + 1 },
            })
        )
        await prisma.$transaction(updates)
    }

    static async replaceLessonAssets(lessonId: string, courseAssetIds: string[]) {
        // validate ownership: lesson -> chapter -> course; assets -> course
        const lesson = await prisma.lesson.findUnique({
            where: { id: lessonId },
            include: {
                chapter: { select: { courseId: true } },
            },
        })
        if (!lesson) throw new Error('LESSON_NOT_FOUND')

        if (courseAssetIds.length) {
            const count = await prisma.courseAsset.count({
                where: {
                    id: { in: courseAssetIds },
                    courseId: lesson.chapter.courseId,
                },
            })
            if (count !== courseAssetIds.length) {
                throw new Error('ASSET_COURSE_MISMATCH')
            }
        }

        const ops: any[] = [prisma.lessonAsset.deleteMany({ where: { lessonId } })]
        if (courseAssetIds.length) {
            ops.push(
                prisma.lessonAsset.createMany({
                    data: courseAssetIds.map((courseAssetId: string) => ({ lessonId, courseAssetId })),
                })
            )
        }
        await prisma.$transaction(ops)
    }

    static async removeLessonAsset(lessonId: string, courseAssetId: string) {
        await prisma.lessonAsset.deleteMany({
            where: { lessonId, courseAssetId },
        })
    }

    static async getLessonAssets(lessonId: string) {
        const assets = await prisma.lessonAsset.findMany({
            where: { lessonId },
            include: { courseAsset: true },
            orderBy: { createdAt: 'asc' },
        })
        return assets.map((a) => a.courseAsset)
    }

    static async getCourseContent(courseId: string, includeDraft = false) {
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            select: {
                id: true,
                status: true,
                chapters: {
                    orderBy: { order: 'asc' },
                    include: {
                        lessons: {
                            orderBy: { order: 'asc' },
                            include: {
                                assets: {
                                    include: {
                                        courseAsset: true,
                                    },
                                    orderBy: { createdAt: 'asc' },
                                },
                            },
                        },
                    },
                },
            },
        })

        if (!course) throw new Error('COURSE_NOT_FOUND')
        if (!includeDraft && course.status !== 'PUBLISHED') {
            throw new Error('COURSE_NOT_PUBLISHED')
        }

        return course
    }

    static async createUploadAndAttachLessonAsset(lessonId: string, params: {
        filename: string
        contentType: string
        type: LessonAssetType
    }) {
        const lesson = await prisma.lesson.findUnique({
            where: { id: lessonId },
            include: { chapter: { select: { courseId: true } } },
        })
        if (!lesson) throw new Error('LESSON_NOT_FOUND')

        // New key scheme (for CloudFront `/assets/*` behavior):
        //   <AWS_S3_ASSET_PREFIX>/<courseId>/<lessonId>/<assetId>.<ext>
        // `AWS_S3_ASSET_PREFIX` should be set to `assets` in production to match `/assets/*`.
        const assetId = uuidv4()
        const ext = (() => {
            const fromName = path.extname(params.filename || '').trim()
            if (fromName && fromName.length <= 10) return fromName
            return extensionForContentType(params.contentType)
        })()
        const key = joinPathSegments(S3_ASSET_BASE_PREFIX, lesson.chapter.courseId, lessonId, `${assetId}${ext}`)

        const upload = await FileService.generateAssetUploadUrl({
            filename: params.filename,
            contentType: params.contentType,
            assetType: this.mapAssetTypeFolder(params.type),
            lessonId,
            key,
        })

        const courseAsset = await prisma.courseAsset.create({
            data: {
                id: assetId,
                courseId: lesson.chapter.courseId,
                title: params.filename.replace(/\.[^/.]+$/, '') || params.filename,
                type: params.type,
                // Do not store expiring access URLs in DB. Always compute at read-time.
                url: upload.key,
                cloudfrontUrl: null,
                s3Key: upload.key,
                mimeType: params.contentType,
            },
        })

        await prisma.lessonAsset.create({
            data: { lessonId, courseAssetId: courseAsset.id },
        })

        return {
            upload,
            asset: {
                id: courseAsset.id,
                title: courseAsset.title,
                type: courseAsset.type,
                url: await FileService.getAssetAccessUrl(courseAsset.s3Key),
                mimeType: courseAsset.mimeType ?? courseAsset.contentType ?? undefined,
                s3Key: courseAsset.s3Key,
            },
        }
    }

    private static mapAssetTypeFolder(type: LessonAssetType): 'documents' | 'presentations' | 'videos' | 'other' {
        switch (type) {
            case 'VIDEO':
                return 'videos'
            case 'PRESENTATION':
                return 'presentations'
            case 'DOCUMENT':
            case 'TEXT':
                return 'documents'
            default:
                return 'other'
        }
    }
}
