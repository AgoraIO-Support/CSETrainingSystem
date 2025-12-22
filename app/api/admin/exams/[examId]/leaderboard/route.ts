/**
 * Admin Exam Leaderboard Route
 * GET /api/admin/exams/[examId]/leaderboard - Get exam leaderboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-middleware';
import { ExamAnalyticsService } from '@/lib/services/exam-analytics.service';
import { ExamService } from '@/lib/services/exam.service';

type RouteContext = {
  params: Promise<{ examId: string }>;
};

// GET /api/admin/exams/[examId]/leaderboard - Get exam leaderboard
export const GET = withAdminAuth(
  async (req: NextRequest, user, context: RouteContext) => {
    try {
      const { examId } = await context.params;
      const { searchParams } = new URL(req.url);
      const limit = parseInt(searchParams.get('limit') || '10', 10);

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
