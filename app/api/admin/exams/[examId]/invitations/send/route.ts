/**
 * Admin Exam Invitation Email Route
 * POST /api/admin/exams/[examId]/invitations/send - Send invitation emails (all pending or selected)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { EmailService } from '@/lib/services/email.service'

type RouteContext = {
    params: Promise<{ examId: string }>
}

const sendInvitesSchema = z.object({
    userIds: z.array(z.string().uuid()).optional(),
})

export const POST = withAdminAuth(async (req: NextRequest, _user, context: RouteContext) => {
    try {
        const { examId } = await context.params
        const body = await req.json().catch(() => ({}))
        const parsed = sendInvitesSchema.parse(body)

        const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true } })
        if (!exam) {
            return NextResponse.json(
                { success: false, error: { code: 'EXAM_NOT_FOUND', message: 'Exam not found' } },
                { status: 404 }
            )
        }

        const where = {
            examId,
            ...(Array.isArray(parsed.userIds) && parsed.userIds.length > 0 ? { userId: { in: parsed.userIds } } : {}),
            emailSentAt: null,
        }

        const pending = await prisma.examInvitation.findMany({
            where,
            select: { userId: true },
        })

        const results = { sent: 0, failed: 0 }
        for (const inv of pending) {
            const res = await EmailService.sendExamInvitation(inv.userId, examId)
            if (res.success) results.sent++
            else results.failed++
        }

        return NextResponse.json({
            success: true,
            data: results,
        })
    } catch (error) {
        console.error('Send invitation emails error:', error)
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
                    message: 'Failed to send invitation emails',
                },
            },
            { status: 500 }
        )
    }
})
