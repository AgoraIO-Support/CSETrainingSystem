/**
 * Transcript Management API
 * Handles multi-language VTT upload, status, and deletion.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withSmeOrAdminAuth } from '@/lib/auth-middleware'
import { z } from 'zod'
import { FileService } from '@/lib/services/file.service'
import prisma from '@/lib/prisma'
import { S3_ASSET_BASE_PREFIX } from '@/lib/aws-s3'
import { v4 as uuidv4 } from 'uuid'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import {
    getActiveTranscriptTracks,
    getDefaultSubtitleTrack,
    getPrimaryAiTranscriptTrack,
    getTranscriptLabel,
    inferTranscriptLanguageFromFilename,
    normalizeTranscriptLanguage,
} from '@/lib/transcript-tracks'

const transcriptUploadSchema = z.object({
    filename: z.string().min(1).max(255),
    contentType: z.literal('text/vtt'),
    videoAssetId: z.string().uuid(),
    languageCode: z.string().min(2).max(20).optional(),
    language: z.string().min(2).max(20).optional(),
    label: z.string().trim().max(80).optional().nullable(),
    replaceExistingLanguage: z.boolean().optional().default(true),
    setAsDefaultSubtitle: z.boolean().optional(),
    setAsPrimaryForAI: z.boolean().optional(),
})

const transcriptUpdateSchema = z.object({
    transcriptId: z.string().uuid(),
    label: z.string().trim().max(80).optional().nullable(),
    setAsDefaultSubtitle: z.boolean().optional(),
    setAsPrimaryForAI: z.boolean().optional(),
})

function mapTrack(track: {
    id: string
    lessonId: string
    videoAssetId: string
    filename: string
    s3Key: string
    language: string
    label: string | null
    isDefaultSubtitle: boolean
    isPrimaryForAI: boolean
    isActive: boolean
    status: string
    createdAt: Date
    processedAt: Date | null
}, url: string | null) {
    return {
        id: track.id,
        lessonId: track.lessonId,
        videoAssetId: track.videoAssetId,
        filename: track.filename,
        s3Key: track.s3Key,
        url,
        language: track.language,
        label: track.label ?? getTranscriptLabel(track),
        isDefaultSubtitle: track.isDefaultSubtitle,
        isPrimaryForAI: track.isPrimaryForAI,
        isActive: track.isActive,
        status: track.status,
        uploadedAt: track.createdAt.toISOString(),
        processedAt: track.processedAt?.toISOString() ?? null,
    }
}

async function getLessonTracks(lessonId: string) {
    return prisma.transcriptAsset.findMany({
        where: { lessonId },
        include: {
            chunks: {
                select: { id: true },
            },
        },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    })
}

/**
 * POST /api/admin/lessons/[lessonId]/transcript
 * Generate presigned URL for transcript upload.
 */
