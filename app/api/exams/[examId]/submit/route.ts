/**
 * Submit Exam Route
 * POST /api/exams/[examId]/submit - Submit exam attempt
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { ExamAttemptService } from '@/lib/services/exam-attempt.service';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ examId: string }>;
};

const submitSchema = z.object({
  attemptId: z.string().min(1, 'Attempt ID is required'),
});

// POST /api/exams/[examId]/submit - Submit exam
export const POST = withAuth(async (req: NextRequest, user, context: RouteContext) => {
  try {
    const { examId } = await context.params;
    const body = await req.json();
    const { attemptId } = submitSchema.parse(body);

    // Verify the attempt belongs to this user and exam
    const currentAttempt = await ExamAttemptService.getCurrentAttempt(user.id, examId);

    if (!currentAttempt || currentAttempt.attemptId !== attemptId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_ATTEMPT',
            message: 'Invalid or expired attempt',
          },
        },
        { status: 400 }
      );
    }

    const result = await ExamAttemptService.submitAttempt(attemptId);

    // Check if results should be shown immediately
    if (result.exam.showResultsImmediately) {
      return NextResponse.json({
        success: true,
        data: {
          attemptId: result.id,
          status: result.status,
          submittedAt: result.submittedAt,
          showResults: true,
          results: {
            rawScore: result.rawScore,
            percentageScore: result.percentageScore,
            passed: result.passed,
            totalScore: result.exam.totalScore,
            passingScore: result.exam.passingScore,
          },
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        attemptId: result.id,
        status: result.status,
        submittedAt: result.submittedAt,
        showResults: false,
        message: 'Your exam has been submitted. Results will be available after grading is complete.',
      },
    });
  } catch (error) {
    console.error('Submit exam error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid submission data',
            details: error.errors,
          },
        },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      if (error.message === 'ATTEMPT_NOT_FOUND') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'ATTEMPT_NOT_FOUND',
              message: 'Attempt not found',
            },
          },
          { status: 404 }
        );
      }

      if (error.message === 'ATTEMPT_ALREADY_SUBMITTED') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'ATTEMPT_ALREADY_SUBMITTED',
              message: 'This exam has already been submitted',
            },
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'EXAM_001',
          message: 'Failed to submit exam',
        },
      },
      { status: 500 }
    );
  }
});
