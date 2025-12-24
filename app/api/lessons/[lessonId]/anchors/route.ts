/**
 * Knowledge Anchors API
 * GET - Get knowledge anchors for a lesson (for frontend navigation)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import prisma from '@/lib/prisma';
import { KnowledgeContextService } from '@/lib/services/knowledge-context.service';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import s3Client, { ASSET_S3_BUCKET_NAME } from '@/lib/aws-s3';

const PROCESSING_STALE_MS = 3 * 60 * 1000;

/**
 * GET /api/lessons/[lessonId]/anchors
 * Get knowledge anchors for video navigation
 */
export const GET = withAuth(async (
  request: NextRequest,
  user,
  context: { params: Promise<{ lessonId: string }> }
) => {
  try {
    const params = await context.params;
    const { lessonId } = params;

    const anchors = await prisma.knowledgeAnchor.findMany({
      where: { lessonId },
      orderBy: { sequenceIndex: 'asc' },
    });

    // If anchors aren't generated yet, attempt to generate knowledge context on-demand.
    // This prevents the learner UI from being stuck in "Lesson knowledge preparing…" indefinitely
    // when an async worker isn't running or knowledge generation wasn't triggered after VTT upload.
    if (anchors.length === 0) {
      const existingContext = await prisma.knowledgeContext.findUnique({
        where: { lessonId },
        select: { status: true, updatedAt: true },
      });

      // If another request is already generating the context, just return empty anchors.
      const isProcessing = existingContext?.status === 'PROCESSING';
      const isStaleProcessing =
        isProcessing &&
        existingContext?.updatedAt &&
        Date.now() - existingContext.updatedAt.getTime() > PROCESSING_STALE_MS;

      if (isProcessing && !isStaleProcessing) {
        return NextResponse.json({
          success: true,
          data: { anchors: [], status: existingContext.status },
        });
      }

      // If processing is stale, reset it so the request can re-generate.
      if (isStaleProcessing) {
        await prisma.knowledgeContext.update({
          where: { lessonId },
          data: { status: 'FAILED', errorMessage: 'Stale processing state; retrying generation' },
        });
      }

      if (!isProcessing || isStaleProcessing) {
        const lesson = await prisma.lesson.findUnique({
          where: { id: lessonId },
          include: {
            chapter: { include: { course: true } },
            transcripts: {
              orderBy: { updatedAt: 'desc' },
              take: 1,
            },
          },
        });

        const transcript = lesson?.transcripts?.[0] ?? null;
        if (!lesson) {
          return NextResponse.json(
            {
              success: false,
              error: { code: 'KNOWLEDGE_001', message: 'Lesson not found' },
            },
            { status: 404 }
          );
        }

        if (!transcript?.s3Key) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'KNOWLEDGE_002',
                message: 'No transcript available. Upload a VTT transcript to generate lesson knowledge.',
              },
            },
            { status: 409 }
          );
        }

        if (lesson && transcript?.s3Key) {
          const command = new GetObjectCommand({
            Bucket: ASSET_S3_BUCKET_NAME,
            Key: transcript.s3Key,
          });
          const response = await s3Client.send(command);
          const vttContent = (await response.Body?.transformToString('utf-8')) || '';

          if (vttContent.trim()) {
            const knowledgeService = new KnowledgeContextService(process.env.OPENAI_API_KEY);
            await knowledgeService.generateAndStoreContext(lessonId, vttContent, {
              courseId: lesson.chapter.course.id,
              courseTitle: lesson.chapter.course.title,
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              chapterTitle: lesson.chapter.title,
              lessonDescription: lesson.description || undefined,
            });

            // Re-fetch anchors after generation
            const regenerated = await prisma.knowledgeAnchor.findMany({
              where: { lessonId },
              orderBy: { sequenceIndex: 'asc' },
            });

            return NextResponse.json({
              success: true,
              data: {
                anchors: regenerated.map((anchor) => ({
                  id: anchor.id,
                  timestamp: Number(anchor.timestamp),
                  timestampStr: anchor.timestampStr,
                  title: anchor.title,
                  summary: anchor.summary,
                  keyTerms: anchor.keyTerms,
                  anchorType: anchor.anchorType,
                  sequenceIndex: anchor.sequenceIndex,
                })),
                status: 'READY',
              },
            });
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        anchors: anchors.map((anchor) => ({
          id: anchor.id,
          timestamp: Number(anchor.timestamp),
          timestampStr: anchor.timestampStr,
          title: anchor.title,
          summary: anchor.summary,
          keyTerms: anchor.keyTerms,
          anchorType: anchor.anchorType,
          sequenceIndex: anchor.sequenceIndex,
        })),
        status: 'READY',
      },
    });
  } catch (error) {
    console.error('Get anchors error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SYSTEM_001',
          message: 'Failed to load anchors',
        },
      },
      { status: 500 }
    );
  }
});
