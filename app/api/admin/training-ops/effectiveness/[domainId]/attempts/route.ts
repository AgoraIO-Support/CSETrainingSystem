import { ExamAttemptStatus, type Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'

type RouteContext = {
    params: Promise<{ domainId: string }>
}

const validResults = ['all', 'passed', 'failed'] as const
type ResultFilter = typeof validResults[number]

export const GET = withAdminAuth(async (req: NextRequest, _user, context: RouteContext) => {
    try {
        const { domainId } = await context.params
        const { searchParams } = new URL(req.url)
        const requestedResult = searchParams.get('result') ?? 'all'

        if (!validResults.includes(requestedResult as ResultFilter)) {
            return NextResponse.json(
                { success: false, error: { code: 'INVALID_RESULT', message: 'Result must be all, passed, or failed' } },
                { status: 400 }
            )
        }

        const result = requestedResult as ResultFilter
        const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
        const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '20', 10) || 20))
        const search = searchParams.get('search')?.trim()

        const domain = await prisma.productDomain.findUnique({
            where: { id: domainId },
            select: { id: true, name: true },
        })

        if (!domain) {
            return NextResponse.json(
                { success: false, error: { code: 'DOMAIN_NOT_FOUND', message: 'Product domain not found' } },
                { status: 404 }
            )
        }

        const where: Prisma.ExamAttemptWhereInput = {
            status: ExamAttemptStatus.GRADED,
            exam: { productDomainId: domainId },
            ...(result === 'passed' ? { passed: true } : {}),
            ...(result === 'failed' ? { passed: false } : {}),
            ...(search ? {
                OR: [
                    { user: { name: { contains: search, mode: 'insensitive' } } },
                    { user: { email: { contains: search, mode: 'insensitive' } } },
                    { exam: { title: { contains: search, mode: 'insensitive' } } },
                ],
            } : {}),
        }

        const [total, attempts] = await Promise.all([
            prisma.examAttempt.count({ where }),
            prisma.examAttempt.findMany({
                where,
                orderBy: [{ submittedAt: 'desc' }, { startedAt: 'desc' }],
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    attemptNumber: true,
                    status: true,
                    startedAt: true,
                    submittedAt: true,
                    rawScore: true,
                    percentageScore: true,
                    passed: true,
                    user: { select: { id: true, name: true, email: true } },
                    exam: { select: { id: true, title: true, totalScore: true, passingScore: true } },
                },
            }),
        ])

        return NextResponse.json({
            success: true,
            data: { domain, attempts },
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit)),
            },
        })
    } catch (error) {
        console.error('List domain effectiveness attempts error:', error)
        return NextResponse.json(
            { success: false, error: { code: 'SYSTEM_001', message: 'Failed to load domain attempts' } },
            { status: 500 }
        )
    }
})
