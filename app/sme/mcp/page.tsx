'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ApiClient } from '@/lib/api-client'
import {
    smeMcpToolMetadata,
    type SmeMcpInputKind,
} from '@/lib/sme-mcp-tool-metadata'
import type {
    LearningSeriesSummary,
    ProductDomainSummary,
    SmeWorkspaceSummary,
    TrainingOpsCourseSummary,
    TrainingOpsExamSummary,
} from '@/types'
import {
    AlertCircle,
    Braces,
    CalendarClock,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Copy,
    Filter,
    GripVertical,
    HelpCircle,
    Layers3,
    Loader2,
    PanelLeft,
    Play,
    RefreshCw,
    Search,
    Sparkles,
    Target,
    Users,
    Wand2,
} from 'lucide-react'

type ExampleVariant = 'minimal' | 'full'

type SmeMcpResult = {
    success: boolean
    summary?: string
    data?: unknown
    nextActions?: string[]
    recommendedNextInputs?: Record<string, unknown>
    warnings?: string[]
}

type ActionCenterData = {
    eventScheduleGaps?: unknown[]
    learnerGaps?: unknown[]
    domainsNeedingAttention?: unknown[]
}

type EssayReadinessStatus = 'NOT_APPLICABLE' | 'READY' | 'PARTIAL' | 'NOT_READY'

type EssayReadinessHighlight = {
    key: string
    title: string
    status: EssayReadinessStatus
    summary: string
    stats: Array<{
        label: string
        value: number
    }>
}

const TOOL_DEFINITIONS = smeMcpToolMetadata
const CATEGORY_ORDER = ['workspace', 'authoring', 'operations', 'advanced', 'insights'] as const
type ToolCategoryKey = (typeof CATEGORY_ORDER)[number]

const TOOL_LIBRARY_WIDTH_STORAGE_KEY = 'sme-mcp-tool-library-width'
const TOOL_LIBRARY_MIN_WIDTH = 280
const TOOL_LIBRARY_MAX_WIDTH = 520
const DETAIL_PANEL_WIDTH = 420
const CENTER_PANEL_MIN_WIDTH = 360
const GRID_GAP_WIDTH = 24
const HIGH_RISK_TOOLS = new Set([
    'share_course_with_learners',
    'publish_exam_for_learners',
    'prepare_transcript_upload',
    'process_transcript_knowledge',
])

const categoryThemes: Record<
    ToolCategoryKey,
    {
        shell: string
        badge: string
        eyebrow: string
    }
> = {
    workspace: {
        shell: 'border-sky-200/80 bg-sky-50/80',
        badge: 'border-sky-200 bg-white text-sky-700',
        eyebrow: 'text-sky-700',
    },
    authoring: {
        shell: 'border-violet-200/80 bg-violet-50/80',
        badge: 'border-violet-200 bg-white text-violet-700',
        eyebrow: 'text-violet-700',
    },
    operations: {
        shell: 'border-emerald-200/80 bg-emerald-50/80',
        badge: 'border-emerald-200 bg-white text-emerald-700',
        eyebrow: 'text-emerald-700',
    },
    advanced: {
        shell: 'border-amber-200/80 bg-amber-50/80',
        badge: 'border-amber-200 bg-white text-amber-700',
        eyebrow: 'text-amber-700',
    },
    insights: {
        shell: 'border-fuchsia-200/80 bg-fuchsia-50/80',
        badge: 'border-fuchsia-200 bg-white text-fuchsia-700',
        eyebrow: 'text-fuchsia-700',
    },
}

const inputKindClasses: Record<SmeMcpInputKind, string> = {
    enum: 'border-sky-200 bg-sky-50 text-sky-700',
    free_text: 'border-slate-200 bg-slate-50 text-slate-700',
    number: 'border-amber-200 bg-amber-50 text-amber-700',
    boolean: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    reference: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
    object: 'border-violet-200 bg-violet-50 text-violet-700',
    string_array: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    object_array: 'border-indigo-200 bg-indigo-50 text-indigo-700',
}

const isValueMissing = (value: unknown) => {
    if (value === undefined || value === null) return true
    if (typeof value === 'string') return value.trim().length === 0
    if (Array.isArray(value)) return value.length === 0
    return false
}

const asObject = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

const toNumber = (value: unknown) => {
    const normalized = Number(value)
    return Number.isFinite(normalized) ? normalized : 0
}

const toEssayReadinessStatus = (value: unknown): EssayReadinessStatus | null => {
    if (
        value === 'NOT_APPLICABLE' ||
        value === 'READY' ||
        value === 'PARTIAL' ||
        value === 'NOT_READY'
    ) {
        return value
    }
    return null
}

const buildEssayReadinessHighlights = (data: unknown): EssayReadinessHighlight[] => {
    const payload = asObject(data)
    if (!payload) return []

    const highlights: EssayReadinessHighlight[] = []
    const directReadiness = asObject(payload.essayReadiness)
    if (directReadiness) {
        const totalEssayQuestions = toNumber(directReadiness.totalEssayQuestions)
        if (totalEssayQuestions > 0) {
            const aiReadyEssayQuestions = toNumber(directReadiness.aiReadyEssayQuestions)
            const missingCriteriaCount = toNumber(directReadiness.missingCriteriaCount)
            const missingSampleAnswerCount = toNumber(directReadiness.missingSampleAnswerCount)
            const criteriaPointMismatchCount = toNumber(directReadiness.criteriaPointMismatchCount)
            const status = toEssayReadinessStatus(directReadiness.status) ?? 'PARTIAL'

            highlights.push({
                key: 'direct',
                title: 'Essay AI Grading Readiness',
                status,
                summary:
                    status === 'READY'
                        ? `All ${totalEssayQuestions} essay questions are ready for later AI-assisted grading.`
                        : `${aiReadyEssayQuestions} of ${totalEssayQuestions} essay questions are AI-ready.`,
                stats: [
                    { label: 'Essay Questions', value: totalEssayQuestions },
                    { label: 'AI-ready', value: aiReadyEssayQuestions },
                    { label: 'Missing scoring points', value: missingCriteriaCount },
                    { label: 'Missing sample answers', value: missingSampleAnswerCount },
                    { label: 'Point mismatches', value: criteriaPointMismatchCount },
                ],
            })
        }
    }

    const exams = Array.isArray(payload.exams) ? payload.exams : []
    for (const examValue of exams) {
        const exam = asObject(examValue)
        if (!exam) continue
        const totalEssayQuestions = toNumber(exam.essayQuestionCount)
        if (totalEssayQuestions <= 0) continue

        const aiReadyEssayQuestions = toNumber(exam.essayQuestionsAiReadyCount)
        const missingCriteriaCount = toNumber(exam.essayQuestionsMissingCriteriaCount)
        const missingSampleAnswerCount = toNumber(exam.essayQuestionsMissingSampleAnswerCount)
        const criteriaPointMismatchCount = toNumber(exam.essayCriteriaPointMismatchCount)
        const status = toEssayReadinessStatus(exam.aiGradingReadiness) ?? 'PARTIAL'
        const title = typeof exam.title === 'string' && exam.title.trim() ? exam.title : 'Linked exam'

        highlights.push({
            key: `exam-${String(exam.id ?? title)}`,
            title,
            status,
            summary:
                status === 'READY'
                    ? `All ${totalEssayQuestions} essay questions are AI-ready.`
                    : `${aiReadyEssayQuestions} of ${totalEssayQuestions} essay questions are AI-ready.`,
            stats: [
                { label: 'Essay Questions', value: totalEssayQuestions },
                { label: 'AI-ready', value: aiReadyEssayQuestions },
                { label: 'Missing scoring points', value: missingCriteriaCount },
                { label: 'Missing sample answers', value: missingSampleAnswerCount },
                { label: 'Point mismatches', value: criteriaPointMismatchCount },
            ],
        })
    }

    return highlights
}

