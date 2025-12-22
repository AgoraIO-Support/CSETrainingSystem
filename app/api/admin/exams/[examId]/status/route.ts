/**
 * Admin Exam Status Route
 * POST /api/admin/exams/[examId]/status - Change exam status
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-middleware';
import { ExamService } from '@/lib/services/exam.service';
import { changeExamStatusSchema } from '@/lib/validations';
import { z } from 'zod';

type RouteContext = {
  params: Promise<{ examId: string }>;
};

// POST /api/admin/exams/[examId]/status - Change exam status
export const POST = withAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId } = await context.params;
      const body = await req.json();
      const { status } = changeExamStatusSchema.parse(body);

      const exam = await ExamService.changeStatus(examId, status, user.id);

      return NextResponse.json({
        success: true,
        data: exam,
      });
    } catch (error) {
      console.error('Change exam status error:', error);

      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid status',
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

        if (error.message === 'INVALID_STATUS_TRANSITION') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'EXAM_005',
                message: 'Invalid status transition',
              },
            },
            { status: 400 }
          );
        }

        if (error.message === 'EXAM_NO_QUESTIONS') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'EXAM_006',
                message: 'Exam must have at least one question before review',
              },
            },
            { status: 400 }
          );
        }

        if (error.message === 'APPROVER_REQUIRED') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'EXAM_007',
                message: 'Approver is required for approval',
              },
            },
            { status: 400 }
          );
        }

        if (error.message === 'EXAM_POINTS_MISMATCH') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'EXAM_010',
                message: 'Cannot approve exam: total question points must match the exam total score.',
              },
            },
            { status: 400 }
          );
        }

        if (error.message === 'PUBLISH_REQUIRES_ASSIGNMENT') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'EXAM_011',
                message: 'Publishing requires assigning users. Use the Publish flow to select recipients.',
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
            message: 'Failed to change exam status',
          },
        },
        { status: 500 }
      );
    }
  }
);
