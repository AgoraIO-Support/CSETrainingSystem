import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { ProgressService } from '@/lib/services/progress.service'
import { updateProgressSchema } from '@/lib/validations'
import { z } from 'zod'

export const POST = withAuth(async (req, user, { params }: { params: Promise<{ lessonId: string }> }) => {
    try {
        const body = await req.json()
        const { lessonId } = await params

        // Validate request body
        const validatedData = updateProgressSchema.parse(body)

        // Update progress
        const progress = await ProgressService.updateLessonProgress(
            user.id,
            lessonId,
            validatedData
        )

        return NextResponse.json({
            success: true,
            data: progress,
            message: 'Progress updated successfully',
        })
    } catch (error) {
        console.error('Update progress error:', error)

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
            if (error.message === 'LESSON_NOT_FOUND') {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'LESSON_001',
                            message: 'Lesson not found',
                        },
                    },
                    { status: 404 }
                )
            }

            if (error.message === 'NOT_ENROLLED') {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'COURSE_003',
                            message: 'Not enrolled in this course',
                        },
                    },
                    { status: 403 }
                )
            }
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'SYSTEM_001',
                    message: 'Failed to update progress',
                },
            },
            { status: 500 }
        )
    }
})
