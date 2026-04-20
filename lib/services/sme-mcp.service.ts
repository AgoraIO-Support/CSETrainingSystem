import prisma from '@/lib/prisma'
import { S3_ASSET_BASE_PREFIX } from '@/lib/aws-s3'
import { TrainingOpsService } from '@/lib/services/training-ops.service'
import { FileService } from '@/lib/services/file.service'
import { KnowledgeContextJobService } from '@/lib/services/knowledge-context-job.service'
import { TranscriptJobService } from '@/lib/services/transcript-job.service'
import { WecomWebhookService } from '@/lib/services/wecom-webhook.service'
import { AuthUser } from '@/lib/auth-middleware'
import { AIPromptUseCase, AssessmentKind, ExamStatus, LearningEventFormat, LearningEventStatus } from '@prisma/client'
import {
    inviteUsersSchema,
} from '@/lib/validations'
import {
    getPrimaryAiTranscriptTrack,
    getTranscriptLabel,
    inferTranscriptLanguageFromFilename,
    normalizeTranscriptLanguage,
} from '@/lib/transcript-tracks'
import { v4 as uuidv4 } from 'uuid'

type MappableUser = Pick<AuthUser, 'id' | 'role'>

type ToolResult<T> = {
    success: true
    tool: string
    summary: string
    data: T
    nextActions: string[]
    warnings?: string[]
}

const AI_ASSISTANT_COURSE_USE_CASE = AIPromptUseCase.AI_ASSISTANT_KNOWLEDGE_CONTEXT_SYSTEM

export class SmeMcpService {
    static async listMyWorkspace(
        user: MappableUser,
        input: {
            domainId?: string
        } = {}
    ): Promise<ToolResult<{
        domains: Awaited<ReturnType<typeof TrainingOpsService.getScopedSummary>>['domains']
        series: Awaited<ReturnType<typeof TrainingOpsService.getScopedSummary>>['series']
        pendingEvents: Awaited<ReturnType<typeof TrainingOpsService.getScopedSummary>>['events']
        draftCourses: Awaited<ReturnType<typeof TrainingOpsService.getScopedCourses>>
        draftExams: Awaited<ReturnType<typeof TrainingOpsService.getScopedExams>>
        atRiskDomains: Awaited<ReturnType<typeof TrainingOpsService.getScopedSummary>>['effectiveness']
        weakTopics: Awaited<ReturnType<typeof TrainingOpsService.getScopedLearnerGaps>>['weakTopics']
        learnerGaps: Awaited<ReturnType<typeof TrainingOpsService.getScopedLearnerGaps>>['learnerGaps']
    }>> {
        const [summary, learnerGaps, courses, exams] = await Promise.all([
            TrainingOpsService.getScopedSummary(user),
            TrainingOpsService.getScopedLearnerGaps(user),
            TrainingOpsService.getScopedCourses(user),
            TrainingOpsService.getScopedExams(user),
        ])

        const domainId = input.domainId

        const domains = domainId
            ? summary.domains.filter((domain) => domain.id === domainId)
            : summary.domains

        const domainIds = new Set(domains.map((domain) => domain.id))
        const series = domainId
            ? summary.series.filter((item) => item.domain?.id ? domainIds.has(item.domain.id) : false)
            : summary.series

        const seriesIds = new Set(series.map((item) => item.id))
        const pendingEvents = summary.events
            .filter((event) => {
                const matchesDomain = !domainId || (event.domain?.id ? domainIds.has(event.domain.id) : false)
                const matchesSeries = !domainId || (event.series?.id ? seriesIds.has(event.series.id) : false)
                return matchesDomain && matchesSeries && event.status !== 'COMPLETED' && event.status !== 'CANCELED'
            })
            .slice(0, 10)

        const draftCourses = courses
            .filter((course) => course.status === 'DRAFT' && (!domainId || course.category === domains[0]?.name))
            .slice(0, 10)

        const draftExams = exams
            .filter((exam) => exam.status === 'DRAFT' && (!domainId || exam.productDomainId === domainId))
            .slice(0, 10)

        const atRiskDomains = summary.effectiveness
            .filter((row) => (!domainId || row.id === domainId) && row.status !== 'ON_TRACK')
            .slice(0, 10)

        return {
            success: true,
            tool: 'list_my_workspace',
            summary: `Returned ${domains.length} domains, ${series.length} series, and ${pendingEvents.length} pending events.`,
            data: {
                domains,
                series,
                pendingEvents,
                draftCourses,
                draftExams,
                atRiskDomains,
                weakTopics: learnerGaps.weakTopics,
                learnerGaps: learnerGaps.learnerGaps,
            },
            nextActions: ['create_case_study_bundle', 'get_event_execution_status', 'list_my_series_badges'],
        }
    }

