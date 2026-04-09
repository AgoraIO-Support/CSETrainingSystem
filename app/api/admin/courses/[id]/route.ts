import { NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { CourseService } from '@/lib/services/course.service'
import { CascadeDeleteService } from '@/lib/services/cascade-delete.service'
import { updateCourseSchema } from '@/lib/validations'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { WecomWebhookService } from '@/lib/services/wecom-webhook.service'
import { TrainingOpsService } from '@/lib/services/training-ops.service'

export const PUT = withSmeOrAdminAuth(async (req, user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params
        if (user.role === 'SME') {
            await TrainingOpsService.assertScopedCourseAccess(user, id)
        }
        const body = await req.json()
        const sendNotification = body?.sendNotification === true
        const data = updateCourseSchema.parse(body)
        const previous = await prisma.course.findUnique({
            where: { id },
            select: { id: true, status: true },
        })

        const course = await CourseService.updateCourse(id, data)
        const notificationResults = { sent: 0, failed: 0, recipients: 0 }

        if (
            user.role === 'ADMIN' &&
            sendNotification &&
            previous &&
            previous.status !== 'PUBLISHED' &&
            course.status === 'PUBLISHED'
        ) {
            const recipients = await prisma.enrollment.findMany({
                where: {
                    courseId: id,
                    user: { status: 'ACTIVE' },
                },
                select: { userId: true },
                distinct: ['userId'],
            })
            notificationResults.recipients = recipients.length

            for (const recipient of recipients) {
                const result = await WecomWebhookService.sendCoursePublished(recipient.userId, id)
                if (result.success) notificationResults.sent++
                else notificationResults.failed++
            }
        }

        return NextResponse.json({
            success: true,
            data: course,
            meta: {
                notificationsSent: notificationResults.sent,
                notificationsFailed: notificationResults.failed,
                notificationRecipients: notificationResults.recipients,
            },
        })
    } catch (error) {
        console.error('Update course error:', error)

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Invalid input data',
                        details: error.errors,
                    },
                },
                { status: 400 }
            )
        }

        if (error instanceof Error && error.message === 'SLUG_EXISTS') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'COURSE_004',
                        message: 'Slug already in use',
                    },
                },
                { status: 409 }
            )
        }

        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'TRAINING_OPS_SCOPE_FORBIDDEN',
                        message: 'You do not have access to this course',
                    },
                },
                { status: 403 }
            )
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to update course',
                },
            },
            { status: 500 }
        )
    }
})

export const DELETE = withSmeOrAdminAuth(async (req, user, { params }: { params: Promise<{ id: string }> }) => {
    try {
        const { id } = await params
        if (user.role === 'SME') {
            await TrainingOpsService.assertScopedCourseAccess(user, id)
        }

        await CascadeDeleteService.deleteCourseCascade(id)

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Course delete error:', error)

        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json(
                { success: false, error: { code: 'TRAINING_OPS_SCOPE_FORBIDDEN', message: 'You do not have access to this course' } },
                { status: 403 }
            )
        }

        // S3 cleanup failure returns 502 to indicate partial failure
        if (error instanceof Error && error.message.startsWith('S3_CLEANUP_FAILED')) {
            return NextResponse.json(
                { success: false, error: { code: 'S3_CLEANUP_FAILED', message: error.message } },
                { status: 502 }
            )
        }

        return NextResponse.json(
            { success: false, error: { code: 'SYSTEM_001', message: 'Failed to delete course' } },
            { status: 500 }
        )
    }
})
