/**
 * Admin Exam Question Detail Routes
 * PATCH /api/admin/exams/[examId]/questions/[questionId] - Update question
 * DELETE /api/admin/exams/[examId]/questions/[questionId] - Delete question
 */

import { NextRequest, NextResponse } from 'next/server';
import { withSmeOrAdminAuth } from '@/lib/auth-middleware';
import { ExamService } from '@/lib/services/exam.service';
import { TrainingOpsService } from '@/lib/services/training-ops.service';
import { updateExamQuestionSchema } from '@/lib/validations';
import prisma from '@/lib/prisma';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ examId: string; questionId: string }>;
};

// PATCH /api/admin/exams/[examId]/questions/[questionId] - Update question
export const PATCH = withSmeOrAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId, questionId } = await context.params;
      if (user.role === 'SME') {
        await TrainingOpsService.assertScopedExamAccess(user, examId);
      }
      const body = await req.json();

      const existingQuestion = await prisma.examQuestion.findFirst({
        where: {
          id: questionId,
          examId,
          archivedAt: null,
        },
        select: {
          id: true,
          type: true,
          points: true,
        },
      });

      if (!existingQuestion) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'QUESTION_NOT_FOUND',
              message: 'Question not found',
            },
          },
          { status: 404 }
        );
      }

      const data = updateExamQuestionSchema.parse({
        ...body,
        type: body.type ?? existingQuestion.type,
        points: body.points ?? existingQuestion.points,
      });

      // Verify exam exists
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
      if (exam.status !== 'DRAFT') {
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

      const question = await ExamService.updateQuestion(questionId, data);

      return NextResponse.json({
        success: true,
        data: question,
      });
    } catch (error) {
      console.error('Update question error:', error);

      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid question data',
              details: error.errors,
            },
          },
          { status: 400 }
        );
      }

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
            message: 'Failed to update question',
          },
        },
        { status: 500 }
      );
    }
  }
);

// DELETE /api/admin/exams/[examId]/questions/[questionId] - Delete question
export const DELETE = withSmeOrAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId, questionId } = await context.params;
      if (user.role === 'SME') {
        await TrainingOpsService.assertScopedExamAccess(user, examId);
      }

      // Verify exam exists
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
      if (exam.status !== 'DRAFT') {
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

      await ExamService.deleteQuestion(questionId);

      return NextResponse.json({
        success: true,
        message: 'Question deleted successfully',
      });
    } catch (error) {
      console.error('Delete question error:', error);

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
            message: 'Failed to delete question',
          },
        },
        { status: 500 }
      );
    }
  }
);