    static async createCaseStudyBundle(
        user: MappableUser,
        input: {
            domainId: string
            seriesId: string
            title: string
            scheduledAt?: Date | null
            description?: string | null
            hostId?: string | null
            starValue?: number | null
            assessmentKind?: AssessmentKind
            countsTowardPerformance?: boolean
        }
    ): Promise<ToolResult<{
        event: Awaited<ReturnType<typeof TrainingOpsService.createScopedLearningEvent>>
        course: Awaited<ReturnType<typeof TrainingOpsService.createScopedDraftCourseFromEvent>>
        exam: {
            id: string
            title: string
            description: string | null
            instructions: string | null
            status: ExamStatus
            assessmentKind: AssessmentKind
            awardsStars: boolean
            starValue: number | null
            countsTowardPerformance: boolean
            productDomain: {
                id: string
                name: string
                slug: string
            } | null
            learningSeries: {
                id: string
                name: string
                slug: string
            } | null
            learningEvent: {
                id: string
                title: string
            } | null
        }
    }>> {
        const event = await TrainingOpsService.createScopedLearningEvent(user, {
            title: input.title,
            format: LearningEventFormat.CASE_STUDY,
            status: input.scheduledAt ? LearningEventStatus.SCHEDULED : LearningEventStatus.DRAFT,
            domainId: input.domainId,
            seriesId: input.seriesId,
            description: input.description ?? null,
            scheduledAt: input.scheduledAt ?? null,
            startsAt: input.scheduledAt ?? null,
            endsAt: null,
            isRequired: false,
            countsTowardPerformance: input.countsTowardPerformance ?? false,
            starValue: input.starValue ?? 2,
            hostId: input.hostId ?? user.id,
        })

        const [course, createdExam] = await Promise.all([
            TrainingOpsService.createScopedDraftCourseFromEvent(user, event.id),
            TrainingOpsService.createScopedDraftExamFromEvent(user, event.id),
        ])

        const exam = await prisma.exam.update({
            where: { id: createdExam.id },
            data: {
                assessmentKind: input.assessmentKind ?? AssessmentKind.PRACTICE,
                awardsStars: (input.starValue ?? 2) > 0,
                starValue: input.starValue ?? 2,
                countsTowardPerformance: input.countsTowardPerformance ?? false,
                description: input.description ?? createdExam.description,
                instructions: input.description ?? createdExam.instructions,
            },
            include: {
                learningEvent: { select: { id: true, title: true } },
                learningSeries: { select: { id: true, name: true, slug: true } },
                productDomain: { select: { id: true, name: true, slug: true } },
            },
        })

        return {
            success: true,
            tool: 'create_case_study_bundle',
            summary: `Created case study bundle for "${input.title}" with one event, one draft course, and one draft exam.`,
            data: {
                event,
                course,
                exam,
            },
            nextActions: ['set_course_ai_template', 'get_event_execution_status'],
        }
    }

    static async setCourseAiTemplate(
        user: MappableUser,
        input: {
            courseId: string
            templateId?: string
            useDefault?: boolean
            enabled?: boolean
        }
    ): Promise<ToolResult<{
        mode: 'default' | 'template'
        assignment: {
            id: string
            courseId: string
            templateId: string
            isEnabled: boolean
            useCase: AIPromptUseCase
        } | null
        template: {
            id: string
            name: string
            useCase: AIPromptUseCase
        } | null
    }>> {
        await TrainingOpsService.assertScopedCourseAccess(user, input.courseId)

        if (input.useDefault) {
            const warnings: string[] = []

            await prisma.courseAIPromptAssignment.deleteMany({
                where: {
                    courseId: input.courseId,
                    useCase: AI_ASSISTANT_COURSE_USE_CASE,
                },
            })

            const defaultTemplate = await prisma.aIPromptDefault.findUnique({
                where: { useCase: AI_ASSISTANT_COURSE_USE_CASE },
                include: {
                    template: {
                        select: {
                            id: true,
                            name: true,
                            useCase: true,
                            isActive: true,
                        },
                    },
                },
            })

            const activeDefaultTemplate = defaultTemplate?.template?.isActive
                ? {
                    id: defaultTemplate.template.id,
                    name: defaultTemplate.template.name,
                    useCase: defaultTemplate.template.useCase,
                }
                : null

            if (!activeDefaultTemplate) {
                warnings.push('No active admin default template is configured for this course use case.')
            }

            return {
                success: true,
                tool: 'set_course_ai_template',
                summary: activeDefaultTemplate
                    ? `Reset the selected course to use the default AI assistant template "${activeDefaultTemplate.name}".`
                    : 'Reset the selected course to use the default AI assistant behavior.',
                data: {
                    mode: 'default',
                    assignment: null,
                    template: activeDefaultTemplate,
                },
                nextActions: ['get_event_execution_status', 'prepare_transcript_upload'],
                ...(warnings.length > 0 ? { warnings } : {}),
            }
        }

        const template = await prisma.aIPromptTemplate.findUnique({
            where: { id: input.templateId },
            select: {
                id: true,
                name: true,
                useCase: true,
                isActive: true,
            },
        })

        if (!template || !template.isActive) {
            throw new Error('PROMPT_TEMPLATE_NOT_FOUND')
        }

        if (template.useCase !== AI_ASSISTANT_COURSE_USE_CASE) {
            throw new Error('PROMPT_TEMPLATE_USE_CASE_MISMATCH')
        }

        const assignment = await prisma.courseAIPromptAssignment.upsert({
            where: {
                courseId_useCase: {
                    courseId: input.courseId,
                    useCase: AI_ASSISTANT_COURSE_USE_CASE,
                },
            },
            create: {
                courseId: input.courseId,
                templateId: template.id,
                useCase: AI_ASSISTANT_COURSE_USE_CASE,
                isEnabled: input.enabled ?? true,
            },
            update: {
                templateId: template.id,
                isEnabled: input.enabled ?? true,
            },
            select: {
                id: true,
                courseId: true,
                templateId: true,
                isEnabled: true,
                useCase: true,
            },
        })

        return {
            success: true,
            tool: 'set_course_ai_template',
            summary: `Applied AI assistant template "${template.name}" to the selected course.`,
            data: {
                mode: 'template',
                assignment,
                template: {
                    id: template.id,
                    name: template.name,
                    useCase: template.useCase,
                },
            },
            nextActions: ['get_event_execution_status', 'prepare_transcript_upload'],
        }
    }

