/**
 * Admin Exam Detail Routes
 * GET /api/admin/exams/[examId] - Get exam details
 * PATCH /api/admin/exams/[examId] - Update exam
 * DELETE /api/admin/exams/[examId] - Delete exam
 */

import { NextRequest, NextResponse } from 'next/server';
import { withSmeOrAdminAuth } from '@/lib/auth-middleware';
import { ExamService } from '@/lib/services/exam.service';
import { TrainingOpsService } from '@/lib/services/training-ops.service';
import { updateExamSchema } from '@/lib/validations';
import {
  assertExamTimeRange,
  normalizeExamTimeZone,
  optionalNullableLocalDateTimeToUtc,
} from '@/lib/exam-timezone';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ examId: string }>;
};

// GET /api/admin/exams/[examId] - Get exam details
export const GET = withSmeOrAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId } = await context.params;
      if (user.role === 'SME') {
        await TrainingOpsService.assertScopedExamAccess(user, examId);
      }

      const exam = await ExamService.getExamById(examId);

      if (!exam) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'EXAM_NOT_FOUND',
              message: 'Exam not found',
            },
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: exam,
      });
    } catch (error) {
      console.error('Get exam error:', error);
      if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'AUTH_003',
              message: 'Insufficient permissions',
            },
          },
          { status: 403 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EXAM_001',
            message: 'Failed to get exam',
          },
        },
        { status: 500 }
      );
    }
  }
);

// PATCH /api/admin/exams/[examId] - Update exam
export const PATCH = withSmeOrAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId } = await context.params;
      if (user.role === 'SME') {
        await TrainingOpsService.assertScopedExamAccess(user, examId);
      }
      const body = await req.json();
      const data = updateExamSchema.parse(body);
      const existingExam = await ExamService.getExamById(examId);

      if (!existingExam) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'EXAM_NOT_FOUND',
              message: 'Exam not found',
            },
          },
          { status: 404 }
        );
      }

      const timezone = normalizeExamTimeZone(data.timezone ?? existingExam.timezone);
      const availableFrom = optionalNullableLocalDateTimeToUtc(data.availableFrom, timezone);
      const deadline = optionalNullableLocalDateTimeToUtc(data.deadline, timezone);
      const nextAvailableFrom = availableFrom === undefined ? existingExam.availableFrom : availableFrom;
      const nextDeadline = deadline === undefined ? existingExam.deadline : deadline;

      assertExamTimeRange(nextAvailableFrom, nextDeadline);

      // Transform nullable values to undefined for service compatibility
      const updateData = {
        ...data,
        description: data.description ?? undefined,
        instructions: data.instructions ?? undefined,
        timeLimit: data.timeLimit ?? undefined,
        timezone,
        deadline,
        availableFrom,
      };

      const exam = await ExamService.updateExam(examId, updateData, {
        actorRole: user.role,
      });

      return NextResponse.json({
        success: true,
        data: exam,
      });
    } catch (error) {
      console.error('Update exam error:', error);

      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid input data',
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
                code: 'AUTH_003',
                message: 'Insufficient permissions',
              },
            },
            { status: 403 }
          );
        }
        if (error.message === 'SME_REWARD_POLICY_RESTRICTED') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'AUTH_003',
                message: 'SME cannot configure formal or performance-tracked exams.',
              },
            },
            { status: 403 }
          );
        }
        if (
          error.message === 'INVALID_EXAM_LOCAL_TIME' ||
          error.message === 'INVALID_EXAM_DATETIME_FORMAT' ||
          error.message === 'INVALID_EXAM_TIME_RANGE'
        ) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message:
                  error.message === 'INVALID_EXAM_TIME_RANGE'
                    ? 'Deadline must be later than Available From.'
                    : 'Invalid exam date/time for the selected timezone.',
              },
            },
            { status: 400 }
          );
        }

        if (error.message === 'EXAM_NOT_FOUND') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'EXAM_NOT_FOUND',
                message: 'Exam not found',
              },
            },
            { status: 404 }
          );
        }

        if (error.message === 'EXAM_NOT_DRAFT') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'EXAM_004',
                message: 'Exam can only be modified in DRAFT status.',
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
            message: 'Failed to update exam',
          },
        },
        { status: 500 }
      );
    }
  }
);

// DELETE /api/admin/exams/[examId] - Delete exam
export const DELETE = withSmeOrAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId } = await context.params;
      if (user.role === 'SME') {
        await TrainingOpsService.assertScopedExamAccess(user, examId);
      }

      const { searchParams } = new URL(req.url);
      const force = searchParams.get('force') === '1';

      await ExamService.deleteExam(examId, { force });

      return NextResponse.json({
        success: true,
        message: 'Exam deleted successfully',
      });
    } catch (error) {
      console.error('Delete exam error:', error);

      if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'AUTH_003',
              message: 'Insufficient permissions',
            },
          },
          { status: 403 }
        );
      }

      if (error instanceof Error && error.message === 'EXAM_NOT_FOUND') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'EXAM_NOT_FOUND',
              message: 'Exam not found',
            },
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EXAM_001',
            message: error instanceof Error ? error.message : 'Failed to delete exam',
          },
        },
        { status: 500 }
      );
    }
  }
);
