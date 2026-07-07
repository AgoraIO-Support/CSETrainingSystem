import prisma from '@/lib/prisma'
import { KnowledgeContextService } from '@/lib/services/knowledge-context.service'
import { createLLMChatCompletion } from '@/lib/services/llm-chat-client'
import { ExamAttemptService } from '@/lib/services/exam-attempt.service'
import { AIPromptUseCase, ExamAttemptStatus } from '@prisma/client'
import { AIPromptResolverService, type ResolvedAIPrompt } from '@/lib/services/ai-prompt-resolver.service'

export type LearningAgentAction = 'lesson_coach' | 'exam_mistake_review' | 'learning_plan'

export type LearningAgentResult = {
    action: LearningAgentAction
    answer: string
    model: string
    provider: string
    metadata: Record<string, unknown>
}

type LessonContextPayload = {
    courseTitle: string
    chapterTitle: string
    lessonTitle: string
    xml: string
    anchors: Array<{
        title: string
        summary: string
        timestampStr: string
        anchorType: string
        keyTerms: string[]
    }>
}

type RecentExamWeaknessContext = {
    attemptsReviewed: number
    weakAnswers: Array<{
        examTitle: string
        submittedAt: Date | null
        percentageScore: number | null
        passed: boolean | null
        question: string
        type: string
        topic: string | null
        tags: string[]
        userAnswer: string | number | null
        correctAnswer: string | null
        explanation: string | null
        feedback: string | null
        pointsAwarded: number | null
        maxPoints: number
    }>
    weakTopics: Array<{
        topic: string
        misses: number
        pointsLost: number
    }>
}

const DEFAULT_LESSON_COACH_SYSTEM_PROMPT = [
    'You are a learning coach for a CSE training platform.',
    'Use only the supplied course knowledge context, progress data, and recent exam weakness data.',
    'Return concise Markdown. Include timestamp citations like [00:01:23] when referring to lesson content.',
    'Do not invent product facts or training requirements that are not in the supplied context.',
    'If recent exam weakness data is relevant, connect the lesson focus to those gaps. If it is not relevant, say so briefly and prioritize the lesson context.',
].join('\n')

const DEFAULT_LESSON_COACH_USER_PROMPT = [
    'Course: {{courseTitle}}',
    'Chapter: {{chapterTitle}}',
    'Lesson: {{lessonTitle}}',
    'Course progress: {{courseProgressPercent}}% ({{enrollmentStatus}})',
    'Lesson completed: {{lessonCompleted}}',
    'Watched duration seconds: {{watchedDurationSeconds}}',
    'Last timestamp seconds: {{lastTimestampSeconds}}',
    'Current timestamp seconds: {{currentTimestampSeconds}}',
    '',
    'Key moments:',
    '{{keyMomentsJson}}',
    '',
    'Recent exam weakness data for this course:',
    '{{examWeaknessJson}}',
    '',
    'Knowledge context XML:',
    '{{knowledgeContextXml}}',
    '',
    'Create a practical coaching response with these sections:',
    '1. What to focus on now',
    '2. Why this matters for your recent exam gaps',
    '3. 3 checkpoint questions',
    '4. Next 10-minute study path',
].join('\n')

function truncate(value: string, maxChars: number): string {
    if (value.length <= maxChars) return value
    return `${value.slice(0, maxChars)}\n\n[truncated ${value.length - maxChars} chars]`
}

function parseJsonAnswer(raw: string): { answer: string; metadata?: Record<string, unknown> } {
    try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && typeof parsed.answer === 'string') {
            return {
                answer: parsed.answer,
                metadata: typeof parsed.metadata === 'object' && parsed.metadata ? parsed.metadata : undefined,
            }
        }
    } catch {
        // Fall through to plain text.
    }
    return { answer: raw }
}

