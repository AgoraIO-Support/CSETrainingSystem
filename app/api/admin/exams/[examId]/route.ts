/**
 * Admin Exam Detail Routes
 * GET /api/admin/exams/[examId] - Get exam details
 * PATCH /api/admin/exams/[examId] - Update exam
 * DELETE /api/admin/exams/[examId] - Delete exam
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-middleware';
import { ExamService } from '@/lib/services/exam.service';
import { updateExamSchema } from '@/lib/validations';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ examId: string }>;
};

// GET /api/admin/exams/[examId] - Get exam details
export const GET = withAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId } = await context.params;

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
export const PATCH = withAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId } = await context.params;
      const body = await req.json();
      const data = updateExamSchema.parse(body);

      // Transform nullable values to undefined for service compatibility
      const updateData = {
        ...data,
        description: data.description ?? undefined,
        instructions: data.instructions ?? undefined,
        timeLimit: data.timeLimit ?? undefined,
        deadline: data.deadline ?? undefined,
        availableFrom: data.availableFrom ?? undefined,
      };

      const exam = await ExamService.updateExam(examId, updateData);

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

        if (error.message === 'EXAM_PUBLISHED_IMMUTABLE') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'EXAM_004',
                message: 'Cannot modify published exam. Only deadline and availability can be changed.',
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
export const DELETE = withAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId } = await context.params;

      await ExamService.deleteExam(examId);

      return NextResponse.json({
        success: true,
        message: 'Exam deleted successfully',
      });
    } catch (error) {
      console.error('Delete exam error:', error);

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
            message: 'Failed to delete exam',
          },
        },
        { status: 500 }
      );
    }
  }
);
