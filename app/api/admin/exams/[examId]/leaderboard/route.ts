/**
 * Admin Exam Leaderboard Route
 * GET /api/admin/exams/[examId]/leaderboard - Get exam leaderboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { withSmeOrAdminAuth } from '@/lib/auth-middleware';
import { ExamAnalyticsService } from '@/lib/services/exam-analytics.service';
import { ExamService } from '@/lib/services/exam.service';
import { TrainingOpsService } from '@/lib/services/training-ops.service';

type RouteContext = {
  params: Promise<{ examId: string }>;
};

// GET /api/admin/exams/[examId]/leaderboard - Get exam leaderboard
export const GET = withSmeOrAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId } = await context.params;
      const { searchParams } = new URL(req.url);
      const limit = parseInt(searchParams.get('limit') || '10', 10);

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

      const leaderboard = await ExamAnalyticsService.getLeaderboard(examId, limit);

      return NextResponse.json({
        success: true,
        data: {
          examId,
          examTitle: exam.title,
          leaderboard,
        },
      });
    } catch (error) {
      console.error('Get leaderboard error:', error);

      if (error instanceof Error && error.message === 'TRAINING_OPS_SCOPE_FORBIDDEN') {
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

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ANALYTICS_001',
            message: 'Failed to get leaderboard',
          },
        },
        { status: 500 }
      );
    }
  }
);
