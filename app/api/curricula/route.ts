import { NextResponse } from 'next/server'
import { CourseService } from '@/lib/services/course.service'

export const GET = async () => {
    const { courses } = await CourseService.getCourses({ status: 'PUBLISHED', limit: 100 })
    return NextResponse.json({
        success: true,
        items: courses.map((c: any) => ({
            id: c.id,
            code: c.slug,
            title: c.title,
            status: c.status,
            level: c.level,
            category: c.category,
            learningOutcomes: c.learningOutcomes,
            requirements: c.requirements,
            modulesCount: c._count?.chapters ?? 0,
            lessonsCount: 0, // Would need full chapter/lesson data to calculate
        })),
    })
}
