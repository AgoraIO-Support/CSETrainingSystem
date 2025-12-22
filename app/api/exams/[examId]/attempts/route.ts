/**
 * User Exam Attempts Route
 * GET /api/exams/[examId]/attempts - Get user's attempts for an exam
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { ExamAttemptService } from '@/lib/services/exam-attempt.service';

type RouteContext = {
  params: Promise<{ examId: string }>;
};

// GET /api/exams/[examId]/attempts - Get user's attempts
export const GET = withAuth(async (req: NextRequest, user, context: RouteContext) => {
  try {
    const { examId } = await context.params;

    const attempts = await ExamAttemptService.getUserAttempts(user.id, examId);

    return NextResponse.json({
      success: true,
      data: attempts,
    });
  } catch (error) {
    console.error('Get attempts error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'EXAM_001',
          message: 'Failed to get attempts',
        },
      },
      { status: 500 }
    );
  }
});
