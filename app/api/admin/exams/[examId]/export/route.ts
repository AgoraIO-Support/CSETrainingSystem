/**
 * Admin Exam Export Route
 * GET /api/admin/exams/[examId]/export - Export exam data to CSV
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-middleware';
import { ExamAnalyticsService } from '@/lib/services/exam-analytics.service';
import { ExamService } from '@/lib/services/exam.service';

type RouteContext = {
  params: Promise<{ examId: string }>;
};

// GET /api/admin/exams/[examId]/export - Export exam data to CSV
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

      const csvContent = await ExamAnalyticsService.exportToCSV(examId);

      // Create filename
      const filename = `exam-${exam.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`;

      // Return CSV file
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    } catch (error) {
      console.error('Export error:', error);

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EXPORT_001',
            message: 'Failed to export exam data',
          },
        },
        { status: 500 }
      );
    }
  }
);
