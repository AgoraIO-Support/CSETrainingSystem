import { NextRequest, NextResponse } from 'next/server'
import { LearningEventFormat, LearningEventStatus } from '@prisma/client'
import { withAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { createLearningEventSchema } from '@/lib/validations'
import { z } from 'zod'

const parseFormat = (value: string | null): LearningEventFormat | undefined => {
    if (
        value === 'CASE_STUDY' ||
        value === 'KNOWLEDGE_SHARING' ||
        value === 'FAQ_SHARE' ||
        value === 'RELEASE_BRIEFING' ||
        value === 'QUIZ_REVIEW' ||
        value === 'FINAL_EXAM' ||
        value === 'WORKSHOP'
    ) {
        return value
    }
    return undefined
}

const parseStatus = (value: string | null): LearningEventStatus | undefined => {
    if (
        value === 'DRAFT' ||
        value === 'SCHEDULED' ||
        value === 'IN_PROGRESS' ||
        value === 'COMPLETED' ||
        value === 'CANCELED'
    ) {
        return value
    }
    return undefined
}

const parseDate = (value: string | null): Date | undefined => {
    if (!value) return undefined
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
        return undefined
    }
    return parsed
}

export const GET = withAdminAuth(async (req: NextRequest) => {
    try {
        const { searchParams } = new URL(req.url)

        const page = Number(searchParams.get('page') || '1')
        const limit = Number(searchParams.get('limit') || '20')
        const search = searchParams.get('search') || undefined
        const domainId = searchParams.get('domainId') || undefined
        const seriesId = searchParams.get('seriesId') || undefined
        const format = parseFormat(searchParams.get('format'))
        const status = parseStatus(searchParams.get('status'))
        const startDate = parseDate(searchParams.get('startDate'))
        const endDate = parseDate(searchParams.get('endDate'))

        const data = await TrainingOpsService.getLearningEvents({
            page,
            limit,
            search,
            domainId,
            seriesId,
            format,
            status,
            startDate,
            endDate,
        })

        return NextResponse.json({
            success: true,
            data: data.events,
            pagination: data.pagination,
        })
    } catch (error) {
        console.error('List learning events error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to load learning events',
                },
            },
            { status: 500 }
        )
    }
})

export const POST = withAdminAuth(async (req: NextRequest, user) => {
    try {
        const body = await req.json()
        const data = createLearningEventSchema.parse(body)

        const event = await TrainingOpsService.createLearningEvent(
            {
                ...data,
                seriesId: data.seriesId ?? null,
                domainId: data.domainId ?? null,
                description: data.description ?? null,
                releaseVersion: data.releaseVersion ?? null,
                scheduledAt: data.scheduledAt ?? null,
                startsAt: data.startsAt ?? null,
                endsAt: data.endsAt ?? null,
                starValue: data.starValue ?? null,
                hostId: data.hostId ?? null,
            },
            user.id
        )

        return NextResponse.json(
            {
                success: true,
                data: event,
            },
            { status: 201 }
        )
    } catch (error) {
        console.error('Create learning event error:', error)

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

        if (error instanceof Error) {
            const errorMessages: Record<string, { status: number; message: string }> = {
                CREATOR_NOT_FOUND: { status: 404, message: 'Creator not found' },
                LEARNING_SERIES_NOT_FOUND: { status: 404, message: 'Learning series not found' },
                PRODUCT_DOMAIN_NOT_FOUND: { status: 404, message: 'Product domain not found' },
                HOST_NOT_FOUND: { status: 404, message: 'Host user not found or inactive' },
                SERIES_DOMAIN_MISMATCH: { status: 400, message: 'Selected series does not belong to the selected product domain' },
                INVALID_EVENT_TIME_RANGE: { status: 400, message: 'Event end time must be later than the scheduled or start time' },
            }

            const mapped = errorMessages[error.message]
            if (mapped) {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'VALIDATION_ERROR',
                            message: mapped.message,
                        },
                    },
                    { status: mapped.status }
                )
            }
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to create learning event',
                },
            },
            { status: 500 }
        )
    }
})
