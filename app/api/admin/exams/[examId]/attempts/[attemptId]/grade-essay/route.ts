/**
 * Admin Essay Grading Route
 * POST /api/admin/exams/[examId]/attempts/[attemptId]/grade-essay - Finalize essay grade
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-middleware';
import { ExamGradingService } from '@/lib/services/exam-grading.service';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ examId: string; attemptId: string }>;
};

const gradeEssaySchema = z.object({
  answerId: z.string().min(1, 'Answer ID is required'),
  score: z.number().min(0, 'Score must be non-negative'),
  feedback: z.string().optional(),
});

// POST /api/admin/exams/[examId]/attempts/[attemptId]/grade-essay - Finalize essay grade
export const POST = withAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const body = await req.json();
      const { answerId, score, feedback } = gradeEssaySchema.parse(body);

      const gradingService = new ExamGradingService();
      await gradingService.finalizeEssayGrade(answerId, user.id, score, feedback);

      // Get updated grading summary
      const { attemptId } = await context.params;
      const summary = await gradingService.getGradingSummary(attemptId);

      return NextResponse.json({
        success: true,
        data: {
          message: 'Essay graded successfully',
          summary,
        },
      });
    } catch (error) {
      console.error('Grade essay error:', error);

      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid grading data',
              details: error.errors,
            },
          },
          { status: 400 }
        );
      }

      if (error instanceof Error) {
        if (error.message === 'ANSWER_NOT_FOUND') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'ANSWER_NOT_FOUND',
                message: 'Answer not found',
              },
            },
            { status: 404 }
          );
        }

        if (error.message === 'NOT_MANUAL_GRADEABLE') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'NOT_MANUAL_GRADEABLE',
                message: 'This answer is not eligible for manual grading',
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
            code: 'GRADING_001',
            message: 'Failed to grade essay',
          },
        },
        { status: 500 }
      );
    }
  }
);
