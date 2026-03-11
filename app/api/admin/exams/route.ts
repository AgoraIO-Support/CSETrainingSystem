/**
 * Admin Exam Routes
 * GET /api/admin/exams - List all exams
 * POST /api/admin/exams - Create new exam
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-middleware';
import { ExamService } from '@/lib/services/exam.service';
import { createExamSchema } from '@/lib/validations';
import {
  assertExamTimeRange,
  normalizeExamTimeZone,
  optionalLocalDateTimeToUtc,
} from '@/lib/exam-timezone';
import { ExamStatus, ExamType } from '@prisma/client';
import { z } from 'zod';

// GET /api/admin/exams - List exams with filters
export const GET = withAdminAuth(async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status') as ExamStatus | null;
    const examType = searchParams.get('examType') as ExamType | null;
    const courseId = searchParams.get('courseId');
    const search = searchParams.get('search');

    const { exams, pagination } = await ExamService.getExams({
      page,
      limit,
      status: status || undefined,
      examType: examType || undefined,
      courseId: courseId || undefined,
      search: search || undefined,
    });

    return NextResponse.json({
      success: true,
      data: exams,
      pagination,
    });
  } catch (error) {
    console.error('Get exams error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'EXAM_001',
          message: 'Failed to get exams',
        },
      },
      { status: 500 }
    );
  }
});

// POST /api/admin/exams - Create new exam
export const POST = withAdminAuth(async (req: NextRequest, user) => {
  try {
    const body = await req.json();
    const data = createExamSchema.parse(body);
    const timezone = normalizeExamTimeZone(data.timezone);
    const availableFrom = optionalLocalDateTimeToUtc(data.availableFrom, timezone);
    const deadline = optionalLocalDateTimeToUtc(data.deadline, timezone);

    assertExamTimeRange(availableFrom, deadline);

    const exam = await ExamService.createExam(
      {
        ...data,
        timezone,
        availableFrom,
        deadline,
      },
      user.id
    );

    return NextResponse.json(
      {
        success: true,
        data: exam,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create exam error:', error);

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
      if (
        error.message === 'INVALID_EXAM_LOCAL_TIME' ||
        error.message === 'INVALID_EXAM_DATETIME_FORMAT' ||
        error.message === 'INVALID_EXAM_TIME_RANGE'
      ) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message:
                error.message === 'INVALID_EXAM_TIME_RANGE'
                  ? 'Deadline must be later than Available From.'
                  : 'Invalid exam date/time for the selected timezone.',
            },
          },
          { status: 400 }
        );
      }

      if (error.message === 'COURSE_REQUIRED') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'EXAM_002',
              message: 'Course ID is required for course-based exams',
            },
          },
          { status: 400 }
        );
      }

      if (error.message === 'COURSE_NOT_FOUND') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'EXAM_003',
              message: 'Course not found',
            },
          },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'EXAM_001',
          message: 'Failed to create exam',
        },
      },
      { status: 500 }
    );
  }
});
