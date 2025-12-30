import { NextRequest, NextResponse } from 'next/server'
import { CourseService } from '@/lib/services/course.service'
import { CourseLevel } from '@prisma/client'

const levelValues: CourseLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED']

const parseLevel = (value: string | null): CourseLevel | undefined => {
    if (!value) return undefined

    const normalized = value.trim()
    if (!normalized) return undefined

    const upper = normalized
        .toUpperCase()
        .replace(/[\s-]+/g, '_')

    if (upper === 'ALL' || upper === 'ALL_LEVELS') return undefined

    return levelValues.includes(upper as CourseLevel) ? (upper as CourseLevel) : undefined
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
            // 仅返回已发布课程（服务端默认未传 status 时即过滤为 PUBLISHED）
            // 不允许客户端覆盖状态过滤，因此不传 status
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