    static async linkExistingCourseToEvent(
        user: MappableUser,
        input: {
            eventId: string
            courseId: string
        }
    ): Promise<ToolResult<{
        event: Awaited<ReturnType<typeof TrainingOpsService.getScopedLearningEventById>>
        course: Awaited<ReturnType<typeof TrainingOpsService.getScopedCourseById>>
    }>> {
        const [event, course] = await Promise.all([
            TrainingOpsService.attachScopedCourseToEvent(user, input.eventId, input.courseId),
            TrainingOpsService.getScopedCourseById(user, input.courseId),
        ])

        return {
            success: true,
            tool: 'link_existing_course_to_event',
            summary: `Linked course "${course.title}" to event "${event.title}".`,
            data: {
                event,
                course,
            },
            nextActions: ['set_course_ai_template', 'get_event_execution_status'],
        }
    }

    static async linkExistingExamToEvent(
        user: MappableUser,
        input: {
            eventId: string
            examId: string
        }
    ): Promise<ToolResult<{
        event: Awaited<ReturnType<typeof TrainingOpsService.getScopedLearningEventById>>
        exam: Awaited<ReturnType<typeof TrainingOpsService.getScopedExamById>>
    }>> {
        const [event, exam] = await Promise.all([
            TrainingOpsService.attachScopedExamToEvent(user, input.eventId, input.examId),
            TrainingOpsService.getScopedExamById(user, input.examId),
        ])

        return {
            success: true,
            tool: 'link_existing_exam_to_event',
            summary: `Linked exam "${exam.title}" to event "${event.title}".`,
            data: {
                event,
                exam,
            },
            nextActions: ['publish_exam_with_invitations', 'get_event_execution_status'],
        }
    }

    static async getEventExecutionStatus(
        user: MappableUser,
        input: {
            eventId: string
        }
    ): Promise<ToolResult<{
        event: Awaited<ReturnType<typeof TrainingOpsService.getScopedLearningEventById>>
        courses: Awaited<ReturnType<typeof TrainingOpsService.getScopedLearningEventById>>['courses']
        exams: Array<{
            id: string
            title: string
            status: ExamStatus
            publishedAt: Date | null
            totalScore: number
            questionCount: number
            questionPoints: number
            invitationCount: number
            attemptCount: number
            gradedAttemptCount: number
            passedCount: number
            failedCount: number
            passRate: number
            publishPreconditionsMet: boolean
            blockers: string[]
        }>
        transcriptStatus: {
            totalLessons: number
            lessonsWithTranscript: number
            lessonsMissingTranscript: number
            readyLessons: number
            processingLessons: number
            failedLessons: number
            activeJobs: number
        }
        knowledgeStatus: {
            totalLessons: number
            readyLessons: number
            missingLessons: number
            processingLessons: number
            failedLessons: number
            activeJobs: number
        }
        invitationStatus: {
            courseEnrollmentCount: number
            examInvitationCount: number
            examAttemptCount: number
            gradedAttemptCount: number
            passedCount: number
            failedCount: number
            passRate: number
        }
        lessonStates: Array<{
            lessonId: string
            lessonTitle: string
            courseId: string
            courseTitle: string
            transcript: {
                id: string
                status: string
                language: string
                isPrimaryForAI: boolean
                isDefaultSubtitle: boolean
                latestJob: {
                    id: string
                    state: string
                    stage: string
                    errorMessage: string | null
                } | null
            } | null
            knowledge: {
                status: string
                latestJob: {
                    id: string
                    state: string
                    stage: string
                    errorMessage: string | null
                } | null
            }
        }>
    }>> {
        const event = await TrainingOpsService.getScopedLearningEventById(user, input.eventId)
        const warnings: string[] = []

        if (event.courses.length > 1) {
            warnings.push(`Event "${event.title}" has ${event.courses.length} linked courses.`)
        }

        if (event.exams.length > 1) {
            warnings.push(`Event "${event.title}" has ${event.exams.length} linked exams.`)
        }

        const linkedExamIds = event.exams.map((exam) => exam.id)
        const [examQuestionStats, examDetails, lessons] = await Promise.all([
            linkedExamIds.length > 0
                ? prisma.examQuestion.groupBy({
                    by: ['examId'],
                    where: {
                        examId: { in: linkedExamIds },
                        archivedAt: null,
                    },
                    _count: {
                        _all: true,
                    },
                    _sum: {
                        points: true,
                    },
                })
                : Promise.resolve([]),
            linkedExamIds.length > 0
                ? prisma.exam.findMany({
                    where: {
                        id: { in: linkedExamIds },
                    },
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        publishedAt: true,
                        totalScore: true,
                    },
                })
                : Promise.resolve([]),
            prisma.lesson.findMany({
                where: {
                    chapter: {
                        course: {
                            learningEventId: input.eventId,
                        },
                    },
                },
                select: {
                    id: true,
                    title: true,
                    chapter: {
                        select: {
                            course: {
                                select: {
                                    id: true,
                                    title: true,
                                },
                            },
                        },
                    },
                    transcripts: {
                        where: {
                            isActive: true,
                            archivedAt: null,
                        },
                        orderBy: [{ isPrimaryForAI: 'desc' }, { isDefaultSubtitle: 'desc' }, { createdAt: 'asc' }],
                        select: {
                            id: true,
                            language: true,
                            status: true,
                            isPrimaryForAI: true,
                            isDefaultSubtitle: true,
                            processingJobs: {
                                orderBy: {
                                    createdAt: 'desc',
                                },
                                take: 1,
                                select: {
                                    id: true,
                                    state: true,
                                    stage: true,
                                    errorMessage: true,
                                },
                            },
                        },
                    },
                    knowledgeContext: {
                        select: {
                            status: true,
                            errorMessage: true,
                        },
                    },
                    knowledgeContextJobs: {
                        orderBy: {
                            createdAt: 'desc',
                        },
                        take: 1,
                        select: {
                            id: true,
                            state: true,
                            stage: true,
                            errorMessage: true,
                        },
                    },
                },
            }),
        ])

