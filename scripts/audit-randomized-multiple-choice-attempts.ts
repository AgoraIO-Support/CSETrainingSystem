/**
 * Audit exam attempts that may have been misgraded by the historical
 * MULTIPLE_CHOICE + randomizeOptions bug.
 *
 * The old implementation randomized the displayed options at render time
 * without snapshotting the remapped correctAnswer. That means historical
 * attempts do not contain enough information for a trustworthy automatic
 * regrade. This script reports potentially impacted attempts so admins can
 * review or re-open them manually.
 *
 * Usage:
 *   npx tsx scripts/audit-randomized-multiple-choice-attempts.ts
 *   npx tsx scripts/audit-randomized-multiple-choice-attempts.ts --exam-id <uuid>
 *   npx tsx scripts/audit-randomized-multiple-choice-attempts.ts --before 2026-05-09T12:00:00Z
 */

import prisma from '@/lib/prisma'
import { ExamAttemptStatus, ExamQuestionType } from '@prisma/client'

type CliOptions = {
  examId?: string
  before?: Date
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {}

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--exam-id') {
      options.examId = argv[i + 1]
      i += 1
      continue
    }
    if (arg === '--before') {
      const raw = argv[i + 1]
      const value = raw ? new Date(raw) : null
      if (!value || Number.isNaN(value.getTime())) {
        throw new Error('Invalid --before value. Use an ISO datetime, e.g. 2026-05-09T12:00:00Z')
      }
      options.before = value
      i += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage:',
        '  npx tsx scripts/audit-randomized-multiple-choice-attempts.ts',
        '  npx tsx scripts/audit-randomized-multiple-choice-attempts.ts --exam-id <uuid>',
        '  npx tsx scripts/audit-randomized-multiple-choice-attempts.ts --before <ISO datetime>',
      ].join('\n'))
      process.exit(0)
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  const attempts = await prisma.examAttempt.findMany({
    where: {
      ...(options.examId ? { examId: options.examId } : {}),
      ...(options.before ? { startedAt: { lt: options.before } } : {}),
      status: {
        in: [ExamAttemptStatus.SUBMITTED, ExamAttemptStatus.GRADED],
      },
      exam: {
        randomizeOptions: true,
      },
      answers: {
        some: {
          answer: {
            not: null,
          },
          question: {
            type: ExamQuestionType.MULTIPLE_CHOICE,
          },
        },
      },
    },
    select: {
      id: true,
      examId: true,
      attemptNumber: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      rawScore: true,
      percentageScore: true,
      passed: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      exam: {
        select: {
          id: true,
          title: true,
          randomizeOptions: true,
        },
      },
      questionSnapshots: {
        where: {
          type: ExamQuestionType.MULTIPLE_CHOICE,
        },
        select: {
          questionId: true,
          question: true,
          options: true,
          correctAnswer: true,
          points: true,
        },
      },
      answers: {
        where: {
          answer: {
            not: null,
          },
          question: {
            type: ExamQuestionType.MULTIPLE_CHOICE,
          },
        },
        select: {
          questionId: true,
          answer: true,
          isCorrect: true,
          pointsAwarded: true,
          question: {
            select: {
              question: true,
            },
          },
        },
      },
    },
    orderBy: [
      { startedAt: 'asc' },
      { id: 'asc' },
    ],
  })

  const results = attempts.map((attempt) => ({
    attemptId: attempt.id,
    examId: attempt.examId,
    examTitle: attempt.exam.title,
    userId: attempt.user.id,
    userName: attempt.user.name,
    userEmail: attempt.user.email,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    rawScore: attempt.rawScore,
    percentageScore: attempt.percentageScore,
    passed: attempt.passed,
    multipleChoiceAnswers: attempt.answers.map((answer) => {
      const snapshot = attempt.questionSnapshots.find((item) => item.questionId === answer.questionId)
      return {
        questionId: answer.questionId,
        questionText: answer.question.question,
        submittedAnswer: answer.answer,
        scoredCorrect: answer.isCorrect,
        pointsAwarded: answer.pointsAwarded,
        snapshotCorrectAnswer: snapshot?.correctAnswer ?? null,
        snapshotOptions: snapshot?.options ?? null,
        snapshotPoints: snapshot?.points ?? null,
      }
    }),
  }))

  console.log(`Potentially impacted attempts: ${results.length}`)
  if (options.examId) {
    console.log(`Filtered examId: ${options.examId}`)
  }
  if (options.before) {
    console.log(`Started before: ${options.before.toISOString()}`)
  }
  console.log('')
  console.log(JSON.stringify(results, null, 2))
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
