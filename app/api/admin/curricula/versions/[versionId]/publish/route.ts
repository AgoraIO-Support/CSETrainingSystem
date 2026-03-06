import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { CourseService } from '@/lib/services/course.service'
import prisma from '@/lib/prisma'
import { WecomWebhookService } from '@/lib/services/wecom-webhook.service'

// Publish a curriculum version (maps to course status)
export const POST = withAdminAuth(async (req, _user, { params }: { params: Promise<{ versionId: string }> }) => {
    try {
        const { versionId } = await params
        const body = await req.json().catch(() => ({}))
        const sendNotification = body?.sendNotification === true
        const previous = await prisma.course.findUnique({
            where: { id: versionId },
            select: { id: true, status: true },
        })
        const course = await CourseService.updateCourse(versionId, { status: 'PUBLISHED' })
        const notificationResults = { sent: 0, failed: 0, recipients: 0 }

        if (sendNotification && previous && previous.status !== 'PUBLISHED' && course.status === 'PUBLISHED') {
            const recipients = await prisma.enrollment.findMany({
                where: {
                    courseId: versionId,
                    user: { status: 'ACTIVE' },
                },
                select: { userId: true },
                distinct: ['userId'],
            })
            notificationResults.recipients = recipients.length

            for (const recipient of recipients) {
                const result = await WecomWebhookService.sendCoursePublished(recipient.userId, versionId)
                if (result.success) notificationResults.sent++
                else notificationResults.failed++
            }
        }

        return NextResponse.json({
            success: true,
            version: course,
            meta: {
                notificationsSent: notificationResults.sent,
                notificationsFailed: notificationResults.failed,
                notificationRecipients: notificationResults.recipients,
            },
        })
    } catch (error) {
        if (error instanceof Error && error.message === 'COURSE_NOT_FOUND') {
            return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 })
        }
        return NextResponse.json({ success: false, error: { code: 'SYSTEM_ERROR' } }, { status: 500 })
    }
})
