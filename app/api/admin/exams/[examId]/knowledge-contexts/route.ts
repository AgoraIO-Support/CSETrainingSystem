/**
 * Admin Exam Knowledge Contexts Route
 * GET /api/admin/exams/[examId]/knowledge-contexts - List lesson knowledge contexts available for exam generation
 */

import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { KnowledgeContextStatus } from '@prisma/client'
import { getPrimaryAiTranscriptTrack } from '@/lib/transcript-tracks'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

type RouteContext = {
    params: Promise<{ examId: string }>
}

export const GET = withSmeOrAdminAuth(async (_req: NextRequest, user, context: RouteContext) => {
    try {
        const { examId } = await context.params
        if (user.role === 'SME') {
            await TrainingOpsService.assertScopedExamAccess(user, examId)
        }

        const exam = await prisma.exam.findUnique({
            where: { id: examId },
            include: {
                course: {
                    include: {
                        chapters: {
                            orderBy: { order: 'asc' },
                            include: {
                                lessons: {
                                    orderBy: { order: 'asc' },
                                    include: {
                                        knowledgeContext: true,
                                        transcripts: {
                                            where: {
                                                isActive: true,
                                                archivedAt: null,
                                            },
                                            orderBy: [{ isPrimaryForAI: 'desc' }, { isDefaultSubtitle: 'desc' }, { createdAt: 'asc' }],
                                        },
                                        knowledgeAnchors: {
                                            orderBy: { sequenceIndex: 'asc' },
                                            take: 1,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        })

        if (!exam) {
            return NextResponse.json(
                {
                    success: false,
                    error: { code: 'EXAM_NOT_FOUND', message: 'Exam not found' },
                },
                { status: 404 }
            )
        }

        // Exams without a linked course can select knowledge contexts from any course.
        if (!exam.course) {
            const lessons = await prisma.lesson.findMany({
                where: {
                    OR: [
                        { knowledgeContext: { isNot: null } },
                        { transcripts: { some: {} } },
                    ],
                },
                include: {
                    chapter: { include: { course: true } },
                    knowledgeContext: true,
                    transcripts: {
                        where: {
                            isActive: true,
                            archivedAt: null,
                        },
                        orderBy: [{ isPrimaryForAI: 'desc' }, { isDefaultSubtitle: 'desc' }, { createdAt: 'asc' }],
                    },
                    knowledgeAnchors: {
                        orderBy: { sequenceIndex: 'asc' },
                        take: 1,
                    },
                },
                take: 500,
            })

            const mapped = lessons
                .map((lesson) => ({
                    lessonId: lesson.id,
                    lessonTitle: lesson.title,
                    // Encode course title into chapterTitle to keep the client contract stable
                    // while still making it clear which course the context comes from.
                    chapterTitle: `${lesson.chapter.course.title} · ${lesson.chapter.title}`,
                    chapterOrder: lesson.chapter.order,
                    lessonOrder: lesson.order,
                    knowledgeStatus: lesson.knowledgeContext?.status ?? 'MISSING',
                    anchorCount: lesson.knowledgeContext?.anchorCount ?? 0,
                    processedAt: lesson.knowledgeContext?.processedAt?.toISOString() ?? null,
                    hasTranscript: Boolean(getPrimaryAiTranscriptTrack(lesson.transcripts)?.s3Key),
                    transcriptId: getPrimaryAiTranscriptTrack(lesson.transcripts)?.id ?? null,
                    transcriptFilename: getPrimaryAiTranscriptTrack(lesson.transcripts)?.filename ?? null,
                }))

            const rank = (s: string) =>
                s === KnowledgeContextStatus.READY
                    ? 0
                    : s === KnowledgeContextStatus.PROCESSING
                        ? 1
                        : s === KnowledgeContextStatus.PENDING
                            ? 2
                            : 3
            mapped.sort((a, b) => {
                const r = rank(a.knowledgeStatus) - rank(b.knowledgeStatus)
                if (r !== 0) return r
                // chapterTitle includes course name first; sort for stable display
                if (a.chapterTitle !== b.chapterTitle) return a.chapterTitle.localeCompare(b.chapterTitle)
                if (a.chapterOrder !== b.chapterOrder) return a.chapterOrder - b.chapterOrder
                return a.lessonOrder - b.lessonOrder
            })

            return NextResponse.json({
                success: true,
                data: {
                    courseId: null,
                    lessons: mapped,
                },
            })
        }

        const lessons = exam.course.chapters.flatMap((chapter) =>
            chapter.lessons.map((lesson) => ({
                lessonId: lesson.id,
                lessonTitle: lesson.title,
            chapterTitle: chapter.title,
            chapterOrder: chapter.order,
            lessonOrder: lesson.order,
            knowledgeStatus: lesson.knowledgeContext?.status ?? 'MISSING',
            anchorCount: lesson.knowledgeContext?.anchorCount ?? 0,
            processedAt: lesson.knowledgeContext?.processedAt?.toISOString() ?? null,
            hasTranscript: Boolean(getPrimaryAiTranscriptTrack(lesson.transcripts)?.s3Key),
            transcriptId: getPrimaryAiTranscriptTrack(lesson.transcripts)?.id ?? null,
            transcriptFilename: getPrimaryAiTranscriptTrack(lesson.transcripts)?.filename ?? null,
        }))
        )

        return NextResponse.json({
            success: true,
            data: {
                courseId: exam.course.id,
                lessons,
            },
        })
    } catch (error) {
        console.error('List exam knowledge contexts error:', error)
        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'AUTH_003',
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
                    message: 'Failed to list knowledge contexts',
                },
            },
            { status: 500 }
        )
    }
})