        const examQuestionStatsByExamId = new Map(
            examQuestionStats.map((row) => [
                row.examId,
                {
                    questionCount: row._count._all,
                    questionPoints: row._sum.points ?? 0,
                },
            ])
        )
        const eventExamStatsById = new Map(event.exams.map((exam) => [exam.id, exam]))

        const exams = examDetails.map((exam) => {
            const questionStats = examQuestionStatsByExamId.get(exam.id) ?? {
                questionCount: 0,
                questionPoints: 0,
            }
            const operationalStats = eventExamStatsById.get(exam.id)
            const blockers: string[] = []

            if (exam.status !== ExamStatus.APPROVED && exam.status !== ExamStatus.PUBLISHED) {
                blockers.push('Exam must be APPROVED before publishing.')
            }

            if (questionStats.questionCount === 0) {
                blockers.push('Exam has no active questions.')
            }

            if (questionStats.questionPoints !== exam.totalScore) {
                blockers.push('Exam question points do not match the configured exam total score.')
            }

            return {
                id: exam.id,
                title: exam.title,
                status: exam.status,
                publishedAt: exam.publishedAt,
                totalScore: exam.totalScore,
                questionCount: questionStats.questionCount,
                questionPoints: questionStats.questionPoints,
                invitationCount: operationalStats?.invitationCount ?? 0,
                attemptCount: operationalStats?.attemptCount ?? 0,
                gradedAttemptCount: operationalStats?.gradedAttemptCount ?? 0,
                passedCount: operationalStats?.passedCount ?? 0,
                failedCount: operationalStats?.failedCount ?? 0,
                passRate: operationalStats?.passRate ?? 0,
                publishPreconditionsMet: blockers.length === 0,
                blockers,
            }
        })

        const lessonStates = lessons.map((lesson) => {
            const transcript = getPrimaryAiTranscriptTrack(lesson.transcripts)
            const transcriptJob = transcript?.processingJobs[0] ?? null
            const knowledgeJob = lesson.knowledgeContextJobs[0] ?? null

            return {
                lessonId: lesson.id,
                lessonTitle: lesson.title,
                courseId: lesson.chapter.course.id,
                courseTitle: lesson.chapter.course.title,
                transcript: transcript
                    ? {
                        id: transcript.id,
                        status: transcript.status,
                        language: transcript.language,
                        isPrimaryForAI: transcript.isPrimaryForAI,
                        isDefaultSubtitle: transcript.isDefaultSubtitle,
                        latestJob: transcriptJob
                            ? {
                                id: transcriptJob.id,
                                state: transcriptJob.state,
                                stage: transcriptJob.stage,
                                errorMessage: transcriptJob.errorMessage,
                            }
                            : null,
                    }
                    : null,
                knowledge: {
                    status: lesson.knowledgeContext?.status ?? 'MISSING',
                    latestJob: knowledgeJob
                        ? {
                            id: knowledgeJob.id,
                            state: knowledgeJob.state,
                            stage: knowledgeJob.stage,
                            errorMessage: knowledgeJob.errorMessage,
                        }
                        : null,
                },
            }
        })

        const transcriptStatus = lessonStates.reduce(
            (summary, lesson) => {
                summary.totalLessons += 1

                if (!lesson.transcript) {
                    summary.lessonsMissingTranscript += 1
                    return summary
                }

                summary.lessonsWithTranscript += 1

                if (lesson.transcript.status === 'READY') {
                    summary.readyLessons += 1
                }

                if (lesson.transcript.status === 'FAILED') {
                    summary.failedLessons += 1
                }

                if (
                    lesson.transcript.latestJob &&
                    ['QUEUED', 'RUNNING', 'RETRY_WAIT'].includes(lesson.transcript.latestJob.state)
                ) {
                    summary.processingLessons += 1
                    summary.activeJobs += 1
                }

                return summary
            },
            {
                totalLessons: 0,
                lessonsWithTranscript: 0,
                lessonsMissingTranscript: 0,
                readyLessons: 0,
                processingLessons: 0,
                failedLessons: 0,
                activeJobs: 0,
            }
        )

