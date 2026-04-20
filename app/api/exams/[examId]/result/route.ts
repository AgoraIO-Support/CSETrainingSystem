/**
 * Exam Result Route
 * GET /api/exams/[examId]/result - Get exam result for a specific attempt
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { ExamAttemptService } from '@/lib/services/exam-attempt.service';
import prisma from '@/lib/prisma';
import { ExamAttemptStatus } from '@prisma/client';

type RouteContext = {
  params: Promise<{ examId: string }>;
};

type ResultAnswer = {
  questionId: string;
  question: string;
  type: string;
  points: number;
  maxPoints: number;
  userAnswer: string | null;
  selectedOption: number | null;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
  gradingStatus: string;
  recordingStatus: string | null;
  options?: string[];
  correctAnswer?: string;
  explanation?: string;
  feedback?: string;
};

type ResultPayload = {
  attemptId: string;
  examId: string;
  examTitle: string;
  attemptNumber: number;
  status: string;
  startedAt: Date;
  submittedAt: Date | null;
  resultsAvailable: boolean;
  rawScore: number | null;
  percentageScore: number | null;
  passed: boolean | null;
  totalScore: number;
  passingScore: number;
  allowReview: boolean;
  assessmentKind: string | null;
  awardsStars: boolean;
  starValue: number | null;
  countsTowardPerformance: boolean;
  maxAttempts: number;
  attemptsUsed: number;
  reviewUnlocked: boolean;
  reviewUnlockedByPassing: boolean;
  reviewUnlockedByAttempts: boolean;
  reviewUnlockedByDeadline: boolean;
  rewardOutcome: {
    starsEarned: number;
    badgesUnlocked: Array<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      domain: {
        id: string;
        name: string;
        slug: string;
      } | null;
    }>;
    certificate: {
      eligible: boolean;
      issued: boolean;
      id: string | null;
      title: string | null;
      certificateNumber: string | null;
    };
  };
  answers?: ResultAnswer[];
};

// GET /api/exams/[examId]/result?attemptId=xxx - Get exam result
export const GET = withAuth(async (req: NextRequest, user, context: RouteContext) => {
  try {
    const { examId } = await context.params;
    const { searchParams } = new URL(req.url);
    const attemptId = searchParams.get('attemptId');

    const examMeta = await prisma.exam.findUnique({
      where: { id: examId },
      select: { maxAttempts: true, deadline: true },
    });
    if (!examMeta) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'EXAM_NOT_FOUND', message: 'Exam not found' },
        },
        { status: 404 }
      );
    }

    const attemptsUsed = await prisma.examAttempt.count({
      where: {
        examId,
        userId: user.id,
        status: { in: [ExamAttemptStatus.SUBMITTED, ExamAttemptStatus.GRADED] },
      },
    });
    const maxAttempts = examMeta.maxAttempts;

    let attempt;

    if (attemptId) {
      // Get specific attempt
      attempt = await ExamAttemptService.getAttemptWithAnswers(attemptId);

      // Verify attempt belongs to user
      if (attempt.userId !== user.id) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'You do not have access to this attempt',
            },
          },
          { status: 403 }
        );
      }
    } else {
      // Get the latest completed attempt
      const attempts = await ExamAttemptService.getUserAttempts(user.id, examId);
      const completedAttempt = attempts.find(
        a => a.status === ExamAttemptStatus.SUBMITTED || a.status === ExamAttemptStatus.GRADED
      );

      if (!completedAttempt) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'NO_COMPLETED_ATTEMPT',
              message: 'No completed attempt found for this exam',
            },
          },
          { status: 404 }
        );
      }

      attempt = await ExamAttemptService.getAttemptWithAnswers(completedAttempt.id);
    }

    const reviewUnlockedByPassing = Boolean(attempt.passed);
    const reviewUnlockedByAttempts = attemptsUsed >= maxAttempts;
    const reviewUnlockedByDeadline = Boolean(examMeta.deadline && examMeta.deadline < new Date());
    const reviewUnlocked = reviewUnlockedByPassing || reviewUnlockedByAttempts || reviewUnlockedByDeadline;

    // Check if results are available
    if (!attempt.exam.showResultsImmediately && attempt.status !== ExamAttemptStatus.GRADED) {
      return NextResponse.json({
        success: true,
        data: {
          attemptId: attempt.id,
          examId: attempt.examId,
          examTitle: attempt.exam.title,
          attemptNumber: attempt.attemptNumber,
          status: attempt.status,
          startedAt: attempt.startedAt,
          submittedAt: attempt.submittedAt,
          resultsAvailable: false,
          rawScore: attempt.rawScore,
          percentageScore: attempt.percentageScore,
          passed: attempt.passed,
          totalScore: attempt.exam.totalScore,
          passingScore: attempt.exam.passingScore,
          allowReview: attempt.exam.allowReview,
          assessmentKind: attempt.exam.assessmentKind ?? null,
          awardsStars: attempt.exam.awardsStars,
          starValue: attempt.exam.starValue ?? null,
          countsTowardPerformance: attempt.exam.countsTowardPerformance,
          maxAttempts,
          attemptsUsed,
          reviewUnlocked,
          reviewUnlockedByPassing,
          reviewUnlockedByAttempts,
          reviewUnlockedByDeadline,
          rewardOutcome: {
            starsEarned: 0,
            badgesUnlocked: [],
            certificate: {
              eligible: false,
              issued: false,
              id: null,
              title: null,
              certificateNumber: null,
            },
          },
          message: 'Results are not yet available. Please check back after grading is complete.',
        },
      });
    }

    const [starAwards, badgeAwards, certificateTemplate, issuedCertificate] = await Promise.all([
      prisma.starAward.findMany({
        where: {
          userId: user.id,
          examId: attempt.examId,
        },
        select: {
          stars: true,
        },
      }),
      prisma.badgeAward.findMany({
        where: {
          userId: user.id,
          examId: attempt.examId,
          badge: {
            is: {
              domainId: { not: null },
            },
          },
        },
        include: {
          badge: {
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
              domain: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      }),
      prisma.examCertificateTemplate.findUnique({
        where: { examId: attempt.examId },
        select: {
          isEnabled: true,
          title: true,
        },
      }),
      prisma.certificate.findFirst({
        where: {
          userId: user.id,
          examId: attempt.examId,
          attemptId: attempt.id,
        },
        select: {
          id: true,
          certificateTitle: true,
          certificateNumber: true,
          status: true,
        },
      }),
    ]);

    const starsEarned = starAwards.reduce((sum, award) => sum + award.stars, 0);

    // Build result response
    const result: ResultPayload = {
      attemptId: attempt.id,
      examId: attempt.examId,
      examTitle: attempt.exam.title,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      resultsAvailable: true,
      rawScore: attempt.rawScore,
      percentageScore: attempt.percentageScore,
      passed: attempt.passed,
      totalScore: attempt.exam.totalScore,
      passingScore: attempt.exam.passingScore,
      allowReview: attempt.exam.allowReview,
      assessmentKind: attempt.exam.assessmentKind ?? null,
      awardsStars: attempt.exam.awardsStars,
      starValue: attempt.exam.starValue ?? null,
      countsTowardPerformance: attempt.exam.countsTowardPerformance,
      maxAttempts,
      attemptsUsed,
      reviewUnlocked,
      reviewUnlockedByPassing,
      reviewUnlockedByAttempts,
      reviewUnlockedByDeadline,
      rewardOutcome: {
        starsEarned,
        badgesUnlocked: badgeAwards.map((award) => ({
          id: award.badge.id,
          name: award.badge.name,
          slug: award.badge.slug,
          description: award.badge.description ?? null,
          domain: award.badge.domain,
        })),
        certificate: {
          eligible: attempt.exam.assessmentKind === 'FORMAL' && Boolean(certificateTemplate?.isEnabled),
          issued: Boolean(issuedCertificate),
          id: issuedCertificate?.id ?? null,
          title: issuedCertificate?.certificateTitle ?? certificateTemplate?.title ?? null,
          certificateNumber: issuedCertificate?.certificateNumber ?? null,
        },
      },
    };

    // Include answers if review is allowed
    if (attempt.exam.allowReview && reviewUnlocked) {
      result.answers = attempt.answers.map(answer => {
        const questionType = answer.question.type;
        const questionTypeRaw = String(questionType);
        const options = answer.question.options as string[] | null;

        const formatMcOption = (index: number | null | undefined) => {
          if (!options || index == null) return null;
          if (index < 0 || index >= options.length) return null;
          return `${String.fromCharCode(65 + index)}. ${options[index]}`;
        };

        let userAnswer: string | null = answer.answer;
        if (questionTypeRaw === 'SINGLE_CHOICE') {
          userAnswer = formatMcOption(answer.selectedOption) ?? null;
        } else if (questionTypeRaw === 'MULTIPLE_CHOICE') {
          const selected =
            (answer.answer || '')
              .split(',')
              .map(v => Number.parseInt(v, 10))
              .filter(n => Number.isFinite(n)) || [];
          userAnswer = selected.length
            ? selected.map(idx => formatMcOption(idx)).filter(Boolean).join(', ')
            : formatMcOption(answer.selectedOption) ?? null;
        } else if (questionTypeRaw === 'TRUE_FALSE') {
          userAnswer =
            answer.answer === 'true' ? 'True' : answer.answer === 'false' ? 'False' : null;
        } else if (questionTypeRaw === 'EXERCISE') {
          userAnswer = answer.recordingStatus === 'UPLOADED' ? 'Video submitted' : null;
        }

        let correctAnswer: string | null = answer.question.correctAnswer;
        if (answer.question.correctAnswer) {
          if (questionTypeRaw === 'SINGLE_CHOICE') {
            const idx = Number.parseInt(answer.question.correctAnswer, 10);
            correctAnswer = Number.isFinite(idx) ? formatMcOption(idx) : answer.question.correctAnswer;
          } else if (questionTypeRaw === 'MULTIPLE_CHOICE') {
            const idxList = answer.question.correctAnswer.split(',').map(v => Number.parseInt(v, 10)).filter(n => Number.isFinite(n));
            correctAnswer = idxList.length
              ? idxList.map(idx => formatMcOption(idx)).filter(Boolean).join(', ')
              : answer.question.correctAnswer;
          } else if (questionTypeRaw === 'TRUE_FALSE') {
            correctAnswer =
              answer.question.correctAnswer === 'true'
                ? 'True'
                : answer.question.correctAnswer === 'false'
                  ? 'False'
                  : answer.question.correctAnswer;
          }
        }
        if (questionTypeRaw === 'EXERCISE') {
          correctAnswer = null;
        }

        const answerResult: ResultAnswer = {
          questionId: answer.questionId,
          question: answer.question.question,
          type: questionType,
          points: answer.question.points,
          maxPoints: answer.question.points,
          userAnswer,
          selectedOption: answer.selectedOption,
          isCorrect: answer.isCorrect,
          pointsAwarded: answer.pointsAwarded,
          gradingStatus: answer.gradingStatus,
          recordingStatus: answer.recordingStatus ?? null,
        };

        // Include options for MC questions
        if (options) {
          answerResult.options = options;
        }

        // Include correct answer for review
        if (correctAnswer) {
          answerResult.correctAnswer = correctAnswer;
        }

        // Include explanation
        if (answer.question.explanation) {
          answerResult.explanation = answer.question.explanation;
        }

        if (answer.adminFeedback) {
          answerResult.feedback = answer.adminFeedback;
        }

        return answerResult;
      });
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Get result error:', error);

    if (error instanceof Error && error.message === 'ATTEMPT_NOT_FOUND') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ATTEMPT_NOT_FOUND',
            message: 'Attempt not found',
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
          message: 'Failed to get exam result',
        },
      },
      { status: 500 }
    );
  }
});
