/**
 * Admin Exam Attempt Detail Route
 * GET /api/admin/exams/[examId]/attempts/[attemptId] - Get attempt with answers (for review/grading)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'

type RouteContext = {
    params: Promise<{ examId: string; attemptId: string }>
}

export const GET = withAdminAuth(async (_req: NextRequest, _user, context: RouteContext) => {
    try {
        const { examId, attemptId } = await context.params

        const attempt = await prisma.examAttempt.findFirst({
            where: { id: attemptId, examId },
            include: {
                user: { select: { id: true, name: true, email: true } },
                exam: { select: { id: true, title: true, totalScore: true, passingScore: true } },
                answers: {
                    include: {
                        question: {
                            select: {
                                id: true,
                                examId: true,
                                type: true,
                                question: true,
                                options: true,
                                correctAnswer: true,
                                explanation: true,
                                points: true,
                                order: true,
                                difficulty: true,
                                maxWords: true,
                                rubric: true,
                                sampleAnswer: true,
                            },
                        },
                    },
                    orderBy: { updatedAt: 'asc' },
                },
            },
        })

        if (!attempt) {
            return NextResponse.json(
                { success: false, error: { code: 'ATTEMPT_NOT_FOUND', message: 'Attempt not found' } },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            data: {
                id: attempt.id,
                examId: attempt.examId,
                userId: attempt.userId,
                attemptNumber: attempt.attemptNumber,
                status: attempt.status,
                startedAt: attempt.startedAt,
                submittedAt: attempt.submittedAt,
                expiresAt: attempt.expiresAt,
                rawScore: attempt.rawScore,
                percentageScore: attempt.percentageScore,
                passed: attempt.passed,
                hasEssays: attempt.hasEssays,
                essaysGraded: attempt.essaysGraded,
                user: attempt.user,
                exam: attempt.exam,
                answers: attempt.answers.map((a) => ({
                    id: a.id,
                    questionId: a.questionId,
                    answer: a.answer,
                    selectedOption: a.selectedOption,
                    gradingStatus: a.gradingStatus,
                    isCorrect: a.isCorrect,
                    pointsAwarded: a.pointsAwarded,
                    aiSuggestedScore: a.aiSuggestedScore,
                    aiFeedback: a.aiFeedback,
                    adminScore: a.adminScore,
                    adminFeedback: a.adminFeedback,
                    question: {
                        id: a.question.id,
                        examId: a.question.examId,
                        type: a.question.type,
                        question: a.question.question,
                        options: a.question.options as string[] | null,
                        correctAnswer: a.question.correctAnswer,
                        explanation: a.question.explanation,
                        points: a.question.points,
                        order: a.question.order,
                        difficulty: a.question.difficulty,
                        maxWords: a.question.maxWords,
                        rubric: a.question.rubric,
                        sampleAnswer: a.question.sampleAnswer,
                    },
                })),
            },
        })
    } catch (error) {
        console.error('Get attempt detail error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'EXAM_001',
                    message: 'Failed to get attempt details',
                },
            },
            { status: 500 }
        )
    }
})