export const POST = withSmeOrAdminAuth(async (request: NextRequest, user, context: { params: Promise<{ lessonId: string }> }) => {
    try {
        const { lessonId } = await context.params
        if (user.role === 'SME') await TrainingOpsService.assertScopedLessonAccess(user, lessonId)
        const body = await request.json()
        const validatedData = transcriptUploadSchema.parse(body)

        const lesson = await prisma.lesson.findUnique({
            where: { id: lessonId },
            include: {
                chapter: { select: { courseId: true } },
            },
        })

        if (!lesson) {
            return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
        }

        const videoAsset = await prisma.courseAsset.findUnique({
            where: { id: validatedData.videoAssetId },
        })

        if (!videoAsset || videoAsset.type !== 'VIDEO') {
            return NextResponse.json({ error: 'Video asset not found or invalid type' }, { status: 400 })
        }

        const transcriptId = uuidv4()
        const inferredLanguage = inferTranscriptLanguageFromFilename(validatedData.filename)
        const requestedLanguage = validatedData.languageCode ?? validatedData.language ?? null
        const language = inferredLanguage ?? normalizeTranscriptLanguage(requestedLanguage ?? 'en')
        const label = validatedData.label?.trim() || null
        const key = [S3_ASSET_BASE_PREFIX, lesson.chapter.courseId, lessonId, `${transcriptId}.vtt`]
            .filter(Boolean)
            .map((segment) => String(segment).replace(/^\/+|\/+$/g, ''))
            .join('/')

        const activeTracks = await prisma.transcriptAsset.findMany({
            where: {
                lessonId,
                isActive: true,
                archivedAt: null,
            },
        })
        const remainingActiveTracks = validatedData.replaceExistingLanguage
            ? activeTracks.filter(
                (track) => !(track.videoAssetId === validatedData.videoAssetId && track.language === language)
            )
            : activeTracks

        const hasDefaultForVideo = remainingActiveTracks.some(
            (track) => track.videoAssetId === validatedData.videoAssetId && track.isDefaultSubtitle
        )
        const hasPrimaryForLesson = remainingActiveTracks.some((track) => track.isPrimaryForAI)
        const shouldSetDefault = validatedData.setAsDefaultSubtitle ?? !hasDefaultForVideo
        const shouldSetPrimary = validatedData.setAsPrimaryForAI ?? !hasPrimaryForLesson

        const uploadData = await FileService.generateTranscriptUploadUrl({
            filename: validatedData.filename,
            lessonId,
            key,
        })

        await prisma.$transaction(async (tx) => {
            if (validatedData.replaceExistingLanguage) {
                await tx.transcriptAsset.updateMany({
                    where: {
                        lessonId,
                        videoAssetId: validatedData.videoAssetId,
                        language,
                        isActive: true,
                        archivedAt: null,
                    },
                    data: {
                        isActive: false,
                        isDefaultSubtitle: false,
                        isPrimaryForAI: false,
                        archivedAt: new Date(),
                    },
                })
            }

            if (shouldSetDefault) {
                await tx.transcriptAsset.updateMany({
                    where: {
                        videoAssetId: validatedData.videoAssetId,
                        isActive: true,
                        archivedAt: null,
                        isDefaultSubtitle: true,
                    },
                    data: {
                        isDefaultSubtitle: false,
                    },
                })
            }

            if (shouldSetPrimary) {
                await tx.transcriptAsset.updateMany({
                    where: {
                        lessonId,
                        isActive: true,
                        archivedAt: null,
                        isPrimaryForAI: true,
                    },
                    data: {
                        isPrimaryForAI: false,
                    },
                })
            }

            await tx.transcriptAsset.create({
                data: {
                    id: transcriptId,
                    lessonId,
                    videoAssetId: validatedData.videoAssetId,
                    filename: validatedData.filename,
                    s3Key: uploadData.key,
                    url: null,
                    language,
                    label,
                    isDefaultSubtitle: shouldSetDefault,
                    isPrimaryForAI: shouldSetPrimary,
                    isActive: true,
                    status: 'PENDING',
                    sourceType: 'MANUAL',
                },
            })
        })

        return NextResponse.json({
            success: true,
            data: {
                uploadUrl: uploadData.uploadUrl,
                s3Key: uploadData.key,
                transcriptAsset: {
                    id: transcriptId,
                    lessonId,
                    videoAssetId: validatedData.videoAssetId,
                    status: 'PENDING',
                    filename: validatedData.filename,
                    language,
                    label: label ?? getTranscriptLabel({ language, label }),
                    isDefaultSubtitle: shouldSetDefault,
                    isPrimaryForAI: shouldSetPrimary,
                },
                expiresIn: uploadData.expiresIn,
            },
        })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 })
        }

        console.error('Transcript upload error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
})

/**
 * GET /api/admin/lessons/[lessonId]/transcript
 * Get transcript tracks and the current primary AI status.
 */
