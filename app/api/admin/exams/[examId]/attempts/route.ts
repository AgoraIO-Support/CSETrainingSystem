/**
 * Admin Exam Attempts Route
 * GET /api/admin/exams/[examId]/attempts - List attempts for an exam
 */

import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { ExamAttemptStatus, type Prisma } from '@prisma/client'

type RouteContext = {
    params: Promise<{ examId: string }>
}

export const GET = withSmeOrAdminAuth(async (req: NextRequest, user, context: RouteContext) => {
    try {
        const { examId } = await context.params
        const { searchParams } = new URL(req.url)

        if (user.role === 'SME') {
            await TrainingOpsService.assertScopedExamAccess(user, examId)
        }

        const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
        const limit = Math.min(200, Math.max(1, Number.parseInt(searchParams.get('limit') || '50', 10) || 50))
        const status = searchParams.get('status') || undefined

        const exam = await prisma.exam.findUnique({
            where: { id: examId },
            select: { id: true },
        })
        if (!exam) {
            return NextResponse.json(
                { success: false, error: { code: 'EXAM_NOT_FOUND', message: 'Exam not found' } },
                { status: 404 }
            )
        }

        const where: Prisma.ExamAttemptWhereInput = {
            examId,
        }

        if (status && Object.values(ExamAttemptStatus).includes(status as ExamAttemptStatus)) {
            where.status = status as ExamAttemptStatus
        }

        const [total, attempts] = await Promise.all([
            prisma.examAttempt.count({ where }),
            prisma.examAttempt.findMany({
                where,
                orderBy: [{ startedAt: 'desc' }, { attemptNumber: 'desc' }],
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    user: { select: { id: true, name: true, email: true } },
                    _count: { select: { answers: true } },
                },
            }),
        ])

        return NextResponse.json({
            success: true,
            data: attempts.map((a) => ({
                id: a.id,
                examId: a.examId,
                userId: a.userId,
                attemptNumber: a.attemptNumber,
                status: a.status,
                startedAt: a.startedAt,
                submittedAt: a.submittedAt,
                expiresAt: a.expiresAt,
                rawScore: a.rawScore,
                percentageScore: a.percentageScore,
                passed: a.passed,
                hasEssays: a.hasEssays,
                essaysGraded: a.essaysGraded,
                user: a.user,
                _count: a._count,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit)),
            },
        })
    } catch (error) {
        console.error('List attempts error:', error)
        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'FORBIDDEN',
                        message: 'Insufficient permissions',
                    },
                },
                { status: 403 }
            )
        }
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'EXAM_001',
                    message: 'Failed to list attempts',
                },
            },
            { status: 500 }
        )
    }
})
