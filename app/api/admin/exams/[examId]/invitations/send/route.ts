/**
 * Admin Exam Invitation Notification Route
 * POST /api/admin/exams/[examId]/invitations/send - Send WeCom notifications
 * - If `userIds` is provided: send to selected users (supports re-send even if previously sent)
 * - If `userIds` is omitted: send all pending notifications only
 */

import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { WecomWebhookService } from '@/lib/services/wecom-webhook.service'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

type RouteContext = {
    params: Promise<{ examId: string }>
}

const sendInvitesSchema = z.object({
    userIds: z.array(z.string().uuid()).optional(),
})

export const POST = withSmeOrAdminAuth(async (req: NextRequest, user, context: RouteContext) => {
    try {
        const { examId } = await context.params

        if (user.role === 'SME') {
            await TrainingOpsService.assertScopedExamAccess(user, examId)
        }

        const body = await req.json().catch(() => ({}))
        const parsed = sendInvitesSchema.parse(body)

        const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true } })
        if (!exam) {
            return NextResponse.json(
                { success: false, error: { code: 'EXAM_NOT_FOUND', message: 'Exam not found' } },
                { status: 404 }
            )
        }

        const hasSelectedUsers = Array.isArray(parsed.userIds) && parsed.userIds.length > 0
        const where = {
            examId,
            ...(hasSelectedUsers
                ? { userId: { in: parsed.userIds } }
                : { emailSentAt: null }),
        }

        const targets = await prisma.examInvitation.findMany({
            where,
            select: { userId: true },
        })

        const results = { sent: 0, failed: 0 }
        for (const inv of targets) {
            const res = await WecomWebhookService.sendExamInvitation(inv.userId, examId)
            if (res.success) results.sent++
            else results.failed++
        }

        return NextResponse.json({
            success: true,
            data: results,
        })
    } catch (error) {
        console.error('Send invitation notifications error:', error)

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

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Invalid request',
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
                    message: 'Failed to send invitation notifications',
                },
            },
            { status: 500 }
        )
    }
})
