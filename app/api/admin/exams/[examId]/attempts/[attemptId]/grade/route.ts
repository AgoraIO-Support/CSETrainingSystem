/**
 * Admin Exam Grading Route
 * POST /api/admin/exams/[examId]/attempts/[attemptId]/grade - Trigger auto-grading
 */

import { NextRequest, NextResponse } from 'next/server';
import { withSmeOrAdminAuth } from '@/lib/auth-middleware';
import { ExamGradingService } from '@/lib/services/exam-grading.service';
import prisma from '@/lib/prisma';
import { TrainingOpsService } from '@/lib/services/training-ops.service';

type RouteContext = {
  params: Promise<{ examId: string; attemptId: string }>;
};

// POST /api/admin/exams/[examId]/attempts/[attemptId]/grade - Auto-grade attempt
export const POST = withSmeOrAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId, attemptId } = await context.params;

      if (user.role === 'SME') {
        await TrainingOpsService.assertScopedExamAccess(user, examId);
      }

      const attempt = await prisma.examAttempt.findFirst({
        where: {
          id: attemptId,
          examId,
        },
        select: { id: true },
      });

      if (!attempt) {
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

      const gradingService = new ExamGradingService();
      const result = await gradingService.gradeAttempt(attemptId);

      // If there are essays, trigger AI grading as well
      if (result.pendingEssays > 0) {
        // Batch AI grade all essays
        await gradingService.batchGradeEssaysWithAI(attemptId);
      }

      // Get updated grading summary
      const summary = await gradingService.getGradingSummary(attemptId);

      return NextResponse.json({
        success: true,
        data: {
          ...result,
          summary,
        },
      });
    } catch (error) {
      console.error('Grade attempt error:', error);

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

        if (error.message === 'ATTEMPT_NOT_SUBMITTED') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'ATTEMPT_NOT_SUBMITTED',
                message: 'Cannot grade an attempt that has not been submitted',
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
            message: 'Failed to grade attempt',
          },
        },
        { status: 500 }
      );
    }
  }
);
