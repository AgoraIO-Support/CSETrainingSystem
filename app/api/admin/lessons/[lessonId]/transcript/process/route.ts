/**
 * Transcript Processing API
 * Triggers RAG processing for uploaded VTT files
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-middleware';
import prisma from '@/lib/prisma';
import { TranscriptJobService } from '@/lib/services/transcript-job.service';

/**
 * POST /api/admin/lessons/[lessonId]/transcript/process
 * Enqueue transcript processing for RAG (async worker required)
 */
export const POST = withAdminAuth(async (
  request: NextRequest,
  user,
  context: { params: Promise<{ lessonId: string }> }
) => {
  try {
    // Await params
    const params: { lessonId: string } = await context.params;
    const { lessonId } = params;

    // 1. Get lesson with full context
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        chapter: {
          include: {
            course: true,
          },
        },
        transcripts: {
          include: {
            videoAsset: true,
          },
        },
      },
    });

    if (!lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    // 3. Get transcript
    const transcript = lesson.transcripts[0];

    if (!transcript) {
      return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({} as any));
    const force = Boolean(body?.force);

    const jobService = new TranscriptJobService(prisma);

    // Check for any active job (QUEUED, RUNNING, or RETRY_WAIT) to prevent duplicates
    const activeJob = await jobService.getActiveJobForTranscript(transcript.id);
    if (activeJob && !force) {
      return NextResponse.json(
        {
          success: false,
          error: `Transcript processing is already ${activeJob.state.toLowerCase().replace('_', ' ')}`,
          data: {
            transcriptId: transcript.id,
            jobId: activeJob.id,
            state: activeJob.state,
            stage: activeJob.stage,
            progress: activeJob.progress,
            lastHeartbeatAt: activeJob.lastHeartbeatAt?.toISOString() ?? null,
          },
        },
        { status: 409 }
      );
    }

    if (force) {
      await jobService.cancelActiveJobs(transcript.id);
    }

    const job = await jobService.enqueueJob({
      transcriptId: transcript.id,
      lessonId: lesson.id,
    });

    await jobService.appendEvent({
      jobId: job.id,
      level: 'info',
      stage: 'PENDING',
      message: 'Job enqueued',
      data: {
        lessonId: lesson.id,
        transcriptId: transcript.id,
        s3Key: transcript.s3Key,
        force,
      },
    });

    // Reset transcript status for visibility in the admin UI
    await prisma.transcriptAsset.update({
      where: { id: transcript.id },
      data: {
        status: 'PENDING',
        errorMessage: null,
        processedAt: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Transcript processing queued',
      data: {
        transcriptId: transcript.id,
        jobId: job.id,
        status: 'PENDING',
      },
    });
  } catch (error) {
    console.error('Process transcript error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