        const knowledgeStatus = lessonStates.reduce(
            (summary, lesson) => {
                summary.totalLessons += 1

                if (lesson.knowledge.status === 'READY') {
                    summary.readyLessons += 1
                } else if (lesson.knowledge.status === 'FAILED') {
                    summary.failedLessons += 1
                } else if (lesson.knowledge.status === 'MISSING') {
                    summary.missingLessons += 1
                }

                if (
                    lesson.knowledge.latestJob &&
                    ['QUEUED', 'RUNNING', 'RETRY_WAIT'].includes(lesson.knowledge.latestJob.state)
                ) {
                    summary.processingLessons += 1
                    summary.activeJobs += 1
                }

                return summary
            },
            {
                totalLessons: 0,
                readyLessons: 0,
                missingLessons: 0,
                processingLessons: 0,
                failedLessons: 0,
                activeJobs: 0,
            }
        )

        if (event.courses.length > 0 && lessonStates.length === 0) {
            warnings.push(`Event "${event.title}" has linked course content, but no lessons are currently attached.`)
        }

        const nextActions = new Set<string>()
        if (event.courses.length === 0) nextActions.add('link_existing_course_to_event')
        if (event.exams.length === 0) nextActions.add('link_existing_exam_to_event')
        if (event.courses.length > 0) nextActions.add('set_course_ai_template')
        if (transcriptStatus.lessonsMissingTranscript > 0) nextActions.add('prepare_transcript_upload')
        if (
            lessonStates.some((lesson) => lesson.transcript !== null && lesson.knowledge.status !== 'READY')
        ) {
            nextActions.add('process_transcript_knowledge')
        }
        if (exams.some((exam) => exam.status !== ExamStatus.PUBLISHED && exam.publishPreconditionsMet)) {
            nextActions.add('publish_exam_with_invitations')
        }
        if (nextActions.size === 0) {
            nextActions.add('list_my_workspace')
        }

