import { NextResponse } from 'next/server'
import { CourseService } from '@/lib/services/course.service'

export const GET = async () => {
    const { courses } = await CourseService.getCourses({ status: 'PUBLISHED', limit: 100 })
    return NextResponse.json({
        success: true,
        items: courses.map(c => ({
            id: c.id,
            code: c.slug,
            title: c.title,
            status: c.status,
            level: c.level,
            category: c.category,
            learningOutcomes: c.learningOutcomes,
            requirements: c.requirements,
            modulesCount: c.chapters?.length ?? 0,
            lessonsCount: c.chapters?.reduce((sum, ch) => sum + ch.lessons.length, 0) ?? 0,
        })),
    })
}
