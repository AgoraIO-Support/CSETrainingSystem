import { NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { MaterialService } from '@/lib/services/material.service'
import { z } from 'zod'
import { LessonAssetType } from '@prisma/client'

const createMaterialSchema = z.object({
    courseId: z.string().uuid(),
    title: z.string().min(1),
    description: z.string().optional(),
    type: z.nativeEnum(LessonAssetType),
    s3Key: z.string().min(1),
    cloudfrontUrl: z.string().url(),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().positive().optional(),
    durationSeconds: z.number().int().positive().optional(),
})

// POST /api/admin/materials - Create a new course asset (material)
export const POST = withAdminAuth(async (req, user) => {
    try {
        const body = await req.json()
        const payload = createMaterialSchema.parse(body)

        const material = await MaterialService.createMaterial(payload)

        return NextResponse.json({ success: true, data: material })
    } catch (error) {
        console.error('Create material error:', error)

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input data', details: error.errors } },
                { status: 400 }
            )
        }

        return NextResponse.json(
            { success: false, error: { code: 'SYSTEM_001', message: 'Failed to create material' } },
            { status: 500 }
        )
    }
})
