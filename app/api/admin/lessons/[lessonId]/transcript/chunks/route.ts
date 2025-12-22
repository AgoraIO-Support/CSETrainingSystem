/**
 * Transcript Chunks API
 * View parsed and embedded chunks for debugging/preview
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-middleware';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/admin/lessons/[lessonId]/transcript/chunks
 * Get chunks for a lesson's transcript
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

    // 1. Get query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    // 2. Get lesson with transcript
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

    // 4. Get chunks with pagination
    const skip = (page - 1) * pageSize;

    const [chunks, total] = await Promise.all([
      prisma.transcriptChunk.findMany({
        where: { transcriptId: transcript.id },
        orderBy: { sequenceIndex: 'asc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          sequenceIndex: true,
          startTime: true,
          endTime: true,
          text: true,
          tokenCount: true,
          metadata: true,
          createdAt: true,
        },
      }),
      prisma.transcriptChunk.count({
        where: { transcriptId: transcript.id },
      }),
    ]);

    // Format chunks for response
    const formattedChunks = chunks.map(chunk => ({
      id: chunk.id,
      sequenceIndex: chunk.sequenceIndex,
      startTime: parseFloat(chunk.startTime.toString()),
      endTime: parseFloat(chunk.endTime.toString()),
      timestamp: `${formatTime(parseFloat(chunk.startTime.toString()))}-${formatTime(parseFloat(chunk.endTime.toString()))}`,
      text: chunk.text,
      tokenCount: chunk.tokenCount,
      metadata: chunk.metadata,
    }));

    return NextResponse.json({
      success: true,
      data: {
        chunks: formattedChunks,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error('Get chunks error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

/**
 * Format seconds to MM:SS
 */
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
