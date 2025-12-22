/**
 * Admin Exam Analytics Route
 * GET /api/admin/exams/[examId]/analytics - Get exam analytics
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-middleware';
import { ExamAnalyticsService } from '@/lib/services/exam-analytics.service';
import { ExamService } from '@/lib/services/exam.service';

type RouteContext = {
  params: Promise<{ examId: string }>;
};

// GET /api/admin/exams/[examId]/analytics - Get exam analytics
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

      const analytics = await ExamAnalyticsService.getExamAnalytics(examId);

      // Optionally save snapshot
      const { searchParams } = new URL(req.url);
      if (searchParams.get('saveSnapshot') === 'true') {
        await ExamAnalyticsService.saveAnalyticsSnapshot(examId);
      }

      return NextResponse.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      console.error('Get analytics error:', error);

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ANALYTICS_001',
            message: 'Failed to get analytics',
          },
        },
        { status: 500 }
      );
    }
  }
);
