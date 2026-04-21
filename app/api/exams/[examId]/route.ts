/**
 * User Exam Detail Routes
 * GET /api/exams/[examId] - Get exam details for the user
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { ExamService } from '@/lib/services/exam.service';
import { ExamStatus } from '@prisma/client';

type RouteContext = {
  params: Promise<{ examId: string }>;
};

// GET /api/exams/[examId] - Get exam details
export const GET = withAuth(async (req: NextRequest, user, context: RouteContext) => {
  try {
    const { examId } = await context.params;

    // Check if user can access this exam
    const accessCheck = await ExamService.canUserTakeExam(user.id, examId);

    const canStillViewExam =
      accessCheck.reason === 'MAX_ATTEMPTS_REACHED' ||
      accessCheck.reason === 'EXAM_NOT_AVAILABLE_YET' ||
      accessCheck.reason === 'EXAM_DEADLINE_PASSED';

    if (!accessCheck.canTake && !canStillViewExam) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: accessCheck.reason || 'NO_ACCESS',
            message: getAccessErrorMessage(accessCheck.reason),
          },
        },
        { status: 403 }
      );
    }

    const exam = await ExamService.getExamById(examId);

    if (!exam || exam.status !== ExamStatus.PUBLISHED) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EXAM_NOT_FOUND',
            message: 'Exam not found or not available',
          },
        },
        { status: 404 }
      );
    }

    // Get question count from exam service
    const questions = await ExamService.getQuestions(examId);
    const remainingAttempts = accessCheck.maxAttempts !== undefined && accessCheck.attemptsUsed !== undefined
      ? accessCheck.maxAttempts - accessCheck.attemptsUsed
      : exam.maxAttempts;

    // Return exam info without questions (questions revealed on start)
    return NextResponse.json({
      success: true,
      data: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        instructions: exam.instructions,
        timeLimit: exam.timeLimit,
        totalScore: exam.totalScore,
        passingScore: exam.passingScore,
        maxAttempts: exam.maxAttempts,
        timezone: exam.timezone,
        deadline: exam.deadline,
        availableFrom: exam.availableFrom,
        showResultsImmediately: exam.showResultsImmediately,
        allowReview: exam.allowReview,
        assessmentKind: exam.assessmentKind ?? null,
        awardsStars: exam.awardsStars ?? false,
        starValue: exam.starValue ?? null,
        countsTowardPerformance: exam.countsTowardPerformance ?? false,
        certificateEligible: exam.certificateEligible ?? false,
        questionCount: questions.length,
        courseId: exam.courseId,
        course: exam.course
          ? {
              id: exam.course.id,
              title: exam.course.title,
            }
          : null,
        // User-specific info
        canTake: accessCheck.canTake,
        accessReason: accessCheck.reason,
        remainingAttempts,
        attemptsUsed: accessCheck.attemptsUsed || 0,
      },
    });
  } catch (error) {
    console.error('Get exam error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'EXAM_001',
          message: 'Failed to get exam details',
        },
      },
      { status: 500 }
    );
  }
});

function getAccessErrorMessage(reason?: string): string {
  switch (reason) {
    case 'EXAM_NOT_FOUND':
      return 'Exam not found';
    case 'EXAM_NOT_PUBLISHED':
      return 'This exam is not available yet';
    case 'EXAM_NOT_AVAILABLE_YET':
      return 'This exam is not available yet. Please check back later.';
    case 'EXAM_DEADLINE_PASSED':
      return 'The deadline for this exam has passed';
    case 'NO_ACCESS':
      return 'You do not have access to this exam';
    case 'MAX_ATTEMPTS_REACHED':
      return 'You have reached the maximum number of attempts for this exam';
    default:
      return 'Cannot access this exam';
  }
}
