import prisma from '@/lib/prisma'
import s3Client, { ASSET_S3_BUCKET_NAME, S3_ASSET_BASE_PREFIX } from '@/lib/aws-s3'
import { LessonAssetType, LessonCompletionRule, LessonType } from '@prisma/client'
import { FileService } from '@/lib/services/file.service'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import { HeadObjectCommand } from '@aws-sdk/client-s3'

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
    /**
     * Recalculate and persist total course duration (seconds) from all lessons under the course.
     */
    private static async recalcCourseDuration(courseId: string) {
        const { _sum } = await prisma.lesson.aggregate({
            where: { chapter: { courseId } },
            _sum: { duration: true },
        })

        await prisma.course.update({
            where: { id: courseId },
            data: { duration: _sum.duration ?? 0 },
        })
    }

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
        const chapter = await prisma.chapter.findUnique({
            where: { id: chapterId },
            select: { courseId: true },
        })
        if (!chapter) throw new Error('CHAPTER_NOT_FOUND')

        const deleted = await prisma.chapter.delete({ where: { id: chapterId } })
        await this.recalcCourseDuration(chapter.courseId)

        return deleted
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
        const chapter = await prisma.chapter.findUnique({
            where: { id: chapterId },
            select: { courseId: true },
        })
        if (!chapter) throw new Error('CHAPTER_NOT_FOUND')

        const maxOrder = await prisma.lesson.aggregate({
            where: { chapterId },
            _max: { order: true },
        })
        const order = data.order ?? ((maxOrder._max.order ?? 0) + 1)
        const durationSeconds = data.durationMinutes ? data.durationMinutes * 60 : 0

        // Validate assets belong to course
        let courseId: string | null = null
        if (data.courseAssetIds && data.courseAssetIds.length > 0) {
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

        await this.recalcCourseDuration(chapter.courseId)

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

        await this.recalcCourseDuration(lesson.chapter.courseId)

        return lessonWithAssets ?? updated
    }

    static async deleteLesson(lessonId: string) {
        const lesson = await prisma.lesson.findUnique({
            where: { id: lessonId },
            include: { chapter: { select: { courseId: true } } },
        })
        if (!lesson) throw new Error('LESSON_NOT_FOUND')

        const deleted = await prisma.lesson.delete({ where: { id: lessonId } })
        await this.recalcCourseDuration(lesson.chapter.courseId)

        return deleted
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

    static async prepareLessonAssetUpload(lessonId: string, preparedById: string, params: {
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
        const uploadSessionId = uuidv4()
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

        const uploadSession = await prisma.lessonAssetUploadSession.create({
            data: {
                id: uploadSessionId,
                lessonId,
                courseId: lesson.chapter.courseId,
                preparedById,
                filename: params.filename,
                contentType: params.contentType,
                assetType: params.type,
                s3Key: upload.key,
                courseAssetId: assetId,
                expiresAt: new Date(Date.now() + upload.expiresIn * 1000),
            },
        })

        return {
            upload,
            uploadSession: {
                id: uploadSession.id,
                lessonId: uploadSession.lessonId,
                courseId: uploadSession.courseId,
                courseAssetId: uploadSession.courseAssetId,
                s3Key: uploadSession.s3Key,
                status: uploadSession.status,
                expiresAt: uploadSession.expiresAt,
            },
        }
    }

    static async confirmLessonAssetUpload(lessonId: string, uploadSessionId: string) {
        const uploadSession = await prisma.lessonAssetUploadSession.findUnique({
            where: { id: uploadSessionId },
        })

        if (!uploadSession || uploadSession.lessonId !== lessonId) {
            throw new Error('LESSON_ASSET_UPLOAD_SESSION_NOT_FOUND')
        }

        if (uploadSession.status === 'ABORTED') {
            throw new Error('LESSON_ASSET_UPLOAD_ABORTED')
        }

        if (uploadSession.status === 'CONFIRMED') {
            const existingAsset = await prisma.courseAsset.findUnique({
                where: { id: uploadSession.courseAssetId },
            })

            if (!existingAsset) {
                throw new Error('COURSE_ASSET_NOT_FOUND')
            }

            return {
                uploadSession,
                asset: {
                    id: existingAsset.id,
                    title: existingAsset.title,
                    type: existingAsset.type,
                    url: await FileService.getAssetAccessUrl(existingAsset.s3Key),
                    mimeType: existingAsset.mimeType ?? existingAsset.contentType ?? undefined,
                    s3Key: existingAsset.s3Key,
                },
            }
        }

        let head
        try {
            head = await s3Client.send(
                new HeadObjectCommand({
                    Bucket: ASSET_S3_BUCKET_NAME,
                    Key: uploadSession.s3Key,
                })
            )
        } catch (error) {
            await prisma.lessonAssetUploadSession.update({
                where: { id: uploadSession.id },
                data: {
                    status: 'FAILED',
                    failedAt: new Date(),
                    errorMessage: error instanceof Error ? error.message : 'Failed to locate uploaded object in S3',
                },
            })
            throw new Error('LESSON_ASSET_UPLOAD_OBJECT_NOT_FOUND')
        }

        const mimeType = head.ContentType || uploadSession.contentType
        const sizeBytes = typeof head.ContentLength === 'number' ? head.ContentLength : null

        const asset = await prisma.$transaction(async (tx) => {
            const existingAsset = await tx.courseAsset.findUnique({
                where: { id: uploadSession.courseAssetId },
            })

            const courseAsset =
                existingAsset ??
                (await tx.courseAsset.create({
                    data: {
                        id: uploadSession.courseAssetId,
                        courseId: uploadSession.courseId,
                        title: uploadSession.filename.replace(/\.[^/.]+$/, '') || uploadSession.filename,
                        type: uploadSession.assetType,
                        url: uploadSession.s3Key,
                        cloudfrontUrl: null,
                        s3Key: uploadSession.s3Key,
                        contentType: mimeType,
                        mimeType,
                    },
                }))

            const existingBinding = await tx.lessonAsset.findFirst({
                where: {
                    lessonId,
                    courseAssetId: courseAsset.id,
                },
            })

            if (!existingBinding) {
                await tx.lessonAsset.create({
                    data: {
                        lessonId,
                        courseAssetId: courseAsset.id,
                    },
                })
            }

            await tx.lessonAssetUploadSession.update({
                where: { id: uploadSession.id },
                data: {
                    status: 'CONFIRMED',
                    confirmedAt: new Date(),
                    uploadedMimeType: mimeType,
                    uploadedSizeBytes: sizeBytes ?? undefined,
                    errorMessage: null,
                },
            })

            return courseAsset
        })

        return {
            uploadSession: {
                ...uploadSession,
                status: 'CONFIRMED' as const,
            },
            asset: {
                id: asset.id,
                title: asset.title,
                type: asset.type,
                url: await FileService.getAssetAccessUrl(asset.s3Key),
                mimeType: asset.mimeType ?? asset.contentType ?? undefined,
                s3Key: asset.s3Key,
            },
        }
    }

    static async abortLessonAssetUpload(lessonId: string, uploadSessionId: string, reason?: string | null) {
        const uploadSession = await prisma.lessonAssetUploadSession.findUnique({
            where: { id: uploadSessionId },
        })

        if (!uploadSession || uploadSession.lessonId !== lessonId) {
            throw new Error('LESSON_ASSET_UPLOAD_SESSION_NOT_FOUND')
        }

        if (uploadSession.status === 'CONFIRMED') {
            throw new Error('LESSON_ASSET_UPLOAD_ALREADY_CONFIRMED')
        }

        await prisma.lessonAssetUploadSession.update({
            where: { id: uploadSession.id },
            data: {
                status: 'ABORTED',
                abortedAt: new Date(),
                errorMessage: reason?.trim() || uploadSession.errorMessage || null,
            },
        })

        return {
            id: uploadSession.id,
            status: 'ABORTED' as const,
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