export const GET = withSmeOrAdminAuth(async (_request: NextRequest, user, context: { params: Promise<{ lessonId: string }> }) => {
    try {
        const { lessonId } = await context.params
        if (user.role === 'SME') await TrainingOpsService.assertScopedLessonAccess(user, lessonId)

        const lesson = await prisma.lesson.findUnique({
            where: { id: lessonId },
            select: { id: true },
        })

        if (!lesson) {
            return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
        }

        const tracks = await getLessonTracks(lessonId)
        const activeTracks = getActiveTranscriptTracks(tracks)
        const primaryAiTrack = getPrimaryAiTranscriptTrack(activeTracks)
        const selectedTrack = primaryAiTrack ?? activeTracks[0] ?? null

        if (!selectedTrack) {
            return NextResponse.json({
                success: true,
                data: {
                    transcriptAsset: null,
                    tracks: [],
                    primaryAiTrackId: null,
                    defaultSubtitleTrackId: null,
                    processing: null,
                    knowledgeBase: {
                        isReady: false,
                        chunkCount: 0,
                        tokenCount: 0,
                        lastUpdated: null,
                    },
                },
            })
        }

        const latestJob = await prisma.transcriptProcessingJob.findFirst({
            where: { transcriptId: selectedTrack.id },
            orderBy: { createdAt: 'desc' },
        })

        const totalChunks = latestJob?.totalChunks ?? selectedTrack.chunks.length
        const processedChunks = latestJob?.processedChunks ?? 0
        const effectiveStatus = latestJob?.stage ?? selectedTrack.status
        const progress = latestJob?.progress ?? 0

        const tokenStats = await prisma.transcriptChunk.aggregate({
            where: { transcriptId: selectedTrack.id },
            _sum: { tokenCount: true },
        })

        const mappedTracks = await Promise.all(
            activeTracks.map(async (track) =>
                mapTrack(track, track.s3Key ? await FileService.getAssetAccessUrl(track.s3Key) : null)
            )
        )

        return NextResponse.json({
            success: true,
            data: {
                transcriptAsset: await (async () =>
                    mapTrack(
                        selectedTrack,
                        selectedTrack.s3Key ? await FileService.getAssetAccessUrl(selectedTrack.s3Key) : null
                    ))(),
                tracks: mappedTracks,
                primaryAiTrackId: primaryAiTrack?.id ?? null,
                defaultSubtitleTrackId: getDefaultSubtitleTrack(activeTracks)?.id ?? null,
                processing: {
                    status: effectiveStatus,
                    progress,
                    totalChunks,
                    processedChunks,
                    error: latestJob?.errorMessage ?? selectedTrack.errorMessage,
                    processedAt: selectedTrack.processedAt?.toISOString() ?? null,
                    job: latestJob
                        ? {
                            id: latestJob.id,
                            state: latestJob.state,
                            stage: latestJob.stage,
                            attempt: latestJob.attempt,
                            maxAttempts: latestJob.maxAttempts,
                            scheduledAt: latestJob.scheduledAt.toISOString(),
                            startedAt: latestJob.startedAt?.toISOString() ?? null,
                            finishedAt: latestJob.finishedAt?.toISOString() ?? null,
                            lastHeartbeatAt: latestJob.lastHeartbeatAt?.toISOString() ?? null,
                            workerId: latestJob.workerId || null,
                        }
                        : null,
                },
                knowledgeBase: {
                    isReady: selectedTrack.status === 'READY',
                    chunkCount: totalChunks,
                    tokenCount: Number(tokenStats._sum.tokenCount || 0),
                    lastUpdated: selectedTrack.processedAt?.toISOString() ?? null,
                },
            },
        })
    } catch (error) {
        console.error('Get transcript error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
})

/**
 * PATCH /api/admin/lessons/[lessonId]/transcript
 * Update transcript track metadata/flags.
 */
export const PATCH = withSmeOrAdminAuth(async (request: NextRequest, user, context: { params: Promise<{ lessonId: string }> }) => {
    try {
        const { lessonId } = await context.params
        if (user.role === 'SME') await TrainingOpsService.assertScopedLessonAccess(user, lessonId)
        const body = await request.json()
        const validatedData = transcriptUpdateSchema.parse(body)

        const target = await prisma.transcriptAsset.findFirst({
            where: {
                id: validatedData.transcriptId,
                lessonId,
                isActive: true,
                archivedAt: null,
            },
        })

        if (!target) {
            return NextResponse.json({ error: 'Transcript track not found' }, { status: 404 })
        }

        await prisma.$transaction(async (tx) => {
            if (validatedData.setAsDefaultSubtitle) {
                await tx.transcriptAsset.updateMany({
                    where: {
                        videoAssetId: target.videoAssetId,
                        isActive: true,
                        archivedAt: null,
                        isDefaultSubtitle: true,
                    },
                    data: { isDefaultSubtitle: false },
                })
            }

            if (validatedData.setAsPrimaryForAI) {
                await tx.transcriptAsset.updateMany({
                    where: {
                        lessonId,
                        isActive: true,
                        archivedAt: null,
                        isPrimaryForAI: true,
                    },
                    data: { isPrimaryForAI: false },
                })
            }

            await tx.transcriptAsset.update({
                where: { id: target.id },
                data: {
                    label: validatedData.label === undefined ? undefined : validatedData.label?.trim() || null,
                    isDefaultSubtitle: validatedData.setAsDefaultSubtitle === undefined ? undefined : validatedData.setAsDefaultSubtitle,
                    isPrimaryForAI: validatedData.setAsPrimaryForAI === undefined ? undefined : validatedData.setAsPrimaryForAI,
                },
            })
        })

        return NextResponse.json({
            success: true,
            message: 'Transcript track updated successfully',
        })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 })
        }

        console.error('Update transcript error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
})

/**
 * DELETE /api/admin/lessons/[lessonId]/transcript?transcriptId=...
 * Delete a specific transcript track.
 */
export const DELETE = withSmeOrAdminAuth(async (request: NextRequest, user, context: { params: Promise<{ lessonId: string }> }) => {
    try {
        const { lessonId } = await context.params
        if (user.role === 'SME') await TrainingOpsService.assertScopedLessonAccess(user, lessonId)
        const { searchParams } = new URL(request.url)
        const transcriptId = searchParams.get('transcriptId')

        const tracks = await prisma.transcriptAsset.findMany({
            where: { lessonId },
            orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
        })

        if (tracks.length === 0) {
            return NextResponse.json({ error: 'Transcript not found' }, { status: 404 })
        }

        const activeTracks = getActiveTranscriptTracks(tracks)
        const target =
            (transcriptId ? tracks.find((track) => track.id === transcriptId) : null) ??
            getPrimaryAiTranscriptTrack(activeTracks) ??
            tracks[0]

        if (!target) {
            return NextResponse.json({ error: 'Transcript not found' }, { status: 404 })
        }

        const siblingActiveTracks = activeTracks.filter((track) => track.id !== target.id)
        const nextPrimary = target.isPrimaryForAI ? getPrimaryAiTranscriptTrack(siblingActiveTracks) : null
        const nextDefault = target.isDefaultSubtitle
            ? getDefaultSubtitleTrack(
                siblingActiveTracks.filter((track) => track.videoAssetId === target.videoAssetId)
            )
            : null

        await prisma.$transaction(async (tx) => {
            await tx.transcriptAsset.delete({
                where: { id: target.id },
            })

            if (nextPrimary) {
                await tx.transcriptAsset.update({
                    where: { id: nextPrimary.id },
                    data: { isPrimaryForAI: true },
                })
            }

            if (nextDefault) {
                await tx.transcriptAsset.update({
                    where: { id: nextDefault.id },
                    data: { isDefaultSubtitle: true },
                })
            }
        })

        try {
            await FileService.deleteFile(target.s3Key)
        } catch (s3Error) {
            console.warn('Failed to delete S3 file:', s3Error)
        }

        return NextResponse.json({
            success: true,
            message: 'Transcript deleted successfully',
        })
    } catch (error) {
        console.error('Delete transcript error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
})