const essayReadinessTheme: Record<
    EssayReadinessStatus,
    { shell: string; badge: string; icon: string }
> = {
    READY: {
        shell: 'border-emerald-200 bg-emerald-50/80',
        badge: 'border-emerald-200 bg-white text-emerald-700',
        icon: 'text-emerald-600',
    },
    PARTIAL: {
        shell: 'border-amber-200 bg-amber-50/80',
        badge: 'border-amber-200 bg-white text-amber-700',
        icon: 'text-amber-600',
    },
    NOT_READY: {
        shell: 'border-rose-200 bg-rose-50/80',
        badge: 'border-rose-200 bg-white text-rose-700',
        icon: 'text-rose-600',
    },
    NOT_APPLICABLE: {
        shell: 'border-slate-200 bg-slate-50/80',
        badge: 'border-slate-200 bg-white text-slate-600',
        icon: 'text-slate-500',
    },
}

const clampToolLibraryWidth = (width: number, containerWidth?: number) => {
    const maxWidthFromLayout =
        containerWidth === undefined
            ? TOOL_LIBRARY_MAX_WIDTH
            : Math.max(
                TOOL_LIBRARY_MIN_WIDTH,
                containerWidth - DETAIL_PANEL_WIDTH - CENTER_PANEL_MIN_WIDTH - GRID_GAP_WIDTH * 2
            )

    return Math.min(Math.max(width, TOOL_LIBRARY_MIN_WIDTH), Math.min(TOOL_LIBRARY_MAX_WIDTH, maxWidthFromLayout))
}