async function getRecentExamWeaknessContext(params: {
    userId: string
    courseId: string
}): Promise<RecentExamWeaknessContext> {
    const attempts = await prisma.examAttempt.findMany({
        where: {
            userId: params.userId,
            status: { in: [ExamAttemptStatus.SUBMITTED, ExamAttemptStatus.GRADED] },
            exam: { courseId: params.courseId },
        },
        include: {
            exam: {
                select: {
                    title: true,
                },
            },
            answers: {
                include: {
                    question: {
                        select: {
                            type: true,
                            question: true,
                            correctAnswer: true,
                            explanation: true,
                            points: true,
                            topic: true,
                            tags: true,
                        },
                    },
                },
            },
            questionSnapshots: {
                orderBy: { order: 'asc' },
                select: {
                    questionId: true,
                    type: true,
                    question: true,
                    correctAnswer: true,
                    explanation: true,
                    points: true,
                    topic: true,
                    tags: true,
                },
            },
        },
        orderBy: { submittedAt: 'desc' },
        take: 5,
    })

    const weakAnswers: RecentExamWeaknessContext['weakAnswers'] = []
    const topicStats = new Map<string, { misses: number; pointsLost: number }>()

    for (const attempt of attempts) {
        const snapshotByQuestionId = new Map(
            attempt.questionSnapshots.map((snapshot) => [snapshot.questionId, snapshot] as const)
        )

        for (const answer of attempt.answers) {
            const snapshot = snapshotByQuestionId.get(answer.questionId)
            const maxPoints = snapshot?.points ?? answer.question.points
            const pointsAwarded = answer.pointsAwarded == null ? null : Number(answer.pointsAwarded)
            const isWeak =
                answer.isCorrect === false ||
                (pointsAwarded != null && pointsAwarded < maxPoints)

            if (!isWeak) continue

            const topic = snapshot?.topic ?? answer.question.topic ?? null
            const tags = snapshot?.tags ?? answer.question.tags ?? []
            const pointsLost = Math.max(0, maxPoints - (pointsAwarded ?? 0))

            weakAnswers.push({
                examTitle: attempt.exam.title,
                submittedAt: attempt.submittedAt,
                percentageScore: attempt.percentageScore,
                passed: attempt.passed,
                question: snapshot?.question ?? answer.question.question,
                type: snapshot?.type ?? answer.question.type,
                topic,
                tags,
                userAnswer: answer.answer ?? answer.selectedOption ?? null,
                correctAnswer: snapshot?.correctAnswer ?? answer.question.correctAnswer,
                explanation: snapshot?.explanation ?? answer.question.explanation,
                feedback: answer.adminFeedback ?? answer.aiFeedback ?? null,
                pointsAwarded,
                maxPoints,
            })

            for (const key of [topic, ...tags].filter((value): value is string => Boolean(value?.trim()))) {
                const existing = topicStats.get(key) ?? { misses: 0, pointsLost: 0 }
                topicStats.set(key, {
                    misses: existing.misses + 1,
                    pointsLost: existing.pointsLost + pointsLost,
                })
            }
        }
    }

    return {
        attemptsReviewed: attempts.length,
        weakAnswers: weakAnswers.slice(0, 12),
        weakTopics: Array.from(topicStats.entries())
            .map(([topic, stats]) => ({ topic, ...stats }))
            .sort((a, b) => b.misses - a.misses || b.pointsLost - a.pointsLost)
            .slice(0, 8),
    }
}

async function getLessonContext(lessonId: string): Promise<LessonContextPayload | null> {
    const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        select: {
            id: true,
            title: true,
            chapter: {
                select: {
                    title: true,
                    course: {
                        select: {
                            id: true,
                            title: true,
                        },
                    },
                },
            },
        },
    })
    if (!lesson) return null

    const knowledgeService = new KnowledgeContextService()
    const [xml, anchors] = await Promise.all([
        knowledgeService.getKnowledgeContext(lessonId),
        knowledgeService.getAnchors(lessonId),
    ])
    if (!xml) return null

    return {
        courseTitle: lesson.chapter.course.title,
        chapterTitle: lesson.chapter.title,
        lessonTitle: lesson.title,
        xml,
        anchors: anchors.map((anchor) => ({
            title: anchor.title,
            summary: anchor.summary,
            timestampStr: anchor.timestampStr,
            anchorType: anchor.anchorType,
            keyTerms: anchor.keyTerms,
        })),
    }
}

async function callLearningAgent(params: {
    action: LearningAgentAction
    promptConfig: ResolvedAIPrompt
    systemPrompt: string
    userPrompt: string
    metadata: Record<string, unknown>
}): Promise<LearningAgentResult> {
    const response = await createLLMChatCompletion({
        provider: params.promptConfig.provider,
        model: params.promptConfig.model,
        messages: [
            { role: 'system', content: params.systemPrompt },
            { role: 'user', content: params.userPrompt },
        ],
        temperature: params.promptConfig.temperature,
        maxTokens: params.promptConfig.maxTokens,
        logContext: {
            useCase: 'learning-agent',
            action: params.action,
            templateSource: params.promptConfig.source,
            templateId: params.promptConfig.templateId,
            templateName: params.promptConfig.templateName,
        },
    })
    const parsed = parseJsonAnswer(response.content)
    return {
        action: params.action,
        answer: parsed.answer,
        model: response.model,
        provider: response.provider,
        metadata: {
            ...params.metadata,
            promptUseCase: params.promptConfig.useCase,
            templateSource: params.promptConfig.source,
            templateId: params.promptConfig.templateId,
            templateName: params.promptConfig.templateName,
            ...(parsed.metadata ?? {}),
        },
    }
}

