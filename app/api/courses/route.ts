import { NextRequest, NextResponse } from 'next/server'
import { CourseService } from '@/lib/services/course.service'
import { CourseLevel, CourseStatus } from '@prisma/client'

const levelValues: CourseLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED']
const statusValues: CourseStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED']

const parseLevel = (value: string | null): CourseLevel | undefined => {
    if (!value) return undefined
    return levelValues.includes(value as CourseLevel) ? (value as CourseLevel) : undefined
}

const parseStatus = (value: string | null): CourseStatus | 'ALL' | undefined => {
    if (!value) return undefined
    if (value === 'ALL') return 'ALL'
    return statusValues.includes(value as CourseStatus) ? (value as CourseStatus) : undefined
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)

        const params = {
            page: Number(searchParams.get('page')) || 1,
            limit: Number(searchParams.get('limit')) || 10,
            category: searchParams.get('category') || undefined,
            level: parseLevel(searchParams.get('level')),
            search: searchParams.get('search') || undefined,
            status: parseStatus(searchParams.get('status')),
        }

        const result = await CourseService.getCourses(params)

        return NextResponse.json({
            success: true,
            data: result,
        })
    } catch (error) {
        console.error('Get courses error:', error)

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to retrieve courses',
                },
            },
            { status: 500 }
        )
    }
}
