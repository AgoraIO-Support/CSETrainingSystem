import { NextResponse } from 'next/server'
import { CourseStatus } from '@prisma/client'
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/auth-middleware'
import { FileService } from '@/lib/services/file.service'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

type RouteContext = {
    params: Promise<{ id: string }>
}

type DownloadItem = {
    id: string
    title: string
    filename: string
    kind: 'COURSE_ASSET' | 'TRANSCRIPT' | 'KNOWLEDGE_XML' | 'WEB_PACKAGE_FILE'
    type: string
    url: string
    mimeType: string | null
    sizeBytes: number | null
    chapterId: string | null
    chapterTitle: string | null
    lessonId: string | null
    lessonTitle: string | null
    assetId: string | null
    path: string | null
}

const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const basename = (path: string) => path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || path

const dirname = (path: string) => {
    const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
    parts.pop()
    return parts.join('/')
}

const inferMimeType = (filename: string, fallback?: string | null) => {
    if (fallback) return fallback
    const extension = filename.split('.').pop()?.toLowerCase()
    const byExtension: Record<string, string> = {
        vtt: 'text/vtt',
        xml: 'application/xml',
        html: 'text/html',
        htm: 'text/html',
        js: 'text/javascript',
        css: 'text/css',
        json: 'application/json',
        mp3: 'audio/mpeg',
        mp4: 'video/mp4',
        mov: 'video/quicktime',
        pdf: 'application/pdf',
        ppt: 'application/vnd.ms-powerpoint',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        txt: 'text/plain',
        md: 'text/markdown',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        svg: 'image/svg+xml',
    }
    return extension ? byExtension[extension] ?? 'application/octet-stream' : 'application/octet-stream'
}

const canDownloadCourse = async (user: { id: string; role: 'USER' | 'SME' | 'ADMIN' }, course: { id: string; status: CourseStatus }) => {
    if (user.role === 'ADMIN') return true

    if (user.role === 'SME') {
        if (await TrainingOpsService.canAccessScopedCourse(user, course.id)) return true
    }

    if (course.status !== 'PUBLISHED') return false

    const enrollment = await prisma.enrollment.findUnique({
        where: {
            userId_courseId: {
                userId: user.id,
                courseId: course.id,
            },
        },
        select: { id: true },
    })
    return Boolean(enrollment)
}

