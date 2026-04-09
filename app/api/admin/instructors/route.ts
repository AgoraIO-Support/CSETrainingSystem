import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'

export const GET = withSmeOrAdminAuth(async (_req, user) => {
    try {
        const instructors = await prisma.user.findMany({
            where: user.role === 'SME' ? { id: user.id } : undefined,
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
