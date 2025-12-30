/**
 * Save Exam Answer Route
 * POST /api/exams/[examId]/answer - Save answer (auto-save)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { ExamAttemptService } from '@/lib/services/exam-attempt.service';
import { submitExamAnswerSchema } from '@/lib/validations';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ examId: string }>;
};

// POST /api/exams/[examId]/answer - Save answer
export const POST = withAuth(async (req: NextRequest, user, context: RouteContext) => {
  try {
    const { examId } = await context.params;
    const body = await req.json();
    const { attemptId, questionId, answer, selectedOption } = submitExamAnswerSchema.parse(body);

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

    await ExamAttemptService.saveAnswer(attemptId, {
      questionId,
      answer,
      selectedOption,
    });

    return NextResponse.json({
      success: true,
      message: 'Answer saved',
    });
  } catch (error) {
    console.error('Save answer error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid answer data',
            details: error.errors,
          },
        },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      const errorMessages: Record<string, { code: string; message: string; status: number }> = {
        'ATTEMPT_NOT_FOUND': {
          code: 'ATTEMPT_NOT_FOUND',
          message: 'Attempt not found',
          status: 404,
        },
        'ATTEMPT_NOT_IN_PROGRESS': {
          code: 'ATTEMPT_NOT_IN_PROGRESS',
          message: 'This attempt has already been submitted',
          status: 400,
        },
        'ATTEMPT_EXPIRED': {
          code: 'ATTEMPT_EXPIRED',
          message: 'Your time has expired. The exam will be submitted automatically.',
          status: 400,
        },
        'QUESTION_NOT_FOUND': {
          code: 'QUESTION_NOT_FOUND',
          message: 'Question not found',
          status: 404,
        },
        'EXERCISE_ANSWER_MUST_USE_UPLOAD': {
          code: 'EXERCISE_ANSWER_MUST_USE_UPLOAD',
          message: 'Exercise answers must be recorded and uploaded as WebM',
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
          message: 'Failed to save answer',
        },
      },
      { status: 500 }
    );
  }
});