export class LearningAgentService {
    static async createLessonCoach(params: {
        userId: string
        courseId: string
        lessonId: string
        currentTimestamp?: number
    }): Promise<LearningAgentResult> {
        const enrollment = await prisma.enrollment.findUnique({
            where: { userId_courseId: { userId: params.userId, courseId: params.courseId } },
            select: { progress: true, status: true },
        })
        if (!enrollment) throw new Error('NOT_ENROLLED')

        const [lessonContext, lessonProgress, examWeaknessContext, promptConfig] = await Promise.all([
            getLessonContext(params.lessonId),
            prisma.lessonProgress.findUnique({
                where: { userId_lessonId: { userId: params.userId, lessonId: params.lessonId } },
                select: { completed: true, watchedDuration: true, lastTimestamp: true },
            }),
            getRecentExamWeaknessContext({
                userId: params.userId,
                courseId: params.courseId,
            }),
            AIPromptResolverService.resolve({
                useCase: AIPromptUseCase.LEARNING_AGENT_LESSON_COACH,
                courseId: params.courseId,
            }),
        ])
        if (!lessonContext) throw new Error('KNOWLEDGE_CONTEXT_NOT_READY')

        const promptVars = {
            courseTitle: lessonContext.courseTitle,
            chapterTitle: lessonContext.chapterTitle,
            lessonTitle: lessonContext.lessonTitle,
            courseProgressPercent: Math.round(enrollment.progress),
            enrollmentStatus: enrollment.status,
            lessonCompleted: lessonProgress?.completed ? 'yes' : 'no',
            watchedDurationSeconds: lessonProgress?.watchedDuration ?? 0,
            lastTimestampSeconds: lessonProgress?.lastTimestamp ?? 0,
            currentTimestampSeconds: params.currentTimestamp != null ? Math.floor(params.currentTimestamp) : '',
            keyMomentsJson: JSON.stringify(lessonContext.anchors.slice(0, 12), null, 2),
            examWeaknessJson: JSON.stringify(examWeaknessContext, null, 2),
            knowledgeContextXml: truncate(lessonContext.xml, 18000),
        }

        const systemPrompt = AIPromptResolverService.render(
            promptConfig.systemPrompt || DEFAULT_LESSON_COACH_SYSTEM_PROMPT,
            promptVars
        )
        const userPrompt = AIPromptResolverService.render(
            promptConfig.userPrompt || DEFAULT_LESSON_COACH_USER_PROMPT,
            promptVars
        )

        return callLearningAgent({
            action: 'lesson_coach',
            promptConfig,
            systemPrompt,
            userPrompt,
            metadata: {
                courseId: params.courseId,
                lessonId: params.lessonId,
                anchorsUsed: lessonContext.anchors.length,
                examAttemptsReviewed: examWeaknessContext.attemptsReviewed,
                weakAnswerCount: examWeaknessContext.weakAnswers.length,
                weakTopics: examWeaknessContext.weakTopics.map((item) => item.topic),
                promptVariables: Object.keys(promptVars),
            },
        })
    }

    static async createExamMistakeReview(params: {
        userId: string
        examId: string
        attemptId?: string | null
    }): Promise<LearningAgentResult> {
        const attempt = params.attemptId
            ? await ExamAttemptService.getAttemptWithAnswers(params.attemptId)
            : await this.getLatestCompletedAttempt(params.userId, params.examId)

        if (attempt.userId !== params.userId || attempt.examId !== params.examId) {
            throw new Error('FORBIDDEN')
        }

        const promptConfig = await AIPromptResolverService.resolve({
            useCase: AIPromptUseCase.LEARNING_AGENT_EXAM_MISTAKE_REVIEW,
            examId: params.examId,
        })

        const mistakes = attempt.answers
            .filter((answer) => answer.isCorrect === false || (answer.pointsAwarded != null && answer.pointsAwarded < answer.question.points))
            .slice(0, 12)
            .map((answer) => ({
                question: answer.question.question,
                type: answer.question.type,
                userAnswer: answer.answer || answer.selectedOption,
                correctAnswer: answer.question.correctAnswer,
                explanation: answer.question.explanation,
                feedback: answer.adminFeedback,
                pointsAwarded: answer.pointsAwarded,
                maxPoints: answer.question.points,
            }))

        const systemPrompt = [
            'You are an exam review coach.',
            'Use only the supplied exam result data.',
            'Do not shame the learner. Explain misunderstandings clearly and turn mistakes into a short remediation plan.',
            'Return concise Markdown.',
        ].join('\n')

        const userPrompt = [
            `Exam: ${attempt.exam.title}`,
            `Score: ${attempt.rawScore ?? 'unknown'} / ${attempt.exam.totalScore}`,
            `Percentage: ${attempt.percentageScore ?? 'unknown'}%`,
            `Passed: ${attempt.passed ? 'yes' : 'no'}`,
            '',
            'Mistakes / partial-credit answers:',
            JSON.stringify(mistakes, null, 2),
            '',
            'Create a review with these sections:',
            '1. Main misunderstanding patterns',
            '2. Question-by-question correction notes',
            '3. What to review before retrying',
        ].join('\n')

        return callLearningAgent({
            action: 'exam_mistake_review',
            promptConfig,
            systemPrompt,
            userPrompt,
            metadata: {
                examId: params.examId,
                attemptId: attempt.id,
                mistakeCount: mistakes.length,
            },
        })
    }

