/**
 * Exam Analytics Service
 * Statistics, reports, and CSV export for exam data
 */

import prisma from '@/lib/prisma';
import { ExamAttemptStatus, ExamQuestionType } from '@prisma/client';

export interface ExamAnalytics {
  examId: string;
  examTitle: string;
  summary: {
    totalAttempts: number;
    uniqueUsers: number;
    completedAttempts: number;
    passedCount: number;
    failedCount: number;
    passRate: number;
    averageScore: number;
    medianScore: number;
    minScore: number;
    maxScore: number;
    averageCompletionTime: number; // in minutes
  };
  questionStats: Array<{
    questionId: string;
    questionText: string;
    type: ExamQuestionType;
    totalAnswers: number;
    correctCount: number;
    incorrectCount: number;
    unansweredCount: number;
    correctRate: number;
    averagePoints: number;
    maxPoints: number;
    // For MC questions: option distribution
    optionDistribution?: Record<string, number>;
  }>;
  scoreDistribution: {
    ranges: Array<{
      label: string;
      min: number;
      max: number;
      count: number;
      percentage: number;
    }>;
  };
  timeline: Array<{
    date: string;
    attempts: number;
    passed: number;
    averageScore: number;
  }>;
}

export interface AttemptExportRow {
  attemptId: string;
  userName: string;
  userEmail: string;
  attemptNumber: number;
  status: string;
  startedAt: string;
  submittedAt: string | null;
  completionTimeMinutes: number | null;
  rawScore: number | null;
  percentageScore: number | null;
  passed: boolean | null;
  // Question answers as dynamic columns
  [questionKey: string]: string | number | boolean | null;
}

export class ExamAnalyticsService {
  /**
   * Get comprehensive analytics for an exam
   */
  static async getExamAnalytics(examId: string): Promise<ExamAnalytics> {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!exam) {
      throw new Error('EXAM_NOT_FOUND');
    }

    // Get all attempts with answers
    const attempts = await prisma.examAttempt.findMany({
      where: { examId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        answers: {
          include: {
            question: true,
          },
        },
      },
      orderBy: { startedAt: 'asc' },
    });

    // Calculate summary statistics
    const completedAttempts = attempts.filter(
      a => a.status === ExamAttemptStatus.SUBMITTED || a.status === ExamAttemptStatus.GRADED
    );
    const gradedAttempts = attempts.filter(a => a.status === ExamAttemptStatus.GRADED);
    const passedAttempts = gradedAttempts.filter(a => a.passed === true);
    const failedAttempts = gradedAttempts.filter(a => a.passed === false);

    const scores = gradedAttempts
      .map(a => a.percentageScore)
      .filter((s): s is number => s !== null)
      .sort((a, b) => a - b);

    const uniqueUserIds = new Set(attempts.map(a => a.userId));

    const completionTimes = completedAttempts
      .filter(a => a.submittedAt && a.startedAt)
      .map(a => (a.submittedAt!.getTime() - a.startedAt.getTime()) / 1000 / 60);

    const summary = {
      totalAttempts: attempts.length,
      uniqueUsers: uniqueUserIds.size,
      completedAttempts: completedAttempts.length,
      passedCount: passedAttempts.length,
      failedCount: failedAttempts.length,
      passRate: gradedAttempts.length > 0
        ? (passedAttempts.length / gradedAttempts.length) * 100
        : 0,
      averageScore: scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0,
      medianScore: scores.length > 0
        ? scores[Math.floor(scores.length / 2)]
        : 0,
      minScore: scores.length > 0 ? Math.min(...scores) : 0,
      maxScore: scores.length > 0 ? Math.max(...scores) : 0,
      averageCompletionTime: completionTimes.length > 0
        ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
        : 0,
    };

    // Calculate question statistics
    const questionStats = await this.calculateQuestionStats(exam.questions, attempts);

    // Calculate score distribution
    const scoreDistribution = this.calculateScoreDistribution(scores);

    // Calculate timeline (daily aggregates)
    const timeline = this.calculateTimeline(attempts);

