import prisma from '@/lib/prisma'
import { FileService } from '@/lib/services/file.service'
import s3Client, { S3_BUCKET_NAME, S3_ASSET_BASE_PREFIX, ASSET_S3_BUCKET_NAME } from '@/lib/aws-s3'
import { ListObjectsV2Command, DeleteObjectsCommand, _Object, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3'
import { log, timeAsync } from '@/lib/logger'

type DeleteOpts = { bestEffort?: boolean }

/**
 * Delete all S3 objects under a given prefix (pagination-aware).
 */
async function deletePrefix(prefix: string, bucket: string = ASSET_S3_BUCKET_NAME, opts: DeleteOpts = { bestEffort: true }): Promise<void> {
    let continuationToken: string | undefined = undefined
    try {
        do {
            const listRes: ListObjectsV2CommandOutput = await timeAsync(
                'S3',
                'listObjectsV2',
                { bucket, prefix, continuationToken: continuationToken ?? null },
                () => s3Client.send(new ListObjectsV2Command({
                    Bucket: bucket,
                    Prefix: prefix,
                    ContinuationToken: continuationToken,
                }))
            )

            const contents = (listRes.Contents || []) as _Object[]
            if (contents.length > 0) {
                const toDelete = contents.map(o => ({ Key: o.Key! }))
                // batch delete up to 1000 per request
                while (toDelete.length) {
                    const chunk = toDelete.splice(0, 1000)
                    await timeAsync(
                        'S3',
                        'deleteObjects batch',
                        { bucket, prefix, keysCount: chunk.length },
                        () => s3Client.send(new DeleteObjectsCommand({
                            Bucket: bucket,
                            Delete: { Objects: chunk, Quiet: true },
                        })).then(() => undefined)
                    )
                }
            }

            continuationToken = listRes.IsTruncated ? listRes.NextContinuationToken : undefined
        } while (continuationToken)
    } catch (err) {
        log('S3', 'error', 'deletePrefix error', { prefix, error: err instanceof Error ? err.message : String(err) })
        if (!opts.bestEffort) throw err
    }
}

/**
 * Delete specific S3 objects by key.
 */
async function deleteKeys(keys: string[], bucket: string = ASSET_S3_BUCKET_NAME, opts: DeleteOpts = { bestEffort: false }): Promise<void> {
    if (!keys || keys.length === 0) return
    try {
        const uniqueKeys = [...new Set(keys)]
        const toDelete = uniqueKeys.map(k => ({ Key: k }))
        while (toDelete.length) {
            const chunk = toDelete.splice(0, 1000)
            await timeAsync(
                'S3',
                'deleteObjects batch',
                { bucket, keysCount: chunk.length },
                () => s3Client.send(new DeleteObjectsCommand({
                    Bucket: bucket,
                    Delete: { Objects: chunk, Quiet: true },
                })).then(() => undefined)
            )
        }
    } catch (err) {
        log('S3', 'error', 'deleteKeys error', { keysCount: keys.length, error: err instanceof Error ? err.message : String(err) })
        if (!opts.bestEffort) throw err
    }
}

// Configuration for legacy cleanup
const LEGACY_LESSON_FOLDER = process.env.LEGACY_LESSON_FOLDER || 'lesson-assets'
const ENABLE_LEGACY_SWEEP = process.env.ENABLE_LEGACY_SWEEP_ON_LESSON_DELETE === 'true'

export class CascadeDeleteService {
    /**
     * Recalculate and persist total course duration (seconds) from all lessons.
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

    /**
     * Delete a single lesson and all its assets (DB records), then clean up S3.
     * Returns silently if lesson doesn't exist (idempotent).
     */
    static async deleteLessonCascade(lessonId: string): Promise<void> {
        // Get course and chapter IDs for post-delete cleanup
        const meta = await prisma.lesson.findUnique({
            where: { id: lessonId },
            select: { id: true, chapter: { select: { id: true, courseId: true } } },
        })
        if (!meta) return // Already deleted, idempotent success

        const courseId = meta.chapter.courseId
        const chapterId = meta.chapter.id

        // Collect S3 keys before transaction (DB data won't be available after delete)
        const s3Keys: string[] = []

        await prisma.$transaction(async (tx) => {
            // Collect lesson's own media keys (legacy fields)
            const lesson = await tx.lesson.findUnique({
                where: { id: lessonId },
                select: { videoKey: true, subtitleKey: true },
            })
            if (lesson?.videoKey) s3Keys.push(lesson.videoKey)
            if (lesson?.subtitleKey) s3Keys.push(lesson.subtitleKey)

            // Collect transcript asset keys
            const transcripts = await tx.transcriptAsset.findMany({
                where: { lessonId },
                select: { s3Key: true },
            })
            s3Keys.push(...transcripts.map(t => t.s3Key).filter(Boolean) as string[])

            // Collect course asset keys bound to this lesson
            const bindings = await tx.lessonAsset.findMany({
                where: { lessonId },
                include: { courseAsset: { select: { id: true, s3Key: true } } },
            })
            const assetIds = bindings.map(b => b.courseAsset?.id).filter(Boolean) as string[]
            const keys = bindings.map(b => b.courseAsset?.s3Key).filter(Boolean) as string[]
            s3Keys.push(...keys)

            // Delete lesson asset bindings
            await tx.lessonAsset.deleteMany({ where: { lessonId } })

            // Delete associated course assets (assumes assets are not reused)
            if (assetIds.length) {
                await tx.courseAsset.deleteMany({ where: { id: { in: assetIds } } })
            }

            // Delete the lesson itself
            await tx.lesson.delete({ where: { id: lessonId } })
        })

        // Recalculate course duration after lesson deletion
        await this.recalcCourseDuration(courseId)

        // S3 cleanup after transaction commit
        const cleanupErrors: string[] = []

        // Delete precise S3 keys
        try {
            if (s3Keys.length) {
                await deleteKeys([...new Set(s3Keys)])
            }
        } catch (err) {
            cleanupErrors.push(err instanceof Error ? err.message : String(err))
        }

        // Delete lesson prefix as catch-all
        try {
            await deletePrefix(`${S3_ASSET_BASE_PREFIX}/${courseId}/${chapterId}/${lessonId}/`, ASSET_S3_BUCKET_NAME, { bestEffort: false })
        } catch (err) {
            cleanupErrors.push(err instanceof Error ? err.message : String(err))
        }

        // Optional legacy path cleanup
        if (ENABLE_LEGACY_SWEEP) {
            try {
                await deletePrefix(`${LEGACY_LESSON_FOLDER}/${lessonId}/`, ASSET_S3_BUCKET_NAME, { bestEffort: false })
            } catch (err) {
                cleanupErrors.push(err instanceof Error ? err.message : String(err))
            }
        }

        if (cleanupErrors.length) {
            throw new Error(`S3_CLEANUP_FAILED: ${cleanupErrors.join(' | ')}`)
        }
    }

    /**
     * Delete a chapter and all its lessons/assets (DB records), then clean up S3.
     * Returns silently if chapter doesn't exist (idempotent).
     */
    static async deleteChapterCascade(chapterId: string): Promise<void> {
        const chapter = await prisma.chapter.findUnique({
            where: { id: chapterId },
            select: { id: true, courseId: true },
        })
        if (!chapter) return // Already deleted, idempotent success

        const s3Keys: string[] = []
        let lessonIds: string[] = []

        await prisma.$transaction(async (tx) => {
            // Find all lessons in this chapter
            const lessons = await tx.lesson.findMany({
                where: { chapterId },
                select: { id: true, videoKey: true, subtitleKey: true },
            })
            lessonIds = lessons.map(l => l.id)

            if (lessonIds.length) {
                // Collect lesson media keys
                for (const lesson of lessons) {
                    if (lesson.videoKey) s3Keys.push(lesson.videoKey)
                    if (lesson.subtitleKey) s3Keys.push(lesson.subtitleKey)
                }

                // Collect transcript asset keys
                const transcripts = await tx.transcriptAsset.findMany({
                    where: { lessonId: { in: lessonIds } },
                    select: { s3Key: true },
                })
                s3Keys.push(...transcripts.map(t => t.s3Key).filter(Boolean) as string[])

                // Collect course asset keys
                const assets = await tx.courseAsset.findMany({
                    where: { lessons: { some: { lessonId: { in: lessonIds } } } },
                    select: { id: true, s3Key: true },
                })
                s3Keys.push(...assets.map(a => a.s3Key).filter(Boolean) as string[])

                // Delete lesson asset bindings
                await tx.lessonAsset.deleteMany({ where: { lessonId: { in: lessonIds } } })

                // Delete course assets
                if (assets.length) {
                    await tx.courseAsset.deleteMany({ where: { id: { in: assets.map(a => a.id) } } })
                }

                // Delete lessons
                await tx.lesson.deleteMany({ where: { id: { in: lessonIds } } })
            }

            // Delete the chapter
            await tx.chapter.delete({ where: { id: chapterId } })
        })

        // Recalculate course duration
        await this.recalcCourseDuration(chapter.courseId)

        // S3 cleanup
        const cleanupErrors: string[] = []

        try {
            if (s3Keys.length) {
                await deleteKeys([...new Set(s3Keys)])
            }
        } catch (err) {
            cleanupErrors.push(err instanceof Error ? err.message : String(err))
        }

        try {
            await deletePrefix(`${S3_ASSET_BASE_PREFIX}/${chapter.courseId}/${chapterId}/`, ASSET_S3_BUCKET_NAME, { bestEffort: false })
        } catch (err) {
            cleanupErrors.push(err instanceof Error ? err.message : String(err))
        }

        // Legacy cleanup for all lessons
        for (const lid of lessonIds) {
            try {
                await deletePrefix(`${LEGACY_LESSON_FOLDER}/${lid}/`, ASSET_S3_BUCKET_NAME, { bestEffort: false })
            } catch (err) {
                cleanupErrors.push(err instanceof Error ? err.message : String(err))
            }
        }

        if (cleanupErrors.length) {
            throw new Error(`S3_CLEANUP_FAILED: ${cleanupErrors.join(' | ')}`)
        }
    }

    /**
     * Delete a course and all its chapters/lessons/assets (DB records), then clean up S3.
     * Returns silently if course doesn't exist (idempotent).
     */
    static async deleteCourseCascade(courseId: string): Promise<void> {
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            select: { id: true },
        })
        if (!course) return // Already deleted, idempotent success

        const s3Keys: string[] = []
        let lessonIds: string[] = []

        await prisma.$transaction(async (tx) => {
            // Find all lessons in this course
            const lessons = await tx.lesson.findMany({
                where: { chapter: { courseId } },
                select: { id: true, videoKey: true, subtitleKey: true },
            })
            lessonIds = lessons.map(l => l.id)

            // Collect lesson media keys
            for (const lesson of lessons) {
                if (lesson.videoKey) s3Keys.push(lesson.videoKey)
                if (lesson.subtitleKey) s3Keys.push(lesson.subtitleKey)
            }

            // Collect transcript asset keys
            if (lessonIds.length) {
                const transcripts = await tx.transcriptAsset.findMany({
                    where: { lessonId: { in: lessonIds } },
                    select: { s3Key: true },
                })
                s3Keys.push(...transcripts.map(t => t.s3Key).filter(Boolean) as string[])
            }

            // Collect all course assets
            const assets = await tx.courseAsset.findMany({
                where: { courseId },
                select: { id: true, s3Key: true },
            })
            s3Keys.push(...assets.map(a => a.s3Key).filter(Boolean) as string[])

            // Delete lesson asset bindings
            if (lessonIds.length) {
                await tx.lessonAsset.deleteMany({ where: { lessonId: { in: lessonIds } } })
            }

            // Delete all course assets
            if (assets.length) {
                await tx.courseAsset.deleteMany({ where: { id: { in: assets.map(a => a.id) } } })
            }

            // Delete all lessons
            if (lessonIds.length) {
                await tx.lesson.deleteMany({ where: { id: { in: lessonIds } } })
            }

            // Delete all chapters
            await tx.chapter.deleteMany({ where: { courseId } })

            // Delete the course
            await tx.course.delete({ where: { id: courseId } })
        })

        // S3 cleanup
        const cleanupErrors: string[] = []

        try {
            if (s3Keys.length) {
                await deleteKeys([...new Set(s3Keys)])
            }
        } catch (err) {
            cleanupErrors.push(err instanceof Error ? err.message : String(err))
        }

        try {
            await deletePrefix(`${S3_ASSET_BASE_PREFIX}/${courseId}/`, ASSET_S3_BUCKET_NAME, { bestEffort: false })
        } catch (err) {
            cleanupErrors.push(err instanceof Error ? err.message : String(err))
        }

        // Legacy cleanup for all lessons
        for (const lid of lessonIds) {
            try {
                await deletePrefix(`${LEGACY_LESSON_FOLDER}/${lid}/`, ASSET_S3_BUCKET_NAME, { bestEffort: false })
            } catch (err) {
                cleanupErrors.push(err instanceof Error ? err.message : String(err))
            }
        }

        if (cleanupErrors.length) {
            throw new Error(`S3_CLEANUP_FAILED: ${cleanupErrors.join(' | ')}`)
        }
    }

    /**
     * Validate hierarchy: chapter belongs to course.
     */
    static async validateChapterHierarchy(courseId: string, chapterId: string): Promise<boolean> {
        const chapter = await prisma.chapter.findUnique({
            where: { id: chapterId },
            select: { courseId: true },
        })
        return chapter?.courseId === courseId
    }

    /**
     * Validate hierarchy: lesson belongs to chapter and course.
     */
    static async validateLessonHierarchy(courseId: string, chapterId: string, lessonId: string): Promise<boolean> {
        const lesson = await prisma.lesson.findUnique({
            where: { id: lessonId },
            include: { chapter: { select: { id: true, courseId: true } } },
        })
        if (!lesson) return false
        return lesson.chapter.id === chapterId && lesson.chapter.courseId === courseId
    }
}
