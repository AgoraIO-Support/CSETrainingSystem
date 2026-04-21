import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { createLearningEventSchema } from '@/lib/validations'
import { z } from 'zod'
import { LearningEventFormat, LearningEventStatus } from '@prisma/client'

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

export const GET = withSmeOrAdminAuth(async (req: NextRequest, user) => {
    try {
        const { searchParams } = new URL(req.url)
        const data = await TrainingOpsService.getScopedEvents(user, {
            search: searchParams.get('search') || undefined,
            format: parseFormat(searchParams.get('format')),
            status: parseStatus(searchParams.get('status')),
            seriesId: searchParams.get('seriesId') || undefined,
        })

        return NextResponse.json({
            success: true,
            data,
        })
    } catch (error) {
        console.error('Get SME learning events error:', error)

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to load SME learning events',
            },
        }, { status: error instanceof Error && error.message === 'TRAINING_OPS_FORBIDDEN' ? 403 : 500 })
    }
})

export const POST = withSmeOrAdminAuth(async (req: NextRequest, user) => {
    try {
        const body = await req.json()
        const data = createLearningEventSchema.parse(body)

        const event = await TrainingOpsService.createScopedLearningEvent(user, {
            ...data,
            scheduledAt: data.scheduledAt ?? null,
            startsAt: data.startsAt ?? null,
            endsAt: data.endsAt ?? null,
            seriesId: data.seriesId ?? null,
            domainId: data.domainId ?? null,
            description: data.description ?? null,
            releaseVersion: data.releaseVersion ?? null,
            starValue: data.starValue ?? null,
            hostId: data.hostId ?? null,
        })

        return NextResponse.json({
            success: true,
            data: event,
        }, { status: 201 })
    } catch (error) {
        console.error('Create SME learning event error:', error)

        if (error instanceof z.ZodError) {
            return NextResponse.json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid input data',
                    details: error.errors,
                },
            }, { status: 400 })
        }

        if (error instanceof Error && error.message === 'SME_DOMAIN_REQUIRED') {
            return NextResponse.json({
                success: false,
                error: {
                    code: 'SME_001',
                    message: 'SME events must be scoped to an owned domain or series.',
                },
            }, { status: 400 })
        }

        if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
            return NextResponse.json({
                success: false,
                error: {
                    code: 'AUTH_003',
                    message: 'You can only create events for your owned domains or series.',
                },
            }, { status: 403 })
        }

        if (error instanceof Error && error.message === 'INVALID_EVENT_FORMAT_FOR_SERIES') {
            return NextResponse.json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Selected event format is not allowed for the chosen learning series type.',
                },
            }, { status: 400 })
        }

        return NextResponse.json({
            success: false,
            error: {
                code: 'SYSTEM_001',
                message: 'Failed to create SME learning event',
            },
        }, { status: 500 })
    }
})