export const GET = withAuth(async (_req, user, context: RouteContext) => {
    try {
        const { id } = await context.params
        const course = await prisma.course.findFirst({
            where: isUuid(id) ? { id } : { OR: [{ id }, { slug: id }] },
            select: {
                id: true,
                title: true,
                status: true,
                chapters: {
                    orderBy: { order: 'asc' },
                    select: {
                        id: true,
                        title: true,
                        lessons: {
                            orderBy: { order: 'asc' },
                            select: {
                                id: true,
                                title: true,
                                assets: {
                                    orderBy: { createdAt: 'asc' },
                                    select: {
                                        courseAsset: {
                                            select: {
                                                id: true,
                                                title: true,
                                                type: true,
                                                s3Key: true,
                                                contentType: true,
                                                mimeType: true,
                                            },
                                        },
                                    },
                                },
                                transcripts: {
                                    where: {
                                        isActive: true,
                                        archivedAt: null,
                                    },
                                    orderBy: [{ isDefaultSubtitle: 'desc' }, { isPrimaryForAI: 'desc' }, { createdAt: 'asc' }],
                                    select: {
                                        id: true,
                                        filename: true,
                                        s3Key: true,
                                        language: true,
                                        label: true,
                                        isDefaultSubtitle: true,
                                        isPrimaryForAI: true,
                                    },
                                },
                                knowledgeContext: {
                                    select: {
                                        id: true,
                                        s3Key: true,
                                        status: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        })

        if (!course) {
            return NextResponse.json(
                { success: false, error: { code: 'COURSE_NOT_FOUND', message: 'Course not found' } },
                { status: 404 }
            )
        }

        if (!(await canDownloadCourse(user, course))) {
            return NextResponse.json(
                { success: false, error: { code: 'COURSE_DOWNLOAD_FORBIDDEN', message: 'You do not have access to download this course.' } },
                { status: 403 }
            )
        }

        const items: DownloadItem[] = []
        const seenCourseAssets = new Set<string>()
        const seenKeys = new Set<string>()

        const addKeyedItem = async (item: Omit<DownloadItem, 'url'> & { s3Key: string }) => {
            const normalizedKey = item.s3Key.replace(/^\/+/, '')
            if (!normalizedKey || seenKeys.has(normalizedKey)) return
            seenKeys.add(normalizedKey)
            const { s3Key, ...rest } = item
            items.push({
                ...rest,
                url: await FileService.getAssetDownloadUrl(normalizedKey, item.filename),
            })
        }

        for (const chapter of course.chapters) {
            for (const lesson of chapter.lessons) {
                for (const binding of lesson.assets) {
                    const asset = binding.courseAsset
                    if (seenCourseAssets.has(asset.id)) continue
                    seenCourseAssets.add(asset.id)

                    if (asset.type === 'WEB_PACKAGE') {
                        const prefix = dirname(asset.s3Key)
                        const webFiles = await FileService.listFilesByPrefix(prefix)
                        for (const file of webFiles) {
                            const relativePath = file.key.slice(prefix.length).replace(/^\/+/, '')
                            const fileName = basename(relativePath)
                            await addKeyedItem({
                                id: `web-package:${asset.id}:${relativePath}`,
                                title: `${asset.title} / ${relativePath}`,
                                filename: fileName,
                                kind: 'WEB_PACKAGE_FILE',
                                type: 'WEB_PACKAGE',
                                mimeType: inferMimeType(fileName),
                                sizeBytes: file.size,
                                chapterId: chapter.id,
                                chapterTitle: chapter.title,
                                lessonId: lesson.id,
                                lessonTitle: lesson.title,
                                assetId: asset.id,
                                path: relativePath,
                                s3Key: file.key,
                            })
                        }
                        continue
                    }

                    await addKeyedItem({
                        id: `asset:${asset.id}`,
                        title: asset.title,
                        filename: basename(asset.s3Key) || asset.title,
                        kind: 'COURSE_ASSET',
                        type: asset.type,
                        mimeType: inferMimeType(asset.s3Key, asset.mimeType ?? asset.contentType),
                        sizeBytes: null,
                        chapterId: chapter.id,
                        chapterTitle: chapter.title,
                        lessonId: lesson.id,
                        lessonTitle: lesson.title,
                        assetId: asset.id,
                        path: null,
                        s3Key: asset.s3Key,
                    })
                }

                for (const transcript of lesson.transcripts) {
                    const label = transcript.label || transcript.language.toUpperCase()
                    await addKeyedItem({
                        id: `transcript:${transcript.id}`,
                        title: `${lesson.title} transcript (${label})`,
                        filename: transcript.filename || `${lesson.title}-${transcript.language}.vtt`,
                        kind: 'TRANSCRIPT',
                        type: 'VTT',
                        mimeType: 'text/vtt',
                        sizeBytes: null,
                        chapterId: chapter.id,
                        chapterTitle: chapter.title,
                        lessonId: lesson.id,
                        lessonTitle: lesson.title,
                        assetId: null,
                        path: null,
                        s3Key: transcript.s3Key,
                    })
                }

                if (lesson.knowledgeContext?.status === 'READY') {
                    await addKeyedItem({
                        id: `knowledge:${lesson.knowledgeContext.id}`,
                        title: `${lesson.title} knowledge XML`,
                        filename: `${lesson.title}-knowledge.xml`,
                        kind: 'KNOWLEDGE_XML',
                        type: 'XML',
                        mimeType: 'application/xml',
                        sizeBytes: null,
                        chapterId: chapter.id,
                        chapterTitle: chapter.title,
                        lessonId: lesson.id,
                        lessonTitle: lesson.title,
                        assetId: null,
                        path: null,
                        s3Key: lesson.knowledgeContext.s3Key,
                    })
                }
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                course: {
                    id: course.id,
                    title: course.title,
                },
                items,
            },
        })
    } catch (error) {
        console.error('Get course downloads error:', error)
        return NextResponse.json(
            { success: false, error: { code: 'COURSE_DOWNLOADS_FAILED', message: 'Failed to load course downloads' } },
            { status: 500 }
        )
    }
})