    static async createLearningPlan(params: { userId: string }): Promise<LearningAgentResult> {
        const [enrollments, recentAttempts, promptConfig] = await Promise.all([
            prisma.enrollment.findMany({
                where: { userId: params.userId },
                include: {
                    course: {
                        select: {
                            id: true,
                            title: true,
                            level: true,
                            category: true,
                            chapters: {
                                select: {
                                    lessons: {
                                        select: {
                                            id: true,
                                            title: true,
                                            order: true,
                                            progress: {
                                                where: { userId: params.userId },
                                                select: { completed: true, watchedDuration: true, lastTimestamp: true },
                                                take: 1,
                                            },
                                        },
                                        orderBy: { order: 'asc' },
                                    },
                                },
                                orderBy: { order: 'asc' },
                            },
                        },
                    },
                },
                orderBy: [{ lastAccessedAt: 'desc' }, { enrolledAt: 'desc' }],
                take: 8,
            }),
            prisma.examAttempt.findMany({
                where: {
                    userId: params.userId,
                    status: { in: [ExamAttemptStatus.SUBMITTED, ExamAttemptStatus.GRADED] },
                },
                include: {
                    exam: { select: { id: true, title: true, passingScore: true, totalScore: true } },
                },
                orderBy: { submittedAt: 'desc' },
                take: 8,
            }),
            AIPromptResolverService.resolve({
                useCase: AIPromptUseCase.LEARNING_AGENT_PLAN,
            }),
        ])

        const courseSummaries = enrollments.map((enrollment) => {
            const lessons = enrollment.course.chapters.flatMap((chapter) => chapter.lessons)
            const nextLesson = lessons.find((lesson) => !lesson.progress[0]?.completed)
            return {
                courseId: enrollment.courseId,
                title: enrollment.course.title,
                category: enrollment.course.category,
                level: enrollment.course.level,
                progress: Math.round(enrollment.progress),
                status: enrollment.status,
                nextLesson: nextLesson ? { id: nextLesson.id, title: nextLesson.title } : null,
            }
        })

        const systemPrompt = [
            'You are a pragmatic learning planner for a CSE training platform.',
            'Use only the supplied progress and exam data.',
            'Return concise Markdown with a concrete plan for the next 7 days.',
        ].join('\n')

        const userPrompt = [
            'Current courses:',
            JSON.stringify(courseSummaries, null, 2),
            '',
            'Recent exam attempts:',
            JSON.stringify(recentAttempts.map((attempt) => ({
                examId: attempt.examId,
                title: attempt.exam.title,
                percentageScore: attempt.percentageScore,
                passed: attempt.passed,
                submittedAt: attempt.submittedAt,
            })), null, 2),
            '',
            'Create a plan with these sections:',
            '1. Priority order',
            '2. Daily plan for the next 7 days',
            '3. Risks to watch',
        ].join('\n')

        return callLearningAgent({
            action: 'learning_plan',
            promptConfig,
            systemPrompt,
            userPrompt,
            metadata: {
                enrolledCourseCount: enrollments.length,
                recentAttemptCount: recentAttempts.length,
            },
        })
    }

    private static async getLatestCompletedAttempt(userId: string, examId: string) {
        const attempt = await prisma.examAttempt.findFirst({
            where: {
                userId,
                examId,
                status: { in: [ExamAttemptStatus.SUBMITTED, ExamAttemptStatus.GRADED] },
            },
            orderBy: { submittedAt: 'desc' },
        })
        if (!attempt) throw new Error('ATTEMPT_NOT_FOUND')
        return ExamAttemptService.getAttemptWithAnswers(attempt.id)
    }
}
