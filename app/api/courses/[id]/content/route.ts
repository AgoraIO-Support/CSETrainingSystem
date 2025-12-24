import { NextResponse } from 'next/server'
import { CourseStructureService } from '@/lib/services/course-structure.service'
import { FileService } from '@/lib/services/file.service'
import { withAuthOptional } from '@/lib/auth-middleware'

export const GET = withAuthOptional(async (req, user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params
        const includeDraft = user?.role === 'ADMIN'
        const course = await CourseStructureService.getCourseContent(id, includeDraft)

        const payload = {
            courseId: course.id,
            chapters: await Promise.all(course.chapters.map(async (chapter) => ({
                id: chapter.id,
                title: chapter.title,
                description: chapter.description,
                order: chapter.order,
                lessons: await Promise.all(chapter.lessons.map(async (lesson) => ({
                    id: lesson.id,
                    title: lesson.title,
                    description: lesson.description,
                    order: lesson.order,
                    durationMinutes: lesson.durationMinutes ?? undefined,
                    lessonType: lesson.lessonType ?? undefined,
                    learningObjectives: lesson.learningObjectives ?? [],
                    completionRule: lesson.completionRule ?? undefined,
                    assets: await Promise.all(lesson.assets.map(async (binding) => {
                        const asset = binding.courseAsset
                        return {
                            id: asset.id,
                            title: asset.title,
                            type: asset.type,
                            url: await FileService.getAssetAccessUrl(asset.s3Key),
                            mimeType: asset.mimeType ?? asset.contentType ?? undefined,
                        }
                    })),
                }))),
            }))),
        }

        return NextResponse.json({ success: true, data: payload })
    } catch (error) {
        console.error('Get course content error:', error)
        const message = error instanceof Error ? error.message : 'Failed to load content'
        const status = message === 'COURSE_NOT_PUBLISHED' ? 403 : message === 'COURSE_NOT_FOUND' ? 404 : 500
        return NextResponse.json(
            { success: false, error: { code: 'CONTENT_ERROR', message } },
            { status }
        )
    }
})
