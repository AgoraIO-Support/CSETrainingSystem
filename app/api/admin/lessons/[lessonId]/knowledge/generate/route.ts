/**
 * Knowledge Context Generation API
 * POST - Trigger XML knowledge base generation from VTT transcript
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-middleware';
import prisma from '@/lib/prisma';
import { KnowledgeContextService } from '@/lib/services/knowledge-context.service';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import s3Client, { S3_BUCKET_NAME } from '@/lib/aws-s3';

/**
 * POST /api/admin/lessons/[lessonId]/knowledge/generate
 * Generate knowledge context from existing VTT transcript
 */
export const POST = withAdminAuth(async (
  request: NextRequest,
  user,
  context: { params: Promise<{ lessonId: string }> }
) => {
  try {
    const params = await context.params;
    const { lessonId } = params;

    // Get lesson with full context
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        chapter: {
          include: {
            course: true,
          },
        },
        transcripts: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    const transcript = lesson.transcripts[0];
    if (!transcript) {
      return NextResponse.json(
        { error: 'No transcript found. Please upload a VTT file first.' },
        { status: 400 }
      );
    }

    // Check if already processing
    const existingContext = await prisma.knowledgeContext.findUnique({
      where: { lessonId },
    });

    if (existingContext?.status === 'PROCESSING') {
      return NextResponse.json(
        { error: 'Knowledge generation is already in progress' },
        { status: 409 }
      );
    }

    // Fetch VTT content from S3
    let vttContent: string;
    try {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: transcript.s3Key,
      });
      const response = await s3Client.send(command);
      vttContent = await response.Body?.transformToString('utf-8') || '';
    } catch (error) {
      console.error('Failed to fetch VTT from S3:', error);
      return NextResponse.json(
        { error: 'Failed to retrieve transcript file' },
        { status: 500 }
      );
    }

    if (!vttContent.trim()) {
      return NextResponse.json(
        { error: 'Transcript file is empty' },
        { status: 400 }
      );
    }

    // Generate knowledge context (synchronous - typically 3-5 seconds)
    const knowledgeService = new KnowledgeContextService(process.env.OPENAI_API_KEY);

    const result = await knowledgeService.generateAndStoreContext(
      lessonId,
      vttContent,
      {
        courseId: lesson.chapter.course.id,
        courseTitle: lesson.chapter.course.title,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        chapterTitle: lesson.chapter.title,
        lessonDescription: lesson.description || undefined,
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Knowledge context generated successfully',
      data: {
        lessonId,
        status: result.status,
        tokenCount: result.tokenCount,
        sectionCount: result.sectionCount,
        anchorCount: result.anchorCount,
        contentHash: result.contentHash,
        processedAt: result.processedAt?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error('Generate knowledge context error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
});