    return {
      examId: exam.id,
      examTitle: exam.title,
      summary,
      questionStats,
      scoreDistribution,
      timeline,
    };
  }

  /**
   * Calculate per-question statistics
   */
  private static async calculateQuestionStats(
    questions: any[],
    attempts: any[]
  ): Promise<ExamAnalytics['questionStats']> {
    const stats: ExamAnalytics['questionStats'] = [];

    for (const question of questions) {
      // Get all answers for this question
      const answers = attempts.flatMap(a =>
        a.answers.filter((ans: any) => ans.questionId === question.id)
      );

      const correctCount = answers.filter((a: any) => a.isCorrect === true).length;
      const incorrectCount = answers.filter((a: any) => a.isCorrect === false).length;
      const unansweredCount = attempts.length - answers.length;

      const totalPoints = answers.reduce(
        (sum: number, a: any) => sum + (a.pointsAwarded || 0),
        0
      );

      // Calculate option distribution for MC questions
      let optionDistribution: Record<string, number> | undefined;
      if (question.type === ExamQuestionType.MULTIPLE_CHOICE && question.options) {
        optionDistribution = {};
        const options = question.options as string[];
        options.forEach((opt, idx) => {
          optionDistribution![`Option ${String.fromCharCode(65 + idx)}`] = 0;
        });

        answers.forEach((a: any) => {
          if (a.selectedOption !== null && a.selectedOption >= 0) {
            const optKey = `Option ${String.fromCharCode(65 + a.selectedOption)}`;
            optionDistribution![optKey] = (optionDistribution![optKey] || 0) + 1;
          }
        });
      }

      stats.push({
        questionId: question.id,
        questionText: question.question.substring(0, 100) + (question.question.length > 100 ? '...' : ''),
        type: question.type,
        totalAnswers: answers.length,
        correctCount,
        incorrectCount,
        unansweredCount,
        correctRate: answers.length > 0 ? (correctCount / answers.length) * 100 : 0,
        averagePoints: answers.length > 0 ? totalPoints / answers.length : 0,
        maxPoints: question.points,
        optionDistribution,
      });
    }

    return stats;
  }

  /**
   * Calculate score distribution in ranges
   */
  private static calculateScoreDistribution(scores: number[]): ExamAnalytics['scoreDistribution'] {
    const ranges = [
      { label: '0-20%', min: 0, max: 20 },
      { label: '21-40%', min: 21, max: 40 },
      { label: '41-60%', min: 41, max: 60 },
      { label: '61-80%', min: 61, max: 80 },
      { label: '81-100%', min: 81, max: 100 },
    ];

    return {
      ranges: ranges.map(range => {
        const count = scores.filter(s => s >= range.min && s <= range.max).length;
        return {
          ...range,
          count,
          percentage: scores.length > 0 ? (count / scores.length) * 100 : 0,
        };
      }),
    };
  }

  /**
   * Calculate daily timeline
   */
  private static calculateTimeline(attempts: any[]): ExamAnalytics['timeline'] {
    const dailyData: Record<string, { attempts: number; passed: number; scores: number[] }> = {};

    for (const attempt of attempts) {
      const dateKey = attempt.startedAt.toISOString().split('T')[0];

      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { attempts: 0, passed: 0, scores: [] };
      }

      dailyData[dateKey].attempts++;

      if (attempt.passed === true) {
        dailyData[dateKey].passed++;
      }

      if (attempt.percentageScore !== null) {
        dailyData[dateKey].scores.push(attempt.percentageScore);
      }
    }

    return Object.entries(dailyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        attempts: data.attempts,
        passed: data.passed,
        averageScore: data.scores.length > 0
          ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
          : 0,
      }));
  }

  /**
   * Export exam attempts to CSV format
   */
  static async exportToCSV(examId: string): Promise<string> {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!exam) {
      throw new Error('EXAM_NOT_FOUND');
    }

    const attempts = await prisma.examAttempt.findMany({
      where: { examId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        answers: {
          include: {
            question: true,
          },
        },
      },
      orderBy: [{ user: { email: 'asc' } }, { attemptNumber: 'asc' }],
    });

    // Build CSV header
    const baseHeaders = [
      'Attempt ID',
      'User Name',
      'User Email',
      'Attempt Number',
      'Status',
      'Started At',
      'Submitted At',
      'Completion Time (min)',
      'Raw Score',
      'Percentage Score',
      'Passed',
    ];

    // Add question columns
    const questionHeaders = exam.questions.map(
      (q, idx) => `Q${idx + 1} (${q.type})`
    );
    const pointsHeaders = exam.questions.map((q, idx) => `Q${idx + 1} Points`);

    const headers = [...baseHeaders, ...questionHeaders, ...pointsHeaders];

    // Build rows
    const rows = attempts.map(attempt => {
      const completionTime = attempt.submittedAt && attempt.startedAt
        ? ((attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000 / 60).toFixed(2)
        : '';

      const baseData = [
        attempt.id,
        attempt.user.name || '',
        attempt.user.email,
        attempt.attemptNumber.toString(),
        attempt.status,
        attempt.startedAt.toISOString(),
        attempt.submittedAt?.toISOString() || '',
        completionTime,
        attempt.rawScore?.toString() || '',
        attempt.percentageScore?.toFixed(2) || '',
        attempt.passed === null ? '' : attempt.passed ? 'Yes' : 'No',
      ];

      // Add answer columns
      const answerData = exam.questions.map(q => {
        const answer = attempt.answers.find(a => a.questionId === q.id);
        if (!answer) return '';

        if (q.type === ExamQuestionType.MULTIPLE_CHOICE) {
          return answer.selectedOption !== null
            ? String.fromCharCode(65 + answer.selectedOption)
            : '';
        }
        return answer.answer || '';
      });

      // Add points columns
      const pointsData = exam.questions.map(q => {
        const answer = attempt.answers.find(a => a.questionId === q.id);
        return answer?.pointsAwarded?.toString() || '';
      });

      return [...baseData, ...answerData, ...pointsData];
    });

    // Build CSV string
    const csvLines = [
      headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map(row =>
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ];

    return csvLines.join('\n');
  }

  /**
   * Get leaderboard for an exam
   */
  static async getLeaderboard(
    examId: string,
    limit = 10
  ): Promise<Array<{
    rank: number;
    userId: string;
    userName: string;
    bestScore: number;
    attemptsCount: number;
    completedAt: Date | null;
  }>> {
    const attempts = await prisma.examAttempt.findMany({
      where: {
        examId,
        status: ExamAttemptStatus.GRADED,
        passed: true,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: [
        { percentageScore: 'desc' },
        { submittedAt: 'asc' },
      ],
    });

    // Group by user and get best score
    const userBestScores: Record<string, {
      userId: string;
      userName: string;
      bestScore: number;
      attemptsCount: number;
      completedAt: Date | null;
    }> = {};

    for (const attempt of attempts) {
      const userId = attempt.userId;
      if (!userBestScores[userId] || (attempt.percentageScore || 0) > userBestScores[userId].bestScore) {
        userBestScores[userId] = {
          userId,
          userName: attempt.user.name || attempt.user.email,
          bestScore: attempt.percentageScore || 0,
          attemptsCount: 0,
          completedAt: attempt.submittedAt,
        };
      }
      userBestScores[userId].attemptsCount++;
    }

    // Sort and add ranks
    const sorted = Object.values(userBestScores)
      .sort((a, b) => b.bestScore - a.bestScore)
      .slice(0, limit);

    return sorted.map((entry, idx) => ({
      rank: idx + 1,
      ...entry,
    }));
  }

  /**
   * Save analytics snapshot to database
   */
  static async saveAnalyticsSnapshot(examId: string): Promise<void> {
    const analytics = await this.getExamAnalytics(examId);

    await prisma.examAnalytics.upsert({
      where: { examId },
      create: {
        examId,
        totalAttempts: analytics.summary.totalAttempts,
        passedAttempts: analytics.summary.passedCount,
        failedAttempts: analytics.summary.failedCount,
        averageScore: analytics.summary.averageScore,
        medianScore: analytics.summary.medianScore,
        highestScore: analytics.summary.maxScore,
        lowestScore: analytics.summary.minScore,
        averageTimeMinutes: analytics.summary.averageCompletionTime,
        questionStats: analytics.questionStats as any,
      },
      update: {
        totalAttempts: analytics.summary.totalAttempts,
        passedAttempts: analytics.summary.passedCount,
        failedAttempts: analytics.summary.failedCount,
        averageScore: analytics.summary.averageScore,
        medianScore: analytics.summary.medianScore,
        highestScore: analytics.summary.maxScore,
        lowestScore: analytics.summary.minScore,
        averageTimeMinutes: analytics.summary.averageCompletionTime,
        questionStats: analytics.questionStats as any,
        lastUpdatedAt: new Date(),
      },
    });
  }
}
