/**
 * Admin Exam Publish Route
 * POST /api/admin/exams/[examId]/publish - Publish an approved exam and assign selected users
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { publishExamSchema } from '@/lib/validations'
import { ExamStatus } from '@prisma/client'
import { z } from 'zod'
import { WecomWebhookService } from '@/lib/services/wecom-webhook.service'

type RouteContext = {
    params: Promise<{ examId: string }>
}

export const POST = withAdminAuth(async (req: NextRequest, _user, context: RouteContext) => {
    try {
        const { examId } = await context.params
        const body = await req.json().catch(() => ({}))
        const parsed = publishExamSchema.parse(body)
        const { userIds } = parsed
        const sendNotification = parsed.sendNotification ?? parsed.sendEmail ?? false

        const exam = await prisma.exam.findUnique({
            where: { id: examId },
            include: {
                _count: { select: { questions: true } },
            },
        })

        if (!exam) {
            return NextResponse.json(
                { success: false, error: { code: 'EXAM_NOT_FOUND', message: 'Exam not found' } },
                { status: 404 }
            )
        }

        if (exam.status !== ExamStatus.APPROVED) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'EXAM_012',
                        message: 'Exam must be APPROVED before publishing.',
                    },
                },
                { status: 400 }
            )
        }

        if (exam._count.questions === 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'EXAM_006',
                        message: 'Exam must have at least one question before publishing.',
                    },
                },
                { status: 400 }
            )
        }

        const sum = await prisma.examQuestion.aggregate({
            where: { examId },
            _sum: { points: true },
        })
        const totalPoints = sum._sum.points ?? 0
        if (totalPoints !== exam.totalScore) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'EXAM_010',
                        message: 'Cannot publish exam: total question points must match the exam total score.',
                    },
                },
                { status: 400 }
            )
        }

        const users = await prisma.user.findMany({
            where: { id: { in: userIds }, status: 'ACTIVE' },
            select: { id: true },
        })
        const activeUserIds = new Set(users.map((u) => u.id))
        const invalidUserIds = userIds.filter((id) => !activeUserIds.has(id))
        if (invalidUserIds.length > 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'EXAM_013',
                        message: 'Some selected users are invalid or inactive.',
                        details: invalidUserIds,
                    },
                },
                { status: 400 }
            )
        }

        const existingInvites = await prisma.examInvitation.findMany({
            where: {
                examId,
                userId: { in: userIds },
            },
            select: { userId: true },
        })
        const existingSet = new Set(existingInvites.map((i) => i.userId))
        const toCreate = userIds.filter((id) => !existingSet.has(id))

        await prisma.$transaction(async (tx) => {
            if (toCreate.length > 0) {
                await tx.examInvitation.createMany({
                    data: toCreate.map((userId) => ({ examId, userId })),
                    skipDuplicates: true,
                })
            }

            await tx.exam.update({
                where: { id: examId },
                data: {
                    status: ExamStatus.PUBLISHED,
                    publishedAt: new Date(),
                },
            })
        })

        const notificationResults = { sent: 0, failed: 0 }
        if (sendNotification && toCreate.length > 0) {
            for (const userId of toCreate) {
                const res = await WecomWebhookService.sendExamInvitation(userId, examId)
                if (res.success) notificationResults.sent++
                else notificationResults.failed++
            }
        }

        const updated = await prisma.exam.findUnique({
            where: { id: examId },
            include: {
                course: { select: { id: true, title: true, slug: true } },
                createdBy: { select: { id: true, name: true, email: true } },
                approvedBy: { select: { id: true, name: true, email: true } },
                _count: { select: { questions: true, attempts: true, materials: true, invitations: true } },
            },
        })

        return NextResponse.json({
            success: true,
            data: updated,
            meta: {
                invited: toCreate.length,
                skipped: userIds.length - toCreate.length,
                notificationsSent: notificationResults.sent,
                notificationsFailed: notificationResults.failed,
                // backward compatibility for older clients
                emailsSent: notificationResults.sent,
                emailsFailed: notificationResults.failed,
            },
        })
    } catch (error) {
        console.error('Publish exam error:', error)

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Invalid publish payload',
                        details: error.errors,
                    },
                },
                { status: 400 }
            )
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'EXAM_001',
                    message: 'Failed to publish exam',
                },
            },
            { status: 500 }
        )
    }
})
