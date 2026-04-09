/**
 * Admin Exam Questions Routes
 * GET /api/admin/exams/[examId]/questions - Get exam questions
 * POST /api/admin/exams/[examId]/questions - Add question to exam
 */

import { NextRequest, NextResponse } from 'next/server';
import { withSmeOrAdminAuth } from '@/lib/auth-middleware';
import { ExamService } from '@/lib/services/exam.service';
import { TrainingOpsService } from '@/lib/services/training-ops.service';
import { createExamQuestionSchema, reorderExamQuestionsSchema } from '@/lib/validations';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ examId: string }>;
};

// GET /api/admin/exams/[examId]/questions - Get exam questions
export const GET = withSmeOrAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId } = await context.params;
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
      const questions = await ExamService.getQuestions(examId);

      return NextResponse.json({
        success: true,
        data: questions,
      });
    } catch (error) {
      console.error('Get exam questions error:', error);
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
            message: 'Failed to get exam questions',
          },
        },
        { status: 500 }
      );
    }
  }
);

// POST /api/admin/exams/[examId]/questions - Add question to exam
export const POST = withSmeOrAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId } = await context.params;
      if (user.role === 'SME') {
        await TrainingOpsService.assertScopedExamAccess(user, examId);
      }
      const body = await req.json();
      const data = createExamQuestionSchema.parse(body);

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

      const question = await ExamService.addQuestion(examId, data);

      return NextResponse.json(
        {
          success: true,
          data: question,
        },
        { status: 201 }
      );
    } catch (error) {
      console.error('Add exam question error:', error);

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
            message: 'Failed to add question',
          },
        },
        { status: 500 }
      );
    }
  }
);

// PUT /api/admin/exams/[examId]/questions - Reorder questions
export const PUT = withSmeOrAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId } = await context.params;
      if (user.role === 'SME') {
        await TrainingOpsService.assertScopedExamAccess(user, examId);
      }
      const body = await req.json();
      const { questionIds } = reorderExamQuestionsSchema.parse(body);

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

      await ExamService.reorderQuestions(examId, questionIds);

      return NextResponse.json({
        success: true,
        message: 'Questions reordered successfully',
      });
    } catch (error) {
      console.error('Reorder questions error:', error);

      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid question IDs',
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
            message: 'Failed to reorder questions',
          },
        },
        { status: 500 }
      );
    }
  }
);
