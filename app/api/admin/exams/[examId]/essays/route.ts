/**
 * Admin Pending Essays Route
 * GET /api/admin/exams/[examId]/essays - Get pending essays for grading
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-middleware';
import { ExamGradingService } from '@/lib/services/exam-grading.service';
import { ExamService } from '@/lib/services/exam.service';

type RouteContext = {
  params: Promise<{ examId: string }>;
};

// GET /api/admin/exams/[examId]/essays - Get pending essays
export const GET = withAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId } = await context.params;

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

      const gradingService = new ExamGradingService();
      const pendingEssays = await gradingService.getPendingEssays(examId);

      return NextResponse.json({
        success: true,
        data: {
          examId,
          examTitle: exam.title,
          pendingCount: pendingEssays.length,
          essays: pendingEssays,
        },
      });
    } catch (error) {
      console.error('Get pending essays error:', error);

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'GRADING_001',
            message: 'Failed to get pending essays',
          },
        },
        { status: 500 }
      );
    }
  }
);
