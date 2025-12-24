/**
 * Transcript Management API
 * Handles VTT upload, processing, and status for RAG
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-middleware';
import { z } from 'zod';
import { FileService } from '@/lib/services/file.service';
import prisma from '@/lib/prisma';
import { S3_ASSET_BASE_PREFIX } from '@/lib/aws-s3'
import { v4 as uuidv4 } from 'uuid'

// Validation schema for upload request
const transcriptUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.literal('text/vtt'),
  videoAssetId: z.string().uuid(),
  language: z.string().optional().default('en'),
});

/**
 * POST /api/admin/lessons/[lessonId]/transcript
 * Generate presigned URL for transcript upload
 */
export const POST = withAdminAuth(async (
  request: NextRequest,
  user,
  context: { params: Promise<{ lessonId: string }> }
) => {
  try {
    // Await params
    const params = await context.params;
    const { lessonId } = params;

    // 1. Validate request body
    const body = await request.json();
    const validatedData = transcriptUploadSchema.parse(body);

    // 2. Check if lesson exists
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { chapter: { select: { courseId: true } } },
    });

    if (!lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    // 3. Verify video asset exists
    const videoAsset = await prisma.courseAsset.findUnique({
      where: { id: validatedData.videoAssetId },
    });

    if (!videoAsset || videoAsset.type !== 'VIDEO') {
      return NextResponse.json(
        { error: 'Video asset not found or invalid type' },
        { status: 400 }
      );
    }

    // 4. Check if transcript already exists for this lesson + video
    const existingTranscript = await prisma.transcriptAsset.findUnique({
      where: {
        lessonId_videoAssetId: {
          lessonId,
          videoAssetId: validatedData.videoAssetId,
        },
      },
    });

    // 5. If transcript exists, delete it first (replace mode)
    if (existingTranscript) {
      await prisma.transcriptAsset.delete({
        where: { id: existingTranscript.id },
      });

      // Optionally delete old S3 file
      try {
        await FileService.deleteFile(existingTranscript.s3Key);
      } catch (s3Error) {
        console.warn('Failed to delete old S3 file:', s3Error);
        // Don't fail the request if S3 deletion fails
      }
    }

    // 6. Generate a stable S3 key under:
    //    <AWS_S3_ASSET_PREFIX>/<courseId>/<lessonId>/<transcriptId>.vtt
    // `AWS_S3_ASSET_PREFIX` should be `assets` in production to match CloudFront `/assets/*`.
    const transcriptId = uuidv4()
    const key = [S3_ASSET_BASE_PREFIX, lesson.chapter.courseId, lessonId, `${transcriptId}.vtt`]
      .filter(Boolean)
      .map((s) => String(s).replace(/^\/+|\/+$/g, ''))
      .join('/')

    // 7. Generate presigned URL for upload
    const uploadData = await FileService.generateTranscriptUploadUrl({
      filename: validatedData.filename,
      lessonId,
      key,
    });

    // 8. Create TranscriptAsset record (do not store expiring access URL)
    const transcriptAsset = await prisma.transcriptAsset.create({
      data: {
        id: transcriptId,
        lessonId,
        videoAssetId: validatedData.videoAssetId,
        filename: validatedData.filename,
        s3Key: uploadData.key,
        url: null,
        language: validatedData.language,
        status: 'PENDING',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        uploadUrl: uploadData.uploadUrl,
        s3Key: uploadData.key,
        transcriptAsset: {
          id: transcriptAsset.id,
          lessonId: transcriptAsset.lessonId,
          videoAssetId: transcriptAsset.videoAssetId,
          status: transcriptAsset.status,
          filename: transcriptAsset.filename,
        },
        expiresIn: uploadData.expiresIn,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Transcript upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

/**
 * GET /api/admin/lessons/[lessonId]/transcript
 * Get transcript status and information
 */
export const GET = withAdminAuth(async (
  request: NextRequest,
  user,
  context: { params: Promise<{ lessonId: string }> }
) => {
  try {
    // Await params
    const params = await context.params;
    const { lessonId } = params;

    // 1. Get lesson with transcripts
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        transcripts: {
          include: {
            chunks: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    // Get transcript (if exists)
    const transcript = lesson.transcripts[0]; // Assuming one transcript per lesson

    if (!transcript) {
      return NextResponse.json({
        success: true,
        data: {
          transcriptAsset: null,
          processing: null,
          knowledgeBase: {
            isReady: false,
            chunkCount: 0,
            tokenCount: 0,
            lastUpdated: null,
          },
        },
      });
    }

    // Calculate processing progress
    const latestJob = await prisma.transcriptProcessingJob.findFirst({
      where: { transcriptId: transcript.id },
      orderBy: { createdAt: 'desc' },
    });

    const totalChunks = latestJob?.totalChunks ?? transcript.chunks.length;
    const embeddedCount = latestJob?.processedChunks ?? 0;

    const effectiveStatus = latestJob?.stage ?? transcript.status;
    const progress = latestJob?.progress ?? 0;

    // Get total token count
    const tokenStats = await prisma.transcriptChunk.aggregate({
      where: { transcriptId: transcript.id },
      _sum: { tokenCount: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        transcriptAsset: {
          id: transcript.id,
          filename: transcript.filename,
          s3Key: transcript.s3Key,
          url: transcript.s3Key ? await FileService.getAssetAccessUrl(transcript.s3Key) : null,
          language: transcript.language,
          uploadedAt: transcript.createdAt.toISOString(),
        },
        processing: {
          status: effectiveStatus,
          progress,
          totalChunks,
          processedChunks: embeddedCount,
          error: latestJob?.errorMessage ?? transcript.errorMessage,
          processedAt: transcript.processedAt?.toISOString() || null,
          job: latestJob
            ? {
                id: latestJob.id,
                state: latestJob.state,
                stage: latestJob.stage,
                attempt: latestJob.attempt,
                maxAttempts: latestJob.maxAttempts,
                scheduledAt: latestJob.scheduledAt.toISOString(),
                startedAt: latestJob.startedAt?.toISOString() || null,
                finishedAt: latestJob.finishedAt?.toISOString() || null,
                lastHeartbeatAt: latestJob.lastHeartbeatAt?.toISOString() || null,
                workerId: latestJob.workerId || null,
              }
            : null,
        },
        knowledgeBase: {
          isReady: transcript.status === 'READY',
          chunkCount: totalChunks,
          tokenCount: Number(tokenStats._sum.tokenCount || 0),
          lastUpdated: transcript.processedAt?.toISOString() || null,
        },
      },
    });
  } catch (error) {
    console.error('Get transcript error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/admin/lessons/[lessonId]/transcript
 * Delete transcript and all associated chunks
 */
export const DELETE = withAdminAuth(async (
  request: NextRequest,
  user,
  context: { params: Promise<{ lessonId: string }> }
) => {
  try {
    // Await params
    const params = await context.params;
    const { lessonId } = params;

    // 1. Get lesson with transcripts
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        transcripts: true,
      },
    });

    if (!lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    const transcript = lesson.transcripts[0];

    if (!transcript) {
      return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
    }

    // 2. Delete transcript (cascades to chunks via Prisma)
    await prisma.transcriptAsset.delete({
      where: { id: transcript.id },
    });

    // 3. Optionally delete S3 file
    try {
      await FileService.deleteFile(transcript.s3Key);
    } catch (s3Error) {
      console.warn('Failed to delete S3 file:', s3Error);
      // Don't fail the request if S3 deletion fails
    }

    return NextResponse.json({
      success: true,
      message: 'Transcript deleted successfully',
    });
  } catch (error) {
    console.error('Delete transcript error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