function HelpTooltip({
    content,
    label,
    triggerClassName = '',
    tooltipClassName = '',
    focusable = true,
}: {
    content: string
    label: string
    triggerClassName?: string
    tooltipClassName?: string
    focusable?: boolean
}) {
    return (
        <span className="group/tooltip relative inline-flex shrink-0">
            <span
                tabIndex={focusable ? 0 : -1}
                aria-label={label}
                title={content}
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full border bg-white/90 shadow-sm transition ${triggerClassName}`}
            >
                <HelpCircle className="h-3.5 w-3.5" />
            </span>
            <span
                role="tooltip"
                className={`pointer-events-none absolute left-full top-1/2 z-30 ml-3 hidden w-72 -translate-y-1/2 rounded-2xl border border-slate-200 bg-slate-950 px-3 py-2 text-xs leading-5 text-white shadow-xl group-hover/tooltip:block group-focus-within/tooltip:block ${tooltipClassName}`}
            >
                {content}
            </span>
        </span>
    )
}

function buildExampleInput(
    tool: string,
    variant: ExampleVariant,
    overview: SmeWorkspaceSummary | null,
    domains: ProductDomainSummary[],
    series: LearningSeriesSummary[],
    courses: TrainingOpsCourseSummary[],
    exams: TrainingOpsExamSummary[]
) {
    const domain = domains[0] ?? overview?.domains[0]
    const learningSeries = series[0] ?? overview?.series[0]
    const event = overview?.events[0]
    const course = courses[0]
    const exam = exams[0]
    const approvedExam = exams.find((row) => row.status === 'APPROVED') ?? exam
    const learnerId = overview?.learnerGaps[0]?.userId ?? ''

    switch (tool) {
        case 'list_my_workspace':
            return variant === 'full' && domain?.id ? { domainId: domain.id } : {}
        case 'get_training_ops_action_center':
        case 'get_domain_health':
            return variant === 'full' && domain?.id ? { domainId: domain.id } : {}
        case 'create_badge':
            return variant === 'full'
                ? {
                    name: `${domain?.name ?? 'SME'} Ready`,
                    domain: domain?.name ?? '',
                    thresholdStars: 4,
                    icon: 'READY',
                    description: `Earned through steady participation in ${domain?.name ?? 'domain'} programs.`,
                    active: true,
                }
                : {
                    name: `${domain?.name ?? 'SME'} Ready`,
                    domain: domain?.name ?? '',
                    thresholdStars: 4,
                }
        case 'create_series':
            return variant === 'full'
                ? {
                    name: `${domain?.name ?? 'SME'} Weekly Case Study`,
                    seriesType: 'CASE_STUDY',
                    productDomain: domain?.name ?? '',
                    seriesOwner: 'current_user',
                    cadence: 'Weekly',
                    description: `Weekly ${domain?.name ?? 'SME'} case-study program.`,
                    active: true,
                    contributesToDomainBadges: true,
                }
                : {
                    name: `${domain?.name ?? 'SME'} Weekly Case Study`,
                    seriesType: 'CASE_STUDY',
                    productDomain: domain?.name ?? '',
                }
        case 'create_learning_program':
            return variant === 'full'
                ? {
                    name: `${domain?.name ?? 'SME'} Weekly Case Study`,
                    programType: 'CASE_STUDY',
                    productDomain: domain?.name ?? '',
                    programOwner: 'current_user',
                    cadence: 'Weekly',
                    description: `Weekly ${domain?.name ?? 'SME'} case-study program.`,
                    active: true,
                    contributesToDomainBadges: true,
                }
                : {
                    name: `${domain?.name ?? 'SME'} Weekly Case Study`,
                    programType: 'CASE_STUDY',
                    productDomain: domain?.name ?? '',
                }
        case 'create_event':
            return variant === 'full'
                ? {
                    title: `${domain?.name ?? 'SME'} Case Study - ${new Date().toISOString().slice(0, 10)}`,
                    learningProgram: learningSeries?.name ?? '',
                    format: 'CASE_STUDY',
                    status: 'IN_PROGRESS',
                    host: 'current_user',
                    description: 'Created from SME MCP Lab.',
                    scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    countsTowardPerformance: false,
                }
                : {
                    title: `${domain?.name ?? 'SME'} Case Study - ${new Date().toISOString().slice(0, 10)}`,
                    learningProgram: learningSeries?.name ?? '',
                    format: 'CASE_STUDY',
                }
        case 'create_course':
            return variant === 'full'
                ? {
                    title: `${event?.title ?? domain?.name ?? 'SME'} Course`,
                    event: event?.title ?? '',
                    description: 'Introductory course created from the SME MCP Lab.',
                    whatYouWillLearn: ['Understand the case context', 'Review the troubleshooting path'],
                    requirements: ['Basic product familiarity'],
                    category: domain?.name ?? 'General',
                    level: 'BEGINNER',
                    instructor: 'current_user',
                    tags: ['sme', 'case-study'],
                }
                : {
                    title: `${event?.title ?? domain?.name ?? 'SME'} Course`,
                    event: event?.title ?? '',
                }
        case 'create_exam':
            return variant === 'full'
                ? {
                    title: `${event?.title ?? domain?.name ?? 'SME'} Assessment`,
                    event: event?.title ?? '',
                    description: 'Assessment created from the SME MCP Lab.',
                    instructions: 'Read each question carefully before answering.',
                    examType: 'PRACTICE',
                    totalScore: 100,
                    passingScore: 80,
                    maxAttempts: 3,
                    options: {
                        timeLimit: 30,
                        randomizeQuestions: false,
                        randomizeOptions: false,
                        showResultsImmediately: true,
                        allowReview: true,
                    },
                }
                : {
                    title: `${event?.title ?? domain?.name ?? 'SME'} Assessment`,
                    event: event?.title ?? '',
                    examType: 'PRACTICE',
                    totalScore: 100,
                    passingScore: 80,
                    maxAttempts: 3,
                }
        case 'design_course':
            return variant === 'full'
                ? {
                    course: course?.title ?? '',
                    mode: 'manual_outline',
                    chapters: [
                        {
                            title: 'Foundation',
                            lessons: [
                                {
                                    title: 'RTC Audio Flow',
                                    objective: 'Explain the audio path',
                                    summary: 'Introduce the basic RTC audio path.',
                                },
                                {
                                    title: 'Common No-Audio Issues',
                                    objective: 'Recognize common failure modes',
                                    summary: 'Show the most frequent no-audio scenarios.',
                                },
                            ],
                        },
                    ],
                    assetPlan: [
                        {
                            lessonRef: 'RTC Audio Flow',
                            assetType: 'VIDEO',
                            title: 'Audio Demo Recording',
                            sourceKind: 's3_object',
                            sourceBucket: 'eve-meeting-artifacts-891612554546-us-east-1',
                            sourceKey: 'runs/20260525T093554Z-M2eKUb/session.mp4',
                            transcriptBucket: 'eve-meeting-artifacts-891612554546-us-east-1',
                            transcriptKey: 'runs/20260525T093554Z-M2eKUb/transcript.txt',
                            transcriptFormat: 'TIMESTAMPED_TEXT',
                            transcriptLanguage: 'en',
                            setTranscriptAsDefaultSubtitle: true,
                            setTranscriptAsPrimaryForAI: true,
                            processKnowledge: true,
                        },
                    ],
                    transcriptPlan: [
                        {
                            lessonRef: 'RTC Audio Flow',
                            languageCode: 'en',
                            setAsDefaultSubtitle: true,
                            setAsPrimaryForAI: true,
                        },
                    ],
                }
                : {
                    course: course?.title ?? '',
                    mode: 'generate_outline',
                    brief: 'Design a 3-lesson intro course for new RTC CSEs.',
                }
        case 'design_exam_questions':
            return variant === 'full'
                ? {
                    exam: exam?.title ?? '',
                    mode: 'manual_payload',
                    questions: [
                        {
                            type: 'SINGLE_CHOICE',
                            difficulty: 'MEDIUM',
                            question: 'Which step should you check first when there is no audio?',
                            options: ['ICE state', 'Audio device routing', 'Video bitrate', 'Resolution'],
                            correctAnswer: 'Audio device routing',
                            points: 10,
                            explanation: 'Basic endpoint routing checks should come before deeper network analysis.',
                        },
                    ],
                }
                : {
                    exam: exam?.title ?? '',
                    mode: 'generate_from_course',
                    sourceCourse: course?.title ?? '',
                    questionCount: 10,
                    questionTypes: ['SINGLE_CHOICE'],
                }
        case 'review_event_status':
            return {
                event: event?.title ?? '',
            }
        case 'share_course_with_learners':
            return variant === 'full'
                ? {
                    course: course?.title ?? '',
                    userIds: learnerId ? [learnerId] : [],
                    sendNotification: false,
                }
                : {
                    course: course?.title ?? '',
                    userIds: learnerId ? [learnerId] : [],
                }
        case 'publish_exam_for_learners':
            return variant === 'full'
                ? {
                    exam: approvedExam?.title ?? exam?.title ?? '',
                    userIds: learnerId ? [learnerId] : [],
                    sendNotification: false,
                }
                : {
                    exam: approvedExam?.title ?? exam?.title ?? '',
                }
        case 'prepare_transcript_upload':
            return variant === 'full'
                ? {
                    lessonId: '',
                    videoAssetId: '',
                    filename: 'lesson-transcript.vtt',
                    contentType: 'text/vtt',
                    languageCode: 'en',
                    label: 'English',
                    setAsDefaultSubtitle: true,
                    setAsPrimaryForAI: true,
                }
                : {
                    lessonId: '',
                    filename: 'lesson-transcript.vtt',
                    contentType: 'text/vtt',
                }
        case 'process_transcript_knowledge':
            return variant === 'full'
                ? {
                    lessonId: '',
                    transcriptId: '',
                    processTranscript: true,
                    processKnowledge: true,
                    force: false,
                }
                : {
                    lessonId: '',
                    processTranscript: true,
                    processKnowledge: true,
                }
        case 'list_my_series_badges':
            return {}
        default:
            return {}
    }
}

const renderExampleValue = (value: unknown) => {
    if (value === undefined) return '—'
    if (typeof value === 'string') return value
    return JSON.stringify(value)
}

export default function SmeMcpLabPage() {
    const layoutRef = useRef<HTMLDivElement | null>(null)
    const [selectedTool, setSelectedTool] = useState<string>('list_my_workspace')
    const [selectedExampleVariant, setSelectedExampleVariant] = useState<ExampleVariant>('minimal')
    const [showAdvancedTools, setShowAdvancedTools] = useState(false)
    const [toolSearch, setToolSearch] = useState('')
    const [categoryFilter, setCategoryFilter] = useState<ToolCategoryKey | 'all'>('all')
    const [collapsedCategories, setCollapsedCategories] = useState<Record<ToolCategoryKey, boolean>>({
        workspace: false,
        authoring: false,
        operations: false,
        advanced: false,
        insights: false,
    })
    const [toolLibraryWidth, setToolLibraryWidth] = useState(340)
    const [isResizingToolLibrary, setIsResizingToolLibrary] = useState(false)
    const [loadingContext, setLoadingContext] = useState(true)
    const [running, setRunning] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [inputJson, setInputJson] = useState('{}')
    const [result, setResult] = useState<SmeMcpResult | null>(null)
    const [overview, setOverview] = useState<SmeWorkspaceSummary | null>(null)
    const [domains, setDomains] = useState<ProductDomainSummary[]>([])
    const [series, setSeries] = useState<LearningSeriesSummary[]>([])
    const [courses, setCourses] = useState<TrainingOpsCourseSummary[]>([])
    const [exams, setExams] = useState<TrainingOpsExamSummary[]>([])
    const [selectedDomainId, setSelectedDomainId] = useState('')
    const [actionCenter, setActionCenter] = useState<ActionCenterData | null>(null)
    const [confirmationOpen, setConfirmationOpen] = useState(false)

    useEffect(() => {
        const storedWidth = window.localStorage.getItem(TOOL_LIBRARY_WIDTH_STORAGE_KEY)
        if (!storedWidth) return

        const parsedWidth = Number(storedWidth)
        if (!Number.isFinite(parsedWidth)) return

        setToolLibraryWidth(clampToolLibraryWidth(parsedWidth))
    }, [])

    useEffect(() => {
        if (loadingContext) return

        const loadActionCenter = async () => {
            try {
                const response = await ApiClient.callSmeMcp('get_training_ops_action_center', {
                    ...(selectedDomainId ? { domainId: selectedDomainId } : {}),
                })
                setActionCenter((response.data ?? null) as ActionCenterData | null)
            } catch {
                setActionCenter(null)
            }
        }

        void loadActionCenter()
    }, [loadingContext, selectedDomainId])

    useEffect(() => {
        window.localStorage.setItem(TOOL_LIBRARY_WIDTH_STORAGE_KEY, String(toolLibraryWidth))
    }, [toolLibraryWidth])

    useEffect(() => {
        const loadContext = async () => {
            try {
                setLoadingContext(true)
                const [overviewResponse, domainsResponse, seriesResponse, coursesResponse, examsResponse] =
                    await Promise.all([
                        ApiClient.getSmeTrainingOpsOverview(),
                        ApiClient.getSmeTrainingOpsDomains(),
                        ApiClient.getSmeTrainingOpsSeries(),
                        ApiClient.getSmeTrainingOpsCourses(),
                        ApiClient.getSmeTrainingOpsExams(),
                    ])

                setOverview(overviewResponse.data)
                setDomains(domainsResponse.data)
                setSeries(seriesResponse.data)
                setCourses(coursesResponse.data)
                setExams(examsResponse.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load SME MCP context')
            } finally {
                setLoadingContext(false)
            }
        }

        void loadContext()
    }, [])

    useEffect(() => {
        const syncToolLibraryWidth = () => {
            const containerWidth = layoutRef.current?.getBoundingClientRect().width
            setToolLibraryWidth((current) => clampToolLibraryWidth(current, containerWidth))
        }

        syncToolLibraryWidth()
        window.addEventListener('resize', syncToolLibraryWidth)

        return () => window.removeEventListener('resize', syncToolLibraryWidth)
    }, [])

    useEffect(() => {
        if (!isResizingToolLibrary) return

        const updateWidthFromPointer = (event: PointerEvent) => {
            const container = layoutRef.current
            if (!container) return

            const bounds = container.getBoundingClientRect()
            const nextWidth = clampToolLibraryWidth(event.clientX - bounds.left, bounds.width)
            setToolLibraryWidth(nextWidth)
        }

        const stopResize = () => setIsResizingToolLibrary(false)

        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        window.addEventListener('pointermove', updateWidthFromPointer)
        window.addEventListener('pointerup', stopResize)

        return () => {
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            window.removeEventListener('pointermove', updateWidthFromPointer)
            window.removeEventListener('pointerup', stopResize)
        }
    }, [isResizingToolLibrary])

    const visibleToolDefinitions = useMemo(
        () =>
            TOOL_DEFINITIONS.filter((tool) => {
                if (!showAdvancedTools && tool.category === 'advanced') {
                    return false
                }

                return true
            }),
        [showAdvancedTools]
    )

    const filteredToolDefinitions = useMemo(() => {
        const normalizedQuery = toolSearch.trim().toLowerCase()

        return visibleToolDefinitions.filter((tool) => {
            if (categoryFilter !== 'all' && tool.category !== categoryFilter) {
                return false
            }

            if (!normalizedQuery) {
                return true
            }

            const haystack = [
                tool.label,
                tool.description,
                tool.whenToUse,
                tool.inputSummary,
                tool.categoryLabel,
                ...tool.parameters.map((parameter) => `${parameter.label} ${parameter.name} ${parameter.description}`),
            ]
                .join(' ')
                .toLowerCase()

            return haystack.includes(normalizedQuery)
        })
    }, [categoryFilter, toolSearch, visibleToolDefinitions])

    const orderedCategories = useMemo(
        () =>
            CATEGORY_ORDER.filter((category) =>
                filteredToolDefinitions.some((tool) => tool.category === category)
            ),
        [filteredToolDefinitions]
    )

    const selectedToolDef = TOOL_DEFINITIONS.find((tool) => tool.key === selectedTool) ?? TOOL_DEFINITIONS[0]
    const scopedDomains = useMemo(
        () => selectedDomainId ? domains.filter((domain) => domain.id === selectedDomainId) : domains,
        [domains, selectedDomainId]
    )
    const scopedSeries = useMemo(
        () => selectedDomainId ? series.filter((program) => program.domain?.id === selectedDomainId) : series,
        [series, selectedDomainId]
    )

    useEffect(() => {
        if (filteredToolDefinitions.some((tool) => tool.key === selectedTool)) {
            return
        }

        const fallbackTool = filteredToolDefinitions[0]
        if (fallbackTool) {
            setSelectedTool(fallbackTool.key)
        }
    }, [filteredToolDefinitions, selectedTool])

    const refreshExample = (toolKey: string, variant: ExampleVariant = selectedExampleVariant) => {
        const example = buildExampleInput(toolKey, variant, overview, scopedDomains, scopedSeries, courses, exams)
        setInputJson(JSON.stringify(example, null, 2))
    }

    useEffect(() => {
        if (!loadingContext) {
            const example = buildExampleInput(selectedTool, selectedExampleVariant, overview, scopedDomains, scopedSeries, courses, exams)
            setInputJson(JSON.stringify(example, null, 2))
        }
    }, [selectedTool, selectedExampleVariant, loadingContext, overview, scopedDomains, scopedSeries, courses, exams])

    const parsedInput = useMemo(() => {
        try {
            return inputJson.trim() ? JSON.parse(inputJson) : {}
        } catch {
            return null
        }
    }, [inputJson])

    const requiredParameters = selectedToolDef.parameters.filter((parameter) => parameter.required === 'mandatory')
    const optionalParameters = selectedToolDef.parameters.filter((parameter) => parameter.required !== 'mandatory')
    const missingMandatoryParameters = requiredParameters.filter((parameter) =>
        !parsedInput || isValueMissing((parsedInput as Record<string, unknown>)[parameter.name])
    )
    const defaultedParameters = optionalParameters.filter(
        (parameter) =>
            parameter.defaultBehavior &&
            parsedInput &&
            isValueMissing((parsedInput as Record<string, unknown>)[parameter.name])
    )
    const referenceParameters = selectedToolDef.parameters.filter((parameter) => parameter.inputKind === 'reference')
    const resultJson = result ? JSON.stringify(result, null, 2) : ''
    const essayReadinessHighlights = useMemo(() => buildEssayReadinessHighlights(result?.data), [result?.data])
    const visibleToolCount = filteredToolDefinitions.length
    const visibleAdvancedCount = filteredToolDefinitions.filter((tool) => tool.category === 'advanced').length
    const visibleRequiredCount = filteredToolDefinitions.reduce(
        (sum, tool) => sum + tool.parameters.filter((parameter) => parameter.required === 'mandatory').length,
        0
    )
    const layoutColumns = `${toolLibraryWidth}px minmax(0,1fr) ${DETAIL_PANEL_WIDTH}px`

    const executeTool = async (input: Record<string, unknown>) => {
        try {
            setRunning(true)
            setError(null)
            const response = await ApiClient.callSmeMcp(selectedTool, input)
            setResult(response)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to execute SME MCP tool'
            setError(message)
            setResult(null)
        } finally {
            setRunning(false)
        }
    }

    const handleRun = async () => {
        try {
            const parsed = inputJson.trim() ? JSON.parse(inputJson) as Record<string, unknown> : {}
            if (HIGH_RISK_TOOLS.has(selectedTool) && parsed.confirm !== true) {
                setConfirmationOpen(true)
                return
            }
            await executeTool(parsed)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Input JSON is invalid')
        }
    }

    const handleConfirmedRun = async () => {
        setConfirmationOpen(false)
        try {
            const parsed = inputJson.trim() ? JSON.parse(inputJson) as Record<string, unknown> : {}
            const confirmedInput = {
                ...parsed,
                dryRun: false,
                confirm: true,
                idempotencyKey: parsed.idempotencyKey ?? crypto.randomUUID(),
            }
            setInputJson(JSON.stringify(confirmedInput, null, 2))
            await executeTool(confirmedInput)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Input JSON is invalid')
        }
    }

    const openWorkflow = (tool: string) => {
        setSelectedTool(tool)
        setCategoryFilter('all')
        const example = buildExampleInput(tool, 'minimal', overview, scopedDomains, scopedSeries, courses, exams)
        const scopedExample = selectedDomainId && (tool === 'get_training_ops_action_center' || tool === 'get_domain_health')
            ? { domainId: selectedDomainId }
            : example
        setInputJson(JSON.stringify(scopedExample, null, 2))
    }

    const handleCopyResult = async () => {
        if (!resultJson) return
        await navigator.clipboard.writeText(resultJson)
    }

    const handleToolLibraryResize = (nextWidth: number) => {
        const containerWidth = layoutRef.current?.getBoundingClientRect().width
        setToolLibraryWidth(clampToolLibraryWidth(nextWidth, containerWidth))
    }

    const toggleCategoryCollapsed = (category: ToolCategoryKey) => {
        setCollapsedCategories((current) => ({
            ...current,
            [category]: !current[category],
        }))
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <Card className="overflow-hidden border border-slate-200 bg-[radial-gradient(circle_at_12%_0%,rgba(14,165,233,0.16),transparent_32%),linear-gradient(135deg,#f8fdff_0%,#ffffff_58%,#f8fafc_100%)] shadow-sm">
                    <CardContent className="space-y-6 p-7 md:p-8">
                        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                            <div className="max-w-3xl space-y-3">
                                <Badge className="w-fit rounded-full border border-[#b8ecff] bg-[#effbff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#006688]">
                                    SME Automation Workspace
                                </Badge>
                                <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">
                                    Turn training signals into the next action
                                </h1>
                                <p className="text-sm leading-7 text-slate-600 md:text-base">
                                    Review operational gaps first, then plan events and build reusable learning assets. Learning Programs are optional; every action stays anchored to a Domain Scope.
                                </p>
                            </div>
                            <label className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm lg:w-auto lg:min-w-[260px]">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Domain Scope</span>
                                <select
                                    value={selectedDomainId}
                                    onChange={(event) => setSelectedDomainId(event.target.value)}
                                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#006688]/20"
                                >
                                    <option value="">All authorized domains</option>
                                    {domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.name}</option>)}
                                </select>
                            </label>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <button type="button" onClick={() => openWorkflow('get_training_ops_action_center')} className="rounded-2xl border border-cyan-200 bg-white/90 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300">
                                <CalendarClock className="h-5 w-5 text-[#007a99]" />
                                <p className="mt-3 text-2xl font-semibold text-slate-950">{actionCenter?.eventScheduleGaps?.length ?? 0}</p>
                                <p className="mt-1 text-sm text-slate-600">Events needing dates</p>
                            </button>
                            <button type="button" onClick={() => openWorkflow('get_training_ops_action_center')} className="rounded-2xl border border-amber-200 bg-white/90 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300">
                                <Users className="h-5 w-5 text-amber-600" />
                                <p className="mt-3 text-2xl font-semibold text-slate-950">{actionCenter?.learnerGaps?.length ?? 0}</p>
                                <p className="mt-1 text-sm text-slate-600">Learners below threshold</p>
                            </button>
                            <button type="button" onClick={() => openWorkflow('get_domain_health')} className="rounded-2xl border border-rose-200 bg-white/90 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300">
                                <Target className="h-5 w-5 text-rose-600" />
                                <p className="mt-3 text-2xl font-semibold text-slate-950">{actionCenter?.domainsNeedingAttention?.length ?? 0}</p>
                                <p className="mt-1 text-sm text-slate-600">Domains needing attention</p>
                            </button>
                            <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white shadow-sm">
                                <Layers3 className="h-5 w-5 text-cyan-300" />
                                <p className="mt-3 text-2xl font-semibold">{scopedSeries.length}</p>
                                <p className="mt-1 text-sm text-slate-300">Learning Programs in scope</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => openWorkflow('get_training_ops_action_center')} className="rounded-full bg-[#006688] hover:bg-[#00566f]">Review action center</Button>
                            <Button size="sm" variant="outline" onClick={() => openWorkflow('create_event')} className="rounded-full bg-white">Plan an event</Button>
                            <Button size="sm" variant="outline" onClick={() => openWorkflow('create_course')} className="rounded-full bg-white">Build a course draft</Button>
                            <Button size="sm" variant="outline" onClick={() => openWorkflow('create_exam')} className="rounded-full bg-white">Build an assessment</Button>
                            <Button size="sm" variant="outline" onClick={() => openWorkflow('review_event_status')} className="rounded-full bg-white">Review readiness</Button>
                        </div>
                    </CardContent>
                </Card>

                {error ? (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Execution Error</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                <div
                    ref={layoutRef}
                    className="grid gap-6 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] 2xl:[grid-template-columns:var(--sme-mcp-layout-columns)]"
                    style={{ ['--sme-mcp-layout-columns' as string]: layoutColumns }}
                >
                    <div className="relative min-w-0">
                        <Card className="overflow-hidden border border-slate-200/80 bg-white/95 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
                            <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_42%),linear-gradient(180deg,_#f8fcff_0%,_#ffffff_100%)] px-5 py-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="space-y-2">
                                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm">
                                            <PanelLeft className="h-3.5 w-3.5 text-[#006688]" />
                                            Tool Library
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">SME workflow console</h2>
                                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                                Search tools by intent, keep the primary SME flow visible, and reveal technical compatibility layers only when needed.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 text-right shadow-sm">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Visible tools</p>
                                        <p className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{visibleToolCount}</p>
                                    </div>
                                </div>

                                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                                    <div className="rounded-2xl border border-white/80 bg-white/80 p-3 shadow-sm">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Categories</p>
                                        <p className="mt-1 text-xl font-semibold text-slate-950">{orderedCategories.length}</p>
                                    </div>
                                    <div className="rounded-2xl border border-white/80 bg-white/80 p-3 shadow-sm">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Required fields</p>
                                        <p className="mt-1 text-xl font-semibold text-slate-950">{visibleRequiredCount}</p>
                                    </div>
                                    <div className="rounded-2xl border border-white/80 bg-white/80 p-3 shadow-sm">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Advanced tools</p>
                                        <p className="mt-1 text-xl font-semibold text-slate-950">{visibleAdvancedCount}</p>
                                    </div>
                                </div>
                            </div>

                            <CardContent className="space-y-5 p-5">
                                <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                                    <div className="relative">
                                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        <Input
                                            value={toolSearch}
                                            onChange={(event) => setToolSearch(event.target.value)}
                                            placeholder="Search tools, fields, or workflow intent"
                                            className="h-11 rounded-2xl border-slate-200 bg-white pl-10 shadow-sm"
                                        />
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className={`rounded-full ${categoryFilter === 'all' ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-white'}`}
                                            onClick={() => setCategoryFilter('all')}
                                        >
                                            All tools
                                        </Button>
                                        {CATEGORY_ORDER.filter((category) => visibleToolDefinitions.some((tool) => tool.category === category)).map((category) => (
                                            <Button
                                                key={category}
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className={`rounded-full ${categoryFilter === category ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-white'}`}
                                                onClick={() => setCategoryFilter(category)}
                                            >
                                                {TOOL_DEFINITIONS.find((tool) => tool.category === category)?.categoryLabel ?? category}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                                            <Filter className="h-4 w-4 text-slate-500" />
                                        </div>
                                        <div className="min-w-0 flex-1 space-y-3">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-semibold text-slate-950">Advanced Mode</p>
                                                <HelpTooltip
                                                    content="Reveal low-level and compatibility tools only when you need to inspect or support an existing integration."
                                                    label="Advanced Mode help"
                                                    triggerClassName="border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                                                    focusable
                                                />
                                            </div>

                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="h-auto min-h-10 w-full justify-between whitespace-normal rounded-2xl border-slate-200 bg-white px-3 py-2 text-xs shadow-sm sm:text-sm"
                                                onClick={() => setShowAdvancedTools((value) => !value)}
                                            >
                                                <span>{showAdvancedTools ? 'Hide Advanced Tools' : 'Show Advanced Tools'}</span>
                                                {showAdvancedTools ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                <ScrollArea className="h-[930px] pr-2">
                                    <div className="min-w-0 space-y-4 overflow-x-hidden pb-4">
                                        {orderedCategories.map((category) => {
                                            const tools = filteredToolDefinitions.filter((tool) => tool.category === category)
                                            if (tools.length === 0) return null

                                            const theme = categoryThemes[category]
                                            const isCollapsed = collapsedCategories[category]

                                            return (
                                                <div key={category} className={`rounded-3xl border p-3 ${theme.shell}`}>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleCategoryCollapsed(category)}
                                                        className={`flex w-full items-center justify-between gap-3 rounded-2xl border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006688]/30 ${
                                                            isCollapsed
                                                                ? 'border-white/90 bg-white/85 px-3 py-2 shadow-sm hover:bg-white'
                                                                : 'border-transparent bg-white/55 px-3 py-2.5 hover:bg-white/75'
                                                        }`}
                                                        aria-expanded={!isCollapsed}
                                                        aria-controls={`tool-category-${category}`}
                                                    >
                                                        <div className="flex min-w-0 items-center gap-3">
                                                            <div
                                                                className={`flex items-center justify-center rounded-2xl border border-white/90 bg-white shadow-sm ${
                                                                    isCollapsed ? 'h-8 w-8' : 'h-9 w-9'
                                                                }`}
                                                            >
                                                                <Layers3 className={`h-4 w-4 ${theme.eyebrow}`} />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${theme.eyebrow}`}>{tools[0].categoryLabel}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="outline" className={`rounded-full ${theme.badge}`}>
                                                                {tools.length}
                                                            </Badge>
                                                            {isCollapsed ? (
                                                                <ChevronRight className={`h-4 w-4 ${theme.eyebrow}`} />
                                                            ) : (
                                                                <ChevronDown className={`h-4 w-4 ${theme.eyebrow}`} />
                                                            )}
                                                        </div>
                                                    </button>

                                                    {!collapsedCategories[category] ? (
                                                        <div id={`tool-category-${category}`} className="space-y-2 pt-2">
                                                            {tools.map((tool) => {
                                                                const active = tool.key === selectedTool
                                                                return (
                                                                    <button
                                                                        key={tool.key}
                                                                        type="button"
                                                                        onClick={() => setSelectedTool(tool.key)}
                                                                        className={`group w-full rounded-[20px] border px-4 py-3 text-left transition ${
                                                                            active
                                                                                ? 'border-slate-900 bg-slate-950 text-white shadow-[0_24px_48px_-30px_rgba(15,23,42,0.8)]'
                                                                                : 'border-white/80 bg-white/90 text-slate-950 shadow-sm hover:-translate-y-0.5 hover:border-slate-200 hover:bg-white'
                                                                        }`}
                                                                    >
                                                                        <div className="flex items-center justify-between gap-3">
                                                                            <div className="flex min-w-0 items-center gap-2">
                                                                                <p className="truncate text-sm font-semibold">{tool.label}</p>
                                                                                <HelpTooltip
                                                                                    content={tool.description}
                                                                                    label={`${tool.label} description`}
                                                                                    triggerClassName={
                                                                                        active
                                                                                            ? 'border-white/15 bg-white/10 text-white/75 hover:border-white/25 hover:text-white'
                                                                                            : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-700'
                                                                                    }
                                                                                    focusable={false}
                                                                                />
                                                                            </div>
                                                                            <ChevronRight
                                                                                className={`h-4 w-4 shrink-0 transition ${
                                                                                    active ? 'text-white/70' : 'text-slate-400 group-hover:text-slate-700'
                                                                                }`}
                                                                            />
                                                                        </div>
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            )
                                        })}

                                        {orderedCategories.length === 0 ? (
                                            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                                                <p className="text-sm font-semibold text-slate-950">No tools match this filter</p>
                                                <p className="mt-2 text-sm leading-6 text-slate-600">Clear the search or switch categories to see the full SME tool surface again.</p>
                                            </div>
                                        ) : null}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>

                        <div className="absolute inset-y-0 -right-3 hidden w-6 items-center justify-center 2xl:flex">
                            <div className="absolute inset-y-4 left-1/2 w-px -translate-x-1/2 bg-slate-200" />
                            <div
                                role="separator"
                                aria-label="Resize tool library"
                                aria-orientation="vertical"
                                aria-valuemin={TOOL_LIBRARY_MIN_WIDTH}
                                aria-valuemax={TOOL_LIBRARY_MAX_WIDTH}
                                aria-valuenow={toolLibraryWidth}
                                tabIndex={0}
                                onPointerDown={(event) => {
                                    event.preventDefault()
                                    setIsResizingToolLibrary(true)
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === 'ArrowLeft') {
                                        event.preventDefault()
                                        handleToolLibraryResize(toolLibraryWidth - 16)
                                    }

                                    if (event.key === 'ArrowRight') {
                                        event.preventDefault()
                                        handleToolLibraryResize(toolLibraryWidth + 16)
                                    }
                                }}
                                className={`relative z-10 flex h-24 w-6 touch-none items-center justify-center rounded-full border bg-white shadow-md transition ${
                                    isResizingToolLibrary
                                        ? 'border-[#006688] text-[#006688] shadow-lg'
                                        : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600'
                                } cursor-col-resize`}
                            >
                                <GripVertical className="h-4 w-4" />
                            </div>
                        </div>
                    </div>

                    <div className="min-w-0 space-y-6">
                        <Card className="border border-slate-200 bg-white shadow-sm">
                            <CardHeader>
                                <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
                                    <div className="space-y-2">
                                        <CardTitle className="text-2xl text-slate-950">{selectedToolDef.label}</CardTitle>
                                        <CardDescription className="text-sm leading-7 text-slate-600">
                                            {selectedToolDef.description}
                                        </CardDescription>
                                    </div>
                                    <Badge variant="outline" className="rounded-full">
                                        {selectedToolDef.categoryLabel}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">When To Use</p>
                                    <p className="mt-2 text-sm leading-6 text-slate-700">{selectedToolDef.whenToUse}</p>
                                </div>

                                <div className="grid gap-4 md:grid-cols-3">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Mandatory</p>
                                        <p className="mt-2 text-2xl font-semibold text-slate-950">{requiredParameters.length}</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Optional</p>
                                        <p className="mt-2 text-2xl font-semibold text-slate-950">{optionalParameters.length}</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Next Actions</p>
                                        <p className="mt-2 text-sm font-semibold text-slate-950">
                                            {selectedToolDef.recommendedNextActions?.slice(0, 2).join(', ') || 'None'}
                                        </p>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-[#b8ecff] bg-[#f3fbff] p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-950">Input Summary</p>
                                            <p className="mt-1 text-sm leading-6 text-slate-600">{selectedToolDef.inputSummary}</p>
                                        </div>
                                        <Badge className="rounded-full border border-[#b8ecff] bg-white text-[#006688]">
                                            {requiredParameters.length} mandatory
                                        </Badge>
                                    </div>

                                    {selectedToolDef.notes?.length ? (
                                        <div className="mt-4 rounded-xl border border-[#d7f2fb] bg-white/80 p-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#006688]">Notes</p>
                                            <div className="mt-2 space-y-2">
                                                {selectedToolDef.notes.map((note) => (
                                                    <p key={note} className="text-sm leading-6 text-slate-600">
                                                        {note}
                                                    </p>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>

                                <Tabs value={selectedExampleVariant} onValueChange={(value) => setSelectedExampleVariant(value as ExampleVariant)}>
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <TabsList className="grid h-auto w-full grid-cols-2 bg-slate-100 sm:w-auto">
                                            <TabsTrigger value="minimal" className="h-auto whitespace-normal px-2 py-2 text-xs sm:text-sm">Minimal Example</TabsTrigger>
                                            <TabsTrigger value="full" className="h-auto whitespace-normal px-2 py-2 text-xs sm:text-sm" disabled={!selectedToolDef.fullExample}>
                                                Full Example
                                            </TabsTrigger>
                                        </TabsList>
                                        <Button
                                            variant="outline"
                                            onClick={() => refreshExample(selectedTool, selectedExampleVariant)}
                                            disabled={loadingContext || running}
                                        >
                                            <RefreshCw className="mr-2 h-4 w-4" />
                                            Load Example
                                        </Button>
                                    </div>
                                    <TabsContent value="minimal" className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-sm font-semibold text-slate-950">{selectedToolDef.minimalExample.title}</p>
                                        {selectedToolDef.minimalExample.description ? (
                                            <p className="mt-1 text-sm text-slate-600">{selectedToolDef.minimalExample.description}</p>
                                        ) : null}
                                    </TabsContent>
                                    <TabsContent value="full" className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-sm font-semibold text-slate-950">
                                            {selectedToolDef.fullExample?.title ?? 'No full example available'}
                                        </p>
                                        {selectedToolDef.fullExample?.description ? (
                                            <p className="mt-1 text-sm text-slate-600">{selectedToolDef.fullExample.description}</p>
                                        ) : null}
                                    </TabsContent>
                                </Tabs>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">Input JSON</label>
                                    <Textarea
                                        value={inputJson}
                                        onChange={(event) => setInputJson(event.target.value)}
                                        className="min-h-[280px] font-mono text-xs"
                                        spellCheck={false}
                                    />
                                </div>

                                <div className="flex flex-wrap gap-3">
                                    <Button variant="outline" onClick={() => refreshExample(selectedTool, selectedExampleVariant)} disabled={loadingContext || running}>
                                        <Wand2 className="mr-2 h-4 w-4" />
                                        Use Selected Example
                                    </Button>
                                    <Button onClick={handleRun} disabled={loadingContext || running}>
                                        {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                                        Run Tool
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border border-slate-200 bg-white shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-xl text-slate-950">Parameter Guide</CardTitle>
                                <CardDescription className="text-slate-500">
                                    Each parameter includes fill guidance, defaults, examples, and AI hints.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ScrollArea className="h-[760px] pr-4">
                                    <div className="space-y-4">
                                        {selectedToolDef.parameters.length ? (
                                            selectedToolDef.parameters.map((parameter) => (
                                                <div key={parameter.name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="text-base font-semibold text-slate-950">{parameter.label}</p>
                                                        <p className="font-mono text-xs text-slate-500">{parameter.name}</p>
                                                        <Badge
                                                            className={
                                                                parameter.required === 'mandatory'
                                                                    ? 'rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700'
                                                                    : parameter.required === 'conditional'
                                                                        ? 'rounded-full border border-amber-200 bg-amber-50 text-amber-700'
                                                                        : 'rounded-full border border-slate-200 bg-white text-slate-600'
                                                            }
                                                        >
                                                            {parameter.required}
                                                        </Badge>
                                                        <Badge
                                                            className={`rounded-full ${inputKindClasses[parameter.inputKind]}`}
                                                        >
                                                            {parameter.inputKind}
                                                        </Badge>
                                                        <Badge variant="outline" className="rounded-full font-mono text-[11px]">
                                                            {parameter.type}
                                                        </Badge>
                                                    </div>
                                                    <div className="mt-4 space-y-3 text-sm">
                                                        <div>
                                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">What it means</p>
                                                            <p className="mt-1 leading-6 text-slate-700">{parameter.description}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">How to fill</p>
                                                            <p className="mt-1 leading-6 text-slate-700">{parameter.howToFill}</p>
                                                        </div>

                                                        {parameter.acceptedValues?.length ? (
                                                            <div>
                                                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Accepted Values</p>
                                                                <div className="mt-2 space-y-2">
                                                                    {parameter.acceptedValues.map((option) => (
                                                                        <div key={option.value} className="rounded-xl border border-slate-200 bg-white p-3">
                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                <Badge variant="outline" className="rounded-full font-mono text-[11px]">
                                                                                    {option.value}
                                                                                </Badge>
                                                                                <p className="font-medium text-slate-950">{option.label}</p>
                                                                            </div>
                                                                            {option.meaning ? (
                                                                                <p className="mt-2 text-sm leading-6 text-slate-600">{option.meaning}</p>
                                                                            ) : null}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ) : null}

                                                        {parameter.referenceRule ? (
                                                            <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3">
                                                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fuchsia-700">Reference Rule</p>
                                                                <p className="mt-2 leading-6 text-slate-700">
                                                                    Accepts: {parameter.referenceRule.acceptedForms.join(', ')}.
                                                                    {parameter.referenceRule.recommendedSourceTool
                                                                        ? ` Recommended source: ${parameter.referenceRule.recommendedSourceTool}.`
                                                                        : ''}
                                                                </p>
                                                            </div>
                                                        ) : null}

                                                        <div className="grid gap-3 md:grid-cols-2">
                                                            {parameter.example !== undefined ? (
                                                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Example</p>
                                                                    <p className="mt-1 break-all font-mono text-xs text-slate-700">
                                                                        {renderExampleValue(parameter.example)}
                                                                    </p>
                                                                </div>
                                                            ) : null}
                                                            {parameter.defaultBehavior ? (
                                                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Default If Omitted</p>
                                                                    <p className="mt-1 text-xs leading-6 text-slate-700">{parameter.defaultBehavior}</p>
                                                                </div>
                                                            ) : null}
                                                        </div>

                                                        {parameter.aiHint ? (
                                                            <div className="rounded-xl border border-[#d7f2fb] bg-[#f8fdff] p-3">
                                                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#006688]">AI Hint</p>
                                                                <p className="mt-1 text-sm leading-6 text-slate-700">{parameter.aiHint}</p>
                                                            </div>
                                                        ) : null}

                                                        {parameter.commonMistakes?.length ? (
                                                            <div>
                                                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Common Mistakes</p>
                                                                <div className="mt-2 space-y-2">
                                                                    {parameter.commonMistakes.map((mistake) => (
                                                                        <p key={mistake} className="text-sm leading-6 text-rose-700">
                                                                            {mistake}
                                                                        </p>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                                                This tool does not need any input parameters. Leave the JSON input as <span className="font-mono">{'{}'}</span>.
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="min-w-0 space-y-6 xl:col-span-2 2xl:col-span-1">
                        <Card className="border border-slate-200 bg-white shadow-sm">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                                    <Sparkles className="h-5 w-5 text-[#006688]" />
                                    AI Suggestions
                                </CardTitle>
                                <CardDescription className="text-slate-500">
                                    Defaults, missing fields, and reference hints derived from the selected metadata.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {parsedInput === null ? (
                                    <Alert variant="destructive">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertTitle>Invalid JSON</AlertTitle>
                                        <AlertDescription>Fix the JSON input before running the tool.</AlertDescription>
                                    </Alert>
                                ) : null}

                                {missingMandatoryParameters.length > 0 ? (
                                    <Alert variant="destructive">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertTitle>Missing mandatory fields</AlertTitle>
                                        <AlertDescription>
                                            {missingMandatoryParameters.map((parameter) => parameter.label).join(', ')}
                                        </AlertDescription>
                                    </Alert>
                                ) : (
                                    <Alert>
                                        <CheckCircle2 className="h-4 w-4" />
                                        <AlertTitle>Mandatory fields look complete</AlertTitle>
                                        <AlertDescription>
                                            All mandatory fields for this tool are currently populated.
                                        </AlertDescription>
                                    </Alert>
                                )}

                                {defaultedParameters.length > 0 ? (
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Defaults that can be applied</p>
                                        <div className="mt-3 space-y-3">
                                            {defaultedParameters.map((parameter) => (
                                                <div key={parameter.name} className="rounded-xl border border-slate-200 bg-white p-3">
                                                    <p className="font-medium text-slate-950">{parameter.label}</p>
                                                    <p className="mt-1 text-sm leading-6 text-slate-600">{parameter.defaultBehavior}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

                                {referenceParameters.length > 0 ? (
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Reference resolution hints</p>
                                        <div className="mt-3 space-y-3">
                                            {referenceParameters.map((parameter) => (
                                                <div key={parameter.name} className="rounded-xl border border-slate-200 bg-white p-3">
                                                    <p className="font-medium text-slate-950">{parameter.label}</p>
                                                    <p className="mt-1 text-sm leading-6 text-slate-600">
                                                        Accepts {parameter.referenceRule?.acceptedForms.join(', ') || 'id'}.
                                                        {parameter.referenceRule?.recommendedSourceTool
                                                            ? ` Best source: ${parameter.referenceRule.recommendedSourceTool}.`
                                                            : ''}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

                                {selectedToolDef.commonMistakes?.length ? (
                                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">Common tool mistakes</p>
                                        <div className="mt-3 space-y-2">
                                            {selectedToolDef.commonMistakes.map((mistake) => (
                                                <p key={mistake} className="text-sm leading-6 text-rose-700">{mistake}</p>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </CardContent>
                        </Card>

                        <Card className="border border-slate-200 bg-white shadow-sm">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                                    <Braces className="h-5 w-5 text-[#006688]" />
                                    Execution Result
                                </CardTitle>
                                <CardDescription className="text-slate-500">
                                    Summary, structured data, raw JSON, and next-step inputs in one place.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex justify-end">
                                    <Button variant="outline" onClick={handleCopyResult} disabled={!resultJson}>
                                        <Copy className="mr-2 h-4 w-4" />
                                        Copy Result
                                    </Button>
                                </div>
                                <Tabs defaultValue="summary">
                                    <TabsList className="grid h-auto w-full grid-cols-3 bg-slate-100">
                                        <TabsTrigger value="summary" className="px-1 text-xs sm:px-3 sm:text-sm">Summary</TabsTrigger>
                                        <TabsTrigger value="data" className="px-1 text-xs sm:px-3 sm:text-sm">Structured</TabsTrigger>
                                        <TabsTrigger value="raw" className="px-1 text-xs sm:px-3 sm:text-sm">Raw JSON</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="summary" className="space-y-4">
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-sm font-semibold text-slate-950">
                                                {result?.summary ?? 'Run a tool to view the execution summary.'}
                                            </p>
                                        </div>
                                        {essayReadinessHighlights.length ? (
                                            <div className="rounded-[28px] border border-[#dbe7f3] bg-[linear-gradient(180deg,#fbfdff_0%,#f4f8fc_100%)] p-4 shadow-sm">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                            Essay AI Readiness
                                                        </p>
                                                        <p className="mt-1 text-sm text-slate-600">
                                                            Scoring points, sample answers, and point-balance checks extracted from the latest result.
                                                        </p>
                                                    </div>
                                                    <Badge variant="outline" className="rounded-full border-[#d7e4ee] bg-white text-slate-700">
                                                        {essayReadinessHighlights.length} block{essayReadinessHighlights.length > 1 ? 's' : ''}
                                                    </Badge>
                                                </div>
                                                <div className="mt-4 grid gap-3">
                                                    {essayReadinessHighlights.map((highlight) => {
                                                        const theme = essayReadinessTheme[highlight.status]
                                                        const statusLabel =
                                                            highlight.status === 'NOT_READY'
                                                                ? 'Needs setup'
                                                                : highlight.status === 'NOT_APPLICABLE'
                                                                    ? 'No essay questions'
                                                                    : highlight.status
                                                        return (
                                                            <div
                                                                key={highlight.key}
                                                                className={`rounded-3xl border p-4 shadow-sm ${theme.shell}`}
                                                            >
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div className="space-y-1">
                                                                        <div className="flex items-center gap-2">
                                                                            {highlight.status === 'READY' ? (
                                                                                <CheckCircle2 className={`h-4 w-4 ${theme.icon}`} />
                                                                            ) : (
                                                                                <AlertCircle className={`h-4 w-4 ${theme.icon}`} />
                                                                            )}
                                                                            <p className="text-sm font-semibold text-slate-950">
                                                                                {highlight.title}
                                                                            </p>
                                                                        </div>
                                                                        <p className="text-sm leading-6 text-slate-600">{highlight.summary}</p>
                                                                    </div>
                                                                    <Badge variant="outline" className={`rounded-full ${theme.badge}`}>
                                                                        {statusLabel}
                                                                    </Badge>
                                                                </div>
                                                                <div className="mt-4 grid gap-3 md:grid-cols-5">
                                                                    {highlight.stats.map((stat) => (
                                                                        <div key={`${highlight.key}-${stat.label}`} className="rounded-2xl border border-white/80 bg-white/80 p-3">
                                                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                                                                {stat.label}
                                                                            </p>
                                                                            <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-slate-950">
                                                                                {stat.value}
                                                                            </p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        ) : null}
                                        {result?.warnings?.length ? (
                                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Warnings</p>
                                                <div className="mt-3 space-y-2">
                                                    {result.warnings.map((warning) => (
                                                        <p key={warning} className="text-sm leading-6 text-amber-700">{warning}</p>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}
                                        {result?.nextActions?.length ? (
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Recommended Next Actions</p>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {result.nextActions.map((action) => (
                                                        <Badge key={action} variant="outline" className="rounded-full bg-white">
                                                            {action}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}
                                        {result?.recommendedNextInputs ? (
                                            <div className="rounded-2xl border border-[#d7f2fb] bg-[#f8fdff] p-4">
                                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#006688]">Recommended Next Inputs</p>
                                                <Textarea
                                                    value={JSON.stringify(result.recommendedNextInputs, null, 2)}
                                                    readOnly
                                                    className="mt-3 min-h-[180px] font-mono text-xs"
                                                />
                                            </div>
                                        ) : null}
                                    </TabsContent>
                                    <TabsContent value="data">
                                        <Textarea
                                            value={result?.data ? JSON.stringify(result.data, null, 2) : ''}
                                            readOnly
                                            className="min-h-[360px] font-mono text-xs"
                                            placeholder="Run a tool to inspect the structured data payload."
                                        />
                                    </TabsContent>
                                    <TabsContent value="raw">
                                        <Textarea
                                            value={resultJson}
                                            readOnly
                                            className="min-h-[360px] font-mono text-xs"
                                            placeholder="Run a tool to inspect the raw payload here."
                                        />
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <ConfirmDialog
                    open={confirmationOpen}
                    onOpenChange={setConfirmationOpen}
                    title="Confirm production-side operation"
                    description={`${selectedToolDef.label} may publish content, notify learners, upload a transcript, or start processing. Scope: ${scopedDomains[0]?.name ?? 'all authorized domains'}. The request will include a correlation key for auditability.`}
                    confirmLabel="Confirm and run"
                    confirmVariant="destructive"
                    confirmDisabled={running}
                    onConfirm={() => void handleConfirmedRun()}
                />
            </div>
        </DashboardLayout>
    )
}
