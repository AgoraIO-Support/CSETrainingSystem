/**
 * Admin Exam Question Detail Routes
 * PATCH /api/admin/exams/[examId]/questions/[questionId] - Update question
 * DELETE /api/admin/exams/[examId]/questions/[questionId] - Delete question
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-middleware';
import { ExamService } from '@/lib/services/exam.service';
import { updateExamQuestionSchema } from '@/lib/validations';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ examId: string; questionId: string }>;
};

// PATCH /api/admin/exams/[examId]/questions/[questionId] - Update question
export const PATCH = withAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId, questionId } = await context.params;
      const body = await req.json();
      const data = updateExamQuestionSchema.parse(body);

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
export const DELETE = withAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId, questionId } = await context.params;

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
