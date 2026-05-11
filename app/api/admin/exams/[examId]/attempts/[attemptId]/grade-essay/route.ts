/**
 * Admin Answer Grading Route
 * POST /api/admin/exams/[examId]/attempts/[attemptId]/grade-essay - Finalize/override answer grade
 */

import { NextRequest, NextResponse } from 'next/server';
import { withSmeOrAdminAuth } from '@/lib/auth-middleware';
import { ExamGradingService } from '@/lib/services/exam-grading.service';
import prisma from '@/lib/prisma';
import { TrainingOpsService } from '@/lib/services/training-ops.service';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ examId: string; attemptId: string }>;
};

const gradeEssaySchema = z.object({
  answerId: z.string().min(1, 'Answer ID is required'),
  score: z.number().min(0, 'Score must be non-negative'),
  feedback: z.string().optional(),
});

// POST /api/admin/exams/[examId]/attempts/[attemptId]/grade-essay - Finalize/override answer grade
export const POST = withSmeOrAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId, attemptId } = await context.params;

      if (user.role === 'SME') {
        await TrainingOpsService.assertScopedExamAccess(user, examId);
      }

      const body = await req.json();
      const { answerId, score, feedback } = gradeEssaySchema.parse(body);

      const answer = await prisma.examAnswer.findFirst({
        where: {
          id: answerId,
          attemptId,
          attempt: {
            examId,
          },
        },
        select: { id: true },
      });

      if (!answer) {
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

      const gradingService = new ExamGradingService();
      await gradingService.finalizeAnswerGrade(answerId, user.id, score, feedback);

      // Get updated grading summary
      const summary = await gradingService.getGradingSummary(attemptId);

      return NextResponse.json({
        success: true,
        data: {
          message: 'Answer grade saved successfully',
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
        if (error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'Insufficient permissions',
              },
            },
            { status: 403 }
          );
        }

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
                message: 'This answer is not eligible for grade override',
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