        return {
            success: true,
            tool: 'get_event_execution_status',
            summary: `Returned execution status for event "${event.title}".`,
            data: {
                event,
                courses: event.courses,
                exams,
                transcriptStatus,
                knowledgeStatus,
                invitationStatus: {
                    courseEnrollmentCount: event.courses.reduce((sum, course) => sum + course.enrolledCount, 0),
                    examInvitationCount: event.analytics?.invitationCount ?? 0,
                    examAttemptCount: event.analytics?.attemptCount ?? 0,
                    gradedAttemptCount: event.analytics?.gradedAttemptCount ?? 0,
                    passedCount: event.analytics?.passedCount ?? 0,
                    failedCount: event.analytics?.failedCount ?? 0,
                    passRate: event.analytics?.passRate ?? 0,
                },
                lessonStates,
            },
            nextActions: Array.from(nextActions),
            ...(warnings.length > 0 ? { warnings } : {}),
        }
    }

    static async listMySeriesBadges(user: MappableUser): Promise<ToolResult<Awaited<ReturnType<typeof TrainingOpsService.getScopedBadgeLadders>>>> {
        const data = await TrainingOpsService.getScopedBadgeLadders(user)

        return {
            success: true,
            tool: 'list_my_series_badges',
            summary: `Returned domain badge progressions for ${data.domains.length} scoped domains.`,
            data,
            nextActions: ['list_my_workspace', 'create_case_study_bundle'],
        }
    }

    static async publishExamWithInvitations(
        user: MappableUser,
        input: {
            examId: string
            userIds: string[]
            sendNotification?: boolean
        }
    ): Promise<ToolResult<{
        exam: {
            id: string
            title: string
            status: ExamStatus
            publishedAt: Date | null
            invitationCount: number
        }
        invitationsCreated: number
        invitationsSkipped: number
        notificationsSent: number
        notificationsFailed: number
    }>> {
        await TrainingOpsService.assertScopedExamAccess(user, input.examId)

        const exam = await prisma.exam.findUnique({
            where: { id: input.examId },
            select: {
                id: true,
                title: true,
                status: true,
                totalScore: true,
            },
        })

        if (!exam) {
            throw new Error('EXAM_NOT_FOUND')
        }

        if (exam.status !== ExamStatus.APPROVED) {
            throw new Error('EXAM_NOT_APPROVED')
        }

        const activeQuestionCount = await prisma.examQuestion.count({
            where: { examId: input.examId, archivedAt: null },
        })

        if (activeQuestionCount === 0) {
            throw new Error('EXAM_HAS_NO_QUESTIONS')
        }

        const sum = await prisma.examQuestion.aggregate({
            where: { examId: input.examId, archivedAt: null },
            _sum: { points: true },
        })

        const totalPoints = sum._sum.points ?? 0
        if (totalPoints !== exam.totalScore) {
            throw new Error('EXAM_TOTAL_SCORE_MISMATCH')
        }

        const existingInvitationCount = await prisma.examInvitation.count({
            where: { examId: input.examId },
        })

        if (input.userIds.length === 0 && existingInvitationCount === 0) {
            throw new Error('EXAM_INVITATIONS_REQUIRED')
        }

        const users = input.userIds.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: input.userIds }, status: 'ACTIVE' },
                select: { id: true },
            })
            : []

        const activeUserIds = new Set(users.map((item) => item.id))
        const invalidUserIds = input.userIds.filter((id) => !activeUserIds.has(id))
        if (invalidUserIds.length > 0) {
            throw new Error(`INVALID_INVITATION_USERS:${invalidUserIds.join(',')}`)
        }

        const existingInvites = input.userIds.length > 0
            ? await prisma.examInvitation.findMany({
                where: {
                    examId: input.examId,
                    userId: { in: input.userIds },
                },
                select: { userId: true },
            })
            : []
        const existingSet = new Set(existingInvites.map((item) => item.userId))
        const toCreate = input.userIds.filter((id) => !existingSet.has(id))

        await prisma.$transaction(async (tx) => {
            if (toCreate.length > 0) {
                await tx.examInvitation.createMany({
                    data: toCreate.map((userId) => ({ examId: input.examId, userId })),
                    skipDuplicates: true,
                })
            }

            await tx.exam.update({
                where: { id: input.examId },
                data: {
                    status: ExamStatus.PUBLISHED,
                    publishedAt: new Date(),
                },
            })
        })

        const notificationResults = { sent: 0, failed: 0 }
        if (input.sendNotification && toCreate.length > 0) {
            for (const userId of toCreate) {
                const result = await WecomWebhookService.sendExamInvitation(userId, input.examId)
                if (result.success) notificationResults.sent++
                else notificationResults.failed++
            }
        }

        const updatedExam = await prisma.exam.findUnique({
            where: { id: input.examId },
            select: {
                id: true,
                title: true,
                status: true,
                publishedAt: true,
                _count: {
                    select: {
                        invitations: true,
                    },
                },
            },
        })

        return {
            success: true,
            tool: 'publish_exam_with_invitations',
            summary: `Published "${updatedExam?.title ?? exam.title}" and created ${toCreate.length} invitations.`,
            data: {
                exam: {
                    id: updatedExam?.id ?? exam.id,
                    title: updatedExam?.title ?? exam.title,
                    status: updatedExam?.status ?? ExamStatus.PUBLISHED,
                    publishedAt: updatedExam?.publishedAt ?? new Date(),
                    invitationCount: updatedExam?._count.invitations ?? existingInvitationCount + toCreate.length,
                },
                invitationsCreated: toCreate.length,
                invitationsSkipped: input.userIds.length - toCreate.length,
                notificationsSent: notificationResults.sent,
                notificationsFailed: notificationResults.failed,
            },
            nextActions: ['list_my_workspace'],
        }
    }

    static async assignCourseInvitations(
        user: MappableUser,
        input: {
            courseId: string
            userIds: string[]
            sendNotification?: boolean
        }
    ): Promise<ToolResult<{
        course: {
            id: string
            title: string
            status: string
        }
        invitationsCreated: number
        invitationsSkipped: number
        notificationsSent: number
        notificationsFailed: number
    }>> {
        await TrainingOpsService.assertScopedCourseAccess(user, input.courseId)

        const parsed = inviteUsersSchema.parse({
            userIds: input.userIds,
            sendNotification: input.sendNotification,
        })

        const course = await prisma.course.findUnique({
            where: { id: input.courseId },
            select: {
                id: true,
                title: true,
                status: true,
            },
        })

        if (!course) {
            throw new Error('COURSE_NOT_FOUND')
        }

        if (course.status !== 'PUBLISHED') {
            throw new Error('COURSE_NOT_PUBLISHED')
        }

        const users = await prisma.user.findMany({
            where: {
                id: { in: parsed.userIds },
                status: 'ACTIVE',
            },
            select: { id: true },
        })
        const activeUserIds = new Set(users.map((row) => row.id))
        const invalidUserIds = parsed.userIds.filter((id) => !activeUserIds.has(id))
        if (invalidUserIds.length > 0) {
            throw new Error(`INVALID_COURSE_INVITATION_USERS:${invalidUserIds.join(',')}`)
        }

        const existing = await prisma.enrollment.findMany({
            where: {
                courseId: input.courseId,
                userId: { in: parsed.userIds },
            },
            select: { userId: true },
        })
        const existingSet = new Set(existing.map((row) => row.userId))
        const toCreate = parsed.userIds.filter((id) => !existingSet.has(id))

        if (toCreate.length > 0) {
            await prisma.$transaction(async (tx) => {
                await tx.enrollment.createMany({
                    data: toCreate.map((userId) => ({
                        courseId: input.courseId,
                        userId,
                        status: 'ACTIVE',
                        progress: 0,
                    })),
                    skipDuplicates: true,
                })

                await tx.course.update({
                    where: { id: input.courseId },
                    data: {
                        enrolledCount: {
                            increment: toCreate.length,
                        },
                    },
                })
            })
        }

        const notificationResults = { sent: 0, failed: 0 }
        if (parsed.sendNotification && toCreate.length > 0) {
            for (const userId of toCreate) {
                const result = await WecomWebhookService.sendCourseInvitation(userId, input.courseId)
                if (result.success) notificationResults.sent++
                else notificationResults.failed++
            }
        }

        return {
            success: true,
            tool: 'assign_course_invitations',
            summary: `Assigned ${toCreate.length} learners to "${course.title}".`,
            data: {
                course: {
                    id: course.id,
                    title: course.title,
                    status: course.status,
                },
                invitationsCreated: toCreate.length,
                invitationsSkipped: parsed.userIds.length - toCreate.length,
                notificationsSent: notificationResults.sent,
                notificationsFailed: notificationResults.failed,
            },
            nextActions: ['list_my_workspace'],
        }
    }

    private static async prepareTranscriptUploadInternal(
        user: MappableUser,
        input: {
            lessonId: string
            videoAssetId: string
            filename: string
            contentType?: 'text/vtt'
            languageCode?: string
            label?: string | null
            replaceExistingLanguage?: boolean
            setAsDefaultSubtitle?: boolean
            setAsPrimaryForAI?: boolean
        },
        toolName: 'prepare_transcript_upload' | 'upload_transcript_and_process'
    ): Promise<ToolResult<Record<string, unknown>>> {
        await TrainingOpsService.assertScopedLessonAccess(user, input.lessonId)

        const filename = input.filename
        const videoAssetId = input.videoAssetId
        const lesson = await prisma.lesson.findUnique({
            where: { id: input.lessonId },
            include: {
                chapter: { select: { courseId: true } },
            },
        })

        if (!lesson) {
            throw new Error('LESSON_NOT_FOUND')
        }

        const videoAsset = await prisma.courseAsset.findUnique({
            where: { id: videoAssetId },
        })

        if (!videoAsset || videoAsset.type !== 'VIDEO') {
            throw new Error('VIDEO_ASSET_NOT_FOUND')
        }

        const transcriptId = uuidv4()
        const inferredLanguage = inferTranscriptLanguageFromFilename(filename)
        const language = inferredLanguage ?? normalizeTranscriptLanguage(input.languageCode ?? 'en')
        const label = input.label?.trim() || null
        const key = [S3_ASSET_BASE_PREFIX, lesson.chapter.courseId, input.lessonId, `${transcriptId}.vtt`]
            .filter(Boolean)
            .map((segment) => String(segment).replace(/^\/+|\/+$/g, ''))
            .join('/')

        const activeTracks = await prisma.transcriptAsset.findMany({
            where: {
                lessonId: input.lessonId,
                isActive: true,
                archivedAt: null,
            },
        })
        const replaceExistingLanguage = input.replaceExistingLanguage ?? true
        const remainingActiveTracks = replaceExistingLanguage
            ? activeTracks.filter(
                (track) => !(track.videoAssetId === input.videoAssetId && track.language === language)
            )
            : activeTracks

        const hasDefaultForVideo = remainingActiveTracks.some(
            (track) => track.videoAssetId === input.videoAssetId && track.isDefaultSubtitle
        )
        const hasPrimaryForLesson = remainingActiveTracks.some((track) => track.isPrimaryForAI)
        const shouldSetDefault = input.setAsDefaultSubtitle ?? !hasDefaultForVideo
        const shouldSetPrimary = input.setAsPrimaryForAI ?? !hasPrimaryForLesson

        const uploadData = await FileService.generateTranscriptUploadUrl({
            filename: input.filename,
            lessonId: input.lessonId,
            key,
        })

        await prisma.$transaction(async (tx) => {
            if (replaceExistingLanguage) {
                await tx.transcriptAsset.updateMany({
                    where: {
                        lessonId: input.lessonId,
                        videoAssetId: input.videoAssetId,
                        language,
                        isActive: true,
                        archivedAt: null,
                    },
                    data: {
                        isActive: false,
                        isDefaultSubtitle: false,
                        isPrimaryForAI: false,
                        archivedAt: new Date(),
                    },
                })
            }

            if (shouldSetDefault) {
                await tx.transcriptAsset.updateMany({
                    where: {
                        videoAssetId: input.videoAssetId,
                        isActive: true,
                        archivedAt: null,
                        isDefaultSubtitle: true,
                    },
                    data: {
                        isDefaultSubtitle: false,
                    },
                })
            }

            if (shouldSetPrimary) {
                await tx.transcriptAsset.updateMany({
                    where: {
                        lessonId: input.lessonId,
                        isActive: true,
                        archivedAt: null,
                        isPrimaryForAI: true,
                    },
                    data: {
                        isPrimaryForAI: false,
                    },
                })
            }

            await tx.transcriptAsset.create({
                data: {
                    id: transcriptId,
                    lessonId: input.lessonId,
                    videoAssetId,
                    filename,
                    s3Key: uploadData.key,
                    url: null,
                    language,
                    label,
                    isDefaultSubtitle: shouldSetDefault,
                    isPrimaryForAI: shouldSetPrimary,
                    isActive: true,
                    status: 'PENDING',
                    sourceType: 'MANUAL',
                },
            })
        })

        return {
            success: true,
            tool: toolName,
            summary: `Prepared transcript upload for lesson "${input.lessonId}".`,
            data: {
                phase: 'upload',
                lessonId: input.lessonId,
                transcriptAsset: {
                    id: transcriptId,
                    lessonId: input.lessonId,
                    videoAssetId: input.videoAssetId,
                    status: 'PENDING',
                    filename: input.filename,
                    language,
                    label: label ?? getTranscriptLabel({ language, label }),
                    isDefaultSubtitle: shouldSetDefault,
                    isPrimaryForAI: shouldSetPrimary,
                },
                uploadUrl: uploadData.uploadUrl,
                s3Key: uploadData.key,
                expiresIn: uploadData.expiresIn,
            },
            nextActions: ['process_transcript_knowledge', 'get_event_execution_status'],
        }
    }

    private static async processTranscriptKnowledgeInternal(
        user: MappableUser,
        input: {
            lessonId: string
            transcriptId?: string
            processTranscript?: boolean
            processKnowledge?: boolean
            force?: boolean
            knowledgePromptTemplateId?: string | null
            anchorsPromptTemplateId?: string | null
        },
        toolName: 'process_transcript_knowledge' | 'upload_transcript_and_process'
    ): Promise<ToolResult<Record<string, unknown>>> {
        await TrainingOpsService.assertScopedLessonAccess(user, input.lessonId)

        if (!input.processTranscript && !input.processKnowledge) {
            throw new Error('NO_PROCESSING_ACTIONS')
        }

        const lesson = await prisma.lesson.findUnique({
            where: { id: input.lessonId },
            include: {
                transcripts: {
                    where: {
                        isActive: true,
                        archivedAt: null,
                    },
                    orderBy: [{ isPrimaryForAI: 'desc' }, { isDefaultSubtitle: 'desc' }, { createdAt: 'asc' }],
                },
            },
        })

        if (!lesson) {
            throw new Error('LESSON_NOT_FOUND')
        }

        const requestedTranscript = lesson.transcripts.find((track) => track.id === input.transcriptId) ?? null
        const transcript = requestedTranscript ?? getPrimaryAiTranscriptTrack(lesson.transcripts)

        if (!transcript) {
            throw new Error('TRANSCRIPT_TRACK_NOT_FOUND')
        }

        const force = Boolean(input.force)
        const result: Record<string, unknown> = {
            phase: 'process',
            lessonId: input.lessonId,
            transcriptId: transcript.id,
        }

        if (input.processTranscript) {
            const transcriptJobService = new TranscriptJobService(prisma)
            const activeTranscriptJob = await transcriptJobService.getActiveJobForTranscript(transcript.id)
            if (activeTranscriptJob && !force) {
                throw new Error('TRANSCRIPT_PROCESS_CONFLICT')
            }
            if (force) {
                await transcriptJobService.cancelActiveJobs(transcript.id)
            }

            const transcriptJob = await transcriptJobService.enqueueJob({
                transcriptId: transcript.id,
                lessonId: input.lessonId,
            })

            await transcriptJobService.appendEvent({
                jobId: transcriptJob.id,
                level: 'info',
                stage: 'PENDING',
                message: 'Job enqueued from SME MCP',
                data: {
                    lessonId: input.lessonId,
                    transcriptId: transcript.id,
                    s3Key: transcript.s3Key,
                    force,
                },
            })

            await prisma.transcriptAsset.update({
                where: { id: transcript.id },
                data: {
                    status: 'PENDING',
                    errorMessage: null,
                    processedAt: null,
                },
            })

            result.transcriptProcessing = {
                jobId: transcriptJob.id,
                status: 'PENDING',
            }
        }

        if (input.processKnowledge) {
            const knowledgeJobService = new KnowledgeContextJobService(prisma)
            const activeKnowledgeJob = await knowledgeJobService.getActiveJobForLesson(input.lessonId)
            if (activeKnowledgeJob && !force) {
                throw new Error('KNOWLEDGE_PROCESS_CONFLICT')
            }
            if (force) {
                await knowledgeJobService.cancelActiveJobs(input.lessonId)
            }

            const knowledgeJob = await knowledgeJobService.enqueueJob({
                lessonId: input.lessonId,
                transcriptId: transcript.id,
                metrics: {
                    transcriptS3Key: transcript.s3Key,
                    promptTemplateId: input.knowledgePromptTemplateId ?? null,
                    anchorsPromptTemplateId: input.anchorsPromptTemplateId ?? null,
                },
            })

            await knowledgeJobService.appendEvent({
                jobId: knowledgeJob.id,
                level: 'info',
                stage: 'PENDING',
                message: 'Knowledge context job enqueued from SME MCP',
                data: {
                    lessonId: input.lessonId,
                    transcriptId: transcript.id,
                    transcriptS3Key: transcript.s3Key,
                    force,
                    promptTemplateId: input.knowledgePromptTemplateId ?? null,
                    anchorsPromptTemplateId: input.anchorsPromptTemplateId ?? null,
                },
            })

            result.knowledgeProcessing = {
                jobId: knowledgeJob.id,
                status: 'QUEUED',
            }
        }

        return {
            success: true,
            tool: toolName,
            summary: `Queued transcript/knowledge processing for lesson "${input.lessonId}".`,
            data: result,
            nextActions: ['get_event_execution_status'],
        }
    }

    static async prepareTranscriptUpload(
        user: MappableUser,
        input: {
            lessonId: string
            videoAssetId: string
            filename: string
            contentType?: 'text/vtt'
            languageCode?: string
            label?: string | null
            replaceExistingLanguage?: boolean
            setAsDefaultSubtitle?: boolean
            setAsPrimaryForAI?: boolean
        }
    ): Promise<ToolResult<Record<string, unknown>>> {
        return this.prepareTranscriptUploadInternal(user, input, 'prepare_transcript_upload')
    }

    static async processTranscriptKnowledge(
        user: MappableUser,
        input: {
            lessonId: string
            transcriptId?: string
            processTranscript?: boolean
            processKnowledge?: boolean
            force?: boolean
            knowledgePromptTemplateId?: string | null
            anchorsPromptTemplateId?: string | null
        }
    ): Promise<ToolResult<Record<string, unknown>>> {
        const processTranscript = input.processTranscript ?? (input.processKnowledge === undefined)
        const processKnowledge = input.processKnowledge ?? (input.processTranscript === undefined)

        return this.processTranscriptKnowledgeInternal(
            user,
            {
                ...input,
                processTranscript,
                processKnowledge,
            },
            'process_transcript_knowledge'
        )
    }

}
