/**
 * Admin Course Invitations Routes
 * GET /api/admin/courses/[id]/invitations - Get assigned users (enrollments)
 * POST /api/admin/courses/[id]/invitations - Assign selected users and optionally send WeCom notifications
 */

import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { inviteUsersSchema } from '@/lib/validations'
import { WecomWebhookService } from '@/lib/services/wecom-webhook.service'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { z } from 'zod'

type RouteContext = {
    params: Promise<{ id: string }>
}

export const GET = withSmeOrAdminAuth(async (_req: NextRequest, user, context: RouteContext) => {
    try {
        const { id: courseId } = await context.params

        if (user.role === 'SME') {
            await TrainingOpsService.assertScopedCourseAccess(user, courseId)
        }

        const course = await prisma.course.findUnique({
            where: { id: courseId },
            select: { id: true },
        })

        if (!course) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'COURSE_NOT_FOUND',
                        message: 'Course not found',
                    },
                },
                { status: 404 }
            )
        }

        const invitations = await prisma.enrollment.findMany({
            where: { courseId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: { enrolledAt: 'desc' },
        })

        return NextResponse.json({
            success: true,
            data: invitations,
        })
    } catch (error) {
        console.error('Get course invitations error:', error)

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
                    code: 'COURSE_001',
                    message: 'Failed to get course invitations',
                },
            },
            { status: 500 }
        )
    }
})

export const POST = withSmeOrAdminAuth(async (req: NextRequest, user, context: RouteContext) => {
    try {
        const { id: courseId } = await context.params

        if (user.role === 'SME') {
            await TrainingOpsService.assertScopedCourseAccess(user, courseId)
        }

        const body = await req.json().catch(() => ({}))
        const parsed = inviteUsersSchema.parse(body)
        const { userIds } = parsed
        const sendNotification = parsed.sendNotification ?? parsed.sendEmail ?? false

        const course = await prisma.course.findUnique({
            where: { id: courseId },
            select: { id: true, status: true },
        })

        if (!course) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'COURSE_NOT_FOUND',
                        message: 'Course not found',
                    },
                },
                { status: 404 }
            )
        }

        if (course.status !== 'PUBLISHED') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'COURSE_NOT_PUBLISHED',
                        message: 'Course must be PUBLISHED before assigning users.',
                    },
                },
                { status: 400 }
            )
        }

        const users = await prisma.user.findMany({
            where: {
                id: { in: userIds },
                status: 'ACTIVE',
            },
            select: { id: true },
        })
        const activeUserIds = new Set(users.map((u) => u.id))
        const invalidUserIds = userIds.filter((id) => !activeUserIds.has(id))
        if (invalidUserIds.length > 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'COURSE_INVALID_USERS',
                        message: 'Some selected users are invalid or inactive.',
                        details: invalidUserIds,
                    },
                },
                { status: 400 }
            )
        }

        const existing = await prisma.enrollment.findMany({
            where: {
                courseId,
                userId: { in: userIds },
            },
            select: { userId: true },
        })
        const existingSet = new Set(existing.map((e) => e.userId))
        const toCreate = userIds.filter((id) => !existingSet.has(id))

        if (toCreate.length > 0) {
            await prisma.$transaction(async (tx) => {
                await tx.enrollment.createMany({
                    data: toCreate.map((userId) => ({
                        courseId,
                        userId,
                        status: 'ACTIVE',
                        progress: 0,
                    })),
                    skipDuplicates: true,
                })

                await tx.course.update({
                    where: { id: courseId },
                    data: {
                        enrolledCount: {
                            increment: toCreate.length,
                        },
                    },
                })
            })
        }

        const notificationResults = { sent: 0, failed: 0 }
        if (sendNotification && toCreate.length > 0) {
            for (const userId of toCreate) {
                const res = await WecomWebhookService.sendCourseInvitation(userId, courseId)
                if (res.success) notificationResults.sent++
                else notificationResults.failed++
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                invited: toCreate.length,
                skipped: userIds.length - toCreate.length,
                notificationsSent: notificationResults.sent,
                notificationsFailed: notificationResults.failed,
                emailsSent: notificationResults.sent,
                emailsFailed: notificationResults.failed,
            },
        })
    } catch (error) {
        console.error('Create course invitations error:', error)

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Invalid invitation data',
                        details: error.errors,
                    },
                },
                { status: 400 }
            )
        }

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
                    code: 'COURSE_001',
                    message: 'Failed to create course invitations',
                },
            },
            { status: 500 }
        )
    }
})
