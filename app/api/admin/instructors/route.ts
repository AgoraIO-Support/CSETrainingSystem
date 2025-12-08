import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'

export const GET = withAdminAuth(async () => {
    try {
        const instructors = await prisma.user.findMany({
            where: {
                role: 'ADMIN',
            },
            select: {
                id: true,
                name: true,
                email: true,
                title: true,
            },
            orderBy: {
                name: 'asc',
            },
        })

        return NextResponse.json({
            success: true,
            data: instructors,
        })
    } catch (error) {
        console.error('Get instructors error:', error)

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load instructors',
                },
            },
            { status: 500 }
        )
    }
})
