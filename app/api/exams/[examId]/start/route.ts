/**
 * Start Exam Attempt Route
 * POST /api/exams/[examId]/start - Start a new exam attempt or resume existing
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { ExamAttemptService } from '@/lib/services/exam-attempt.service';

type RouteContext = {
  params: Promise<{ examId: string }>;
};

// POST /api/exams/[examId]/start - Start exam attempt
export const POST = withAuth(async (req: NextRequest, user, context: RouteContext) => {
  try {
    const { examId } = await context.params;

    // Get IP and user agent for tracking
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    const result = await ExamAttemptService.startAttempt(
      user.id,
      examId,
      ipAddress,
      userAgent
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Start exam error:', error);

    if (error instanceof Error) {
      const errorMessages: Record<string, { code: string; message: string; status: number }> = {
        'EXAM_NOT_FOUND': {
          code: 'EXAM_NOT_FOUND',
          message: 'Exam not found',
          status: 404,
        },
        'EXAM_NOT_PUBLISHED': {
          code: 'EXAM_NOT_PUBLISHED',
          message: 'This exam is not available',
          status: 400,
        },
        'EXAM_NOT_AVAILABLE_YET': {
          code: 'EXAM_NOT_AVAILABLE_YET',
          message: 'This exam is not available yet',
          status: 400,
        },
        'EXAM_DEADLINE_PASSED': {
          code: 'EXAM_DEADLINE_PASSED',
          message: 'The deadline for this exam has passed',
          status: 400,
        },
        'NO_ACCESS': {
          code: 'NO_ACCESS',
          message: 'You do not have access to this exam',
          status: 403,
        },
        'MAX_ATTEMPTS_REACHED': {
          code: 'MAX_ATTEMPTS_REACHED',
          message: 'You have reached the maximum number of attempts',
          status: 400,
        },
      };

      const errorInfo = errorMessages[error.message];
      if (errorInfo) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: errorInfo.code,
              message: errorInfo.message,
            },
          },
          { status: errorInfo.status }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'EXAM_001',
          message: 'Failed to start exam',
        },
      },
      { status: 500 }
    );
  }
});
