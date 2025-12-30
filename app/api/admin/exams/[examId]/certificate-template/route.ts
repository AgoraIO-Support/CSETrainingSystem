/**
 * Admin Exam Certificate Template Routes
 * GET /api/admin/exams/[examId]/certificate-template - Get certificate template
 * PUT /api/admin/exams/[examId]/certificate-template - Create/update certificate template
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { CertificateBadgeMode } from '@prisma/client'

type RouteContext = {
    params: Promise<{ examId: string }>
}

const templateSchema = z.object({
    isEnabled: z.boolean().default(true),
    title: z.string().min(1).max(120),
    badgeMode: z.nativeEnum(CertificateBadgeMode).default(CertificateBadgeMode.AUTO),
    badgeS3Key: z.string().min(1).optional().nullable(),
    badgeMimeType: z.string().min(1).optional().nullable(),
    badgeStyle: z.any().optional().nullable(),
}).superRefine((value, ctx) => {
    if (value.badgeMode === CertificateBadgeMode.UPLOADED) {
        if (!value.badgeS3Key) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'badgeS3Key is required for uploaded badges', path: ['badgeS3Key'] })
        }
        if (!value.badgeMimeType) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'badgeMimeType is required for uploaded badges', path: ['badgeMimeType'] })
        } else if (!['image/png', 'image/jpeg'].includes(value.badgeMimeType)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'badgeMimeType must be image/png or image/jpeg', path: ['badgeMimeType'] })
        }
    }
})

export const GET = withAdminAuth(async (_req: NextRequest, _user, context: RouteContext) => {
    try {
        const { examId } = await context.params

        const template = await prisma.examCertificateTemplate.findUnique({
            where: { examId },
        })

        return NextResponse.json({
            success: true,
            data: template,
        })
    } catch (error) {
        console.error('Get exam certificate template error:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'CERT_TEMPLATE_001',
                    message: 'Failed to get certificate template',
                },
            },
            { status: 500 }
        )
    }
})

export const PUT = withAdminAuth(async (req: NextRequest, _user, context: RouteContext) => {
    try {
        const { examId } = await context.params
        const body = await req.json()
        const data = templateSchema.parse(body)

        const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true } })
        if (!exam) {
            return NextResponse.json(
                {
                    success: false,
                    error: { code: 'EXAM_NOT_FOUND', message: 'Exam not found' },
                },
                { status: 404 }
            )
        }

        const template = await prisma.examCertificateTemplate.upsert({
            where: { examId },
            create: {
                examId,
                isEnabled: data.isEnabled,
                title: data.title,
                badgeMode: data.badgeMode,
                badgeS3Key: data.badgeS3Key ?? undefined,
                badgeMimeType: data.badgeMimeType ?? undefined,
                badgeStyle: data.badgeStyle ?? undefined,
            },
            update: {
                isEnabled: data.isEnabled,
                title: data.title,
                badgeMode: data.badgeMode,
                badgeS3Key: data.badgeS3Key ?? undefined,
                badgeMimeType: data.badgeMimeType ?? undefined,
                badgeStyle: data.badgeStyle ?? undefined,
            },
        })

        return NextResponse.json({
            success: true,
            data: template,
        })
    } catch (error) {
        console.error('Upsert exam certificate template error:', error)

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

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'CERT_TEMPLATE_002',
                    message: 'Failed to save certificate template',
                },
            },
            { status: 500 }
        )
    }
})

