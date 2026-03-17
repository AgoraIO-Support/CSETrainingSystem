/**
 * Admin Exam Attempt Detail Route
 * GET /api/admin/exams/[examId]/attempts/[attemptId] - Get attempt with answers (for review/grading)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { FileService } from '@/lib/services/file.service'
import { resolveRichTextAssetUrls } from '@/lib/rich-text'

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
                questionSnapshots: {
                    orderBy: { order: 'asc' },
                },
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
                },
            },
        })

        if (!attempt) {
            return NextResponse.json(
                { success: false, error: { code: 'ATTEMPT_NOT_FOUND', message: 'Attempt not found' } },
                { status: 404 }
            )
        }

        const answers = await Promise.all(
            attempt.answers.map(async (a) => {
                const snapshot = attempt.questionSnapshots.find((s) => s.questionId === a.questionId)
                let recordingUrl: string | null = null
                if ((snapshot?.type ?? a.question.type) === 'EXERCISE' && a.recordingStatus === 'UPLOADED' && a.recordingS3Key) {
                    try {
                        recordingUrl = await FileService.getAssetAccessUrl(a.recordingS3Key)
                    } catch (err) {
                        console.error('Failed to generate exercise recording access URL:', err)
                        recordingUrl = null
                    }
                }

                const [answer, question, explanation] = await Promise.all([
                    resolveRichTextAssetUrls(a.answer, (key) => FileService.getAssetAccessUrl(key)),
                    resolveRichTextAssetUrls(snapshot?.question ?? a.question.question, (key) => FileService.getAssetAccessUrl(key)),
                    resolveRichTextAssetUrls(snapshot?.explanation ?? a.question.explanation, (key) => FileService.getAssetAccessUrl(key)),
                ])

                return {
                    id: a.id,
                    questionId: a.questionId,
                    answer,
                    selectedOption: a.selectedOption,
                    recordingS3Key: a.recordingS3Key,
                    recordingStatus: a.recordingStatus,
                    recordingMimeType: a.recordingMimeType,
                    recordingSizeBytes: a.recordingSizeBytes,
                    recordingDurationSeconds: a.recordingDurationSeconds,
                    recordingUrl,
                    gradingStatus: a.gradingStatus,
                    isCorrect: a.isCorrect,
                    pointsAwarded: a.pointsAwarded,
                    aiSuggestedScore: a.aiSuggestedScore,
                    aiFeedback: a.aiFeedback,
                    adminScore: a.adminScore,
                    adminFeedback: a.adminFeedback,
                    question: {
                        id: a.questionId,
                        examId: attempt.examId,
                        type: snapshot?.type ?? a.question.type,
                        question: question ?? (snapshot?.question ?? a.question.question),
                        options: (snapshot?.options as string[] | null) ?? (a.question.options as string[] | null),
                        correctAnswer: snapshot?.correctAnswer ?? a.question.correctAnswer,
                        explanation: explanation ?? (snapshot?.explanation ?? a.question.explanation),
                        points: snapshot?.points ?? a.question.points,
                        order: snapshot?.order ?? a.question.order,
                        difficulty: snapshot?.difficulty ?? a.question.difficulty,
                        maxWords: snapshot?.maxWords ?? a.question.maxWords,
                        rubric: snapshot?.rubric ?? a.question.rubric,
                        sampleAnswer: snapshot?.sampleAnswer ?? a.question.sampleAnswer,
                    },
                }
            })
        )
        answers.sort((left, right) => {
            const leftOrder = left.question.order ?? Number.MAX_SAFE_INTEGER
            const rightOrder = right.question.order ?? Number.MAX_SAFE_INTEGER
            if (leftOrder !== rightOrder) return leftOrder - rightOrder
            return left.id.localeCompare(right.id)
        })

        const certificate = await prisma.certificate.findFirst({
            where: { examId, userId: attempt.userId },
            orderBy: { issueDate: 'desc' },
            select: {
                id: true,
                certificateNumber: true,
                issueDate: true,
                pdfUrl: true,
                status: true,
                revokedAt: true,
                certificateTitle: true,
            },
        })

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
                answers,
                certificate,
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
