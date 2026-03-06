/**
 * Admin Course Invitation Notification Route
 * POST /api/admin/courses/[id]/invitations/send - Send WeCom notifications
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { WecomWebhookService } from '@/lib/services/wecom-webhook.service'

type RouteContext = {
    params: Promise<{ id: string }>
}

const sendInvitesSchema = z.object({
    userIds: z.array(z.string().uuid()).optional(),
})

export const POST = withAdminAuth(async (req: NextRequest, _user, context: RouteContext) => {
    try {
        const { id: courseId } = await context.params
        const body = await req.json().catch(() => ({}))
        const parsed = sendInvitesSchema.parse(body)

        const course = await prisma.course.findUnique({
            where: { id: courseId },
            select: { id: true, status: true },
        })
        if (!course) {
            return NextResponse.json(
                { success: false, error: { code: 'COURSE_NOT_FOUND', message: 'Course not found' } },
                { status: 404 }
            )
        }

        const hasSelectedUsers = Array.isArray(parsed.userIds) && parsed.userIds.length > 0
        const where = {
            courseId,
            ...(hasSelectedUsers ? { userId: { in: parsed.userIds } } : {}),
        }

        const targets = await prisma.enrollment.findMany({
            where,
            select: { userId: true },
        })

        const results = { sent: 0, failed: 0 }
        for (const target of targets) {
            const res = await WecomWebhookService.sendCourseInvitation(target.userId, courseId)
            if (res.success) results.sent++
            else results.failed++
        }

        return NextResponse.json({
            success: true,
            data: results,
        })
    } catch (error) {
        console.error('Send course invitation notifications error:', error)
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
                    code: 'COURSE_001',
                    message: 'Failed to send course invitation notifications',
                },
            },
            { status: 500 }
        )
    }
})
