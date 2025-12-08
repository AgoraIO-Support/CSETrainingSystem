import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { CourseService } from '@/lib/services/course.service'
import { createCourseSchema } from '@/lib/validations'
import { z } from 'zod'

// List all curricula (courses) for admin
export const GET = withAdminAuth(async () => {
    const { courses } = await CourseService.getCourses({ status: 'ALL', limit: 200 })
    return NextResponse.json({
        success: true,
        items: courses.map(c => ({
            id: c.id,
            code: c.slug,
            title: c.title,
            status: c.status,
            versionNumber: 1,
            audienceLevel: c.level,
            modulesCount: c.chapters?.length ?? 0,
            lessonsCount: c.chapters?.reduce((sum, ch) => sum + ch.lessons.length, 0) ?? 0,
            updatedAt: c.updatedAt,
            publishedAt: c.publishedAt,
        })),
    })
})

// Create a new curriculum as draft course
export const POST = withAdminAuth(async (req) => {
    try {
        const body = await req.json().catch(() => ({}))
        const payload = {
            title: body.title || 'Untitled curriculum',
            slug: body.slug || `cur-${Date.now()}`,
            description: body.description || 'Draft curriculum',
            thumbnail: body.thumbnail,
            level: body.audienceLevel || 'BEGINNER',
            category: body.category || 'General',
            tags: body.tags || [],
            instructorId: body.instructorId, // optional
            status: 'DRAFT',
            learningOutcomes: body.learningOutcomes || [],
            requirements: body.requirements || [],
        }

        // Validate minimal required fields
        const data = createCourseSchema.pick({
            title: true,
            slug: true,
            description: true,
            thumbnail: true,
            level: true,
            category: true,
            tags: true,
            instructorId: true,
            status: true,
        }).parse(payload)

        const course = await CourseService.createCourse({
            ...data,
            learningOutcomes: payload.learningOutcomes,
            requirements: payload.requirements,
        })

        return NextResponse.json(
            {
                success: true,
                curriculumId: course.id,
                currentVersionId: course.id, // using course id as single version handle
                version: course,
            },
            { status: 201 }
        )
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: { code: 'VALIDATION_ERROR', details: error.errors } },
                { status: 400 }
            )
        }
        if (error instanceof Error && error.message === 'SLUG_EXISTS') {
            return NextResponse.json(
                { success: false, error: { code: 'SLUG_EXISTS', message: 'Slug already used' } },
                { status: 409 }
            )
        }
        return NextResponse.json({ success: false, error: { code: 'SYSTEM_ERROR' } }, { status: 500 })
    }
})
