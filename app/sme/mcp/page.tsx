'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { ApiClient } from '@/lib/api-client'
import { smeMcpToolMetadata, type SmeMcpToolMetadata } from '@/lib/sme-mcp-tool-metadata'
import type {
    LearningSeriesSummary,
    ProductDomainSummary,
    SmeWorkspaceSummary,
    TrainingOpsCourseSummary,
    TrainingOpsExamSummary,
} from '@/types'
import { Bot, Braces, Copy, Loader2, Play, RefreshCw, Sparkles } from 'lucide-react'

type PromptTemplateSummary = {
    id: string
    name: string
    slug: string
    useCase: string
    isActive: boolean
}

const TOOL_DEFINITIONS = smeMcpToolMetadata

function buildExampleInput(
    tool: string,
    overview: SmeWorkspaceSummary | null,
    domains: ProductDomainSummary[],
    series: LearningSeriesSummary[],
    courses: TrainingOpsCourseSummary[],
    exams: TrainingOpsExamSummary[],
    templates: PromptTemplateSummary[]
) {
    const domain = domains[0] ?? overview?.domains[0]
    const learningSeries = series[0] ?? overview?.series[0]
    const event = overview?.events[0]
    const course = courses[0]
    const unlinkedCourse = courses.find((row) => !row.learningEventId) ?? course
    const exam = exams[0]
    const unlinkedExam = exams.find((row) => !row.learningEventId) ?? exam
    const approvedExam = exams.find((row) => row.status === 'APPROVED') ?? exam
    const template = templates.find((row) => row.isActive) ?? templates[0]

    switch (tool) {
        case 'list_my_workspace':
            return {}
        case 'create_case_study_bundle':
            return {
                domainId: domain?.id ?? '',
                seriesId: learningSeries?.id ?? '',
                title: `${domain?.name ?? 'SME'} Case Study - ${new Date().toISOString().slice(0, 10)}`,
                description: 'Created from SME MCP Lab.',
                starValue: 2,
                assessmentKind: 'PRACTICE',
                countsTowardPerformance: false,
            }
        case 'link_existing_course_to_event':
            return {
                eventId: event?.id ?? '',
                courseId: unlinkedCourse?.id ?? '',
            }
        case 'link_existing_exam_to_event':
            return {
                eventId: event?.id ?? '',
                examId: unlinkedExam?.id ?? '',
            }
        case 'get_event_execution_status':
            return { eventId: event?.id ?? '' }
        case 'set_course_ai_template':
            return template
                ? {
                    courseId: course?.id ?? '',
                    templateId: template.id,
                    enabled: true,
                }
                : {
                    courseId: course?.id ?? '',
                    useDefault: true,
                }
        case 'assign_course_invitations':
            return {
                courseId: course?.id ?? '',
                userIds: [],
                sendNotification: false,
            }
        case 'prepare_transcript_upload':
            return {
                lessonId: '',
                filename: 'lesson-transcript.vtt',
                contentType: 'text/vtt',
                languageCode: 'en',
                label: 'English',
            }
        case 'process_transcript_knowledge':
            return {
                lessonId: '',
                processTranscript: true,
                processKnowledge: true,
            }
        case 'publish_exam_with_invitations':
            return {
                examId: approvedExam?.id ?? '',
                userIds: [],
                sendNotification: false,
            }
        case 'list_my_series_badges':
            return {}
        default:
            return {}
    }
}

export default function SmeMcpLabPage() {
    const [selectedTool, setSelectedTool] = useState<string>('list_my_workspace')
    const [loadingContext, setLoadingContext] = useState(true)
    const [running, setRunning] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [inputJson, setInputJson] = useState('{}')
    const [resultJson, setResultJson] = useState('')
    const [overview, setOverview] = useState<SmeWorkspaceSummary | null>(null)
    const [domains, setDomains] = useState<ProductDomainSummary[]>([])
    const [series, setSeries] = useState<LearningSeriesSummary[]>([])
    const [courses, setCourses] = useState<TrainingOpsCourseSummary[]>([])
    const [exams, setExams] = useState<TrainingOpsExamSummary[]>([])
    const [templates, setTemplates] = useState<PromptTemplateSummary[]>([])

    useEffect(() => {
        const loadContext = async () => {
            try {
                setLoadingContext(true)
                const [overviewResponse, domainsResponse, seriesResponse, coursesResponse, examsResponse, templatesResponse] =
                    await Promise.all([
                        ApiClient.getSmeTrainingOpsOverview(),
                        ApiClient.getSmeTrainingOpsDomains(),
                        ApiClient.getSmeTrainingOpsSeries(),
                        ApiClient.getSmeTrainingOpsCourses(),
                        ApiClient.getSmeTrainingOpsExams(),
                        ApiClient.getAiPromptTemplates({ isActive: true }),
                    ])

                setOverview(overviewResponse.data)
                setDomains(domainsResponse.data)
                setSeries(seriesResponse.data)
                setCourses(coursesResponse.data)
                setExams(examsResponse.data)
                setTemplates(templatesResponse.data)
                setError(null)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load SME MCP context')
            } finally {
                setLoadingContext(false)
            }
        }

        void loadContext()
    }, [])

    const selectedToolDef = TOOL_DEFINITIONS.find((tool) => tool.key === selectedTool) ?? TOOL_DEFINITIONS[0]

    const categories = useMemo(() => [...new Set(TOOL_DEFINITIONS.map((tool) => tool.category))], [])

    const refreshExample = (toolKey: string) => {
        const example = buildExampleInput(toolKey, overview, domains, series, courses, exams, templates)
        setInputJson(JSON.stringify(example, null, 2))
    }

    useEffect(() => {
        if (!loadingContext) {
            refreshExample(selectedTool)
        }
    }, [selectedTool, loadingContext, overview, domains, series, courses, exams, templates])

    const handleRun = async () => {
        try {
            setRunning(true)
            setError(null)
            const parsed = inputJson.trim() ? JSON.parse(inputJson) : {}
            const response = await ApiClient.callSmeMcp(selectedTool, parsed)
            setResultJson(JSON.stringify(response, null, 2))
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to execute SME MCP tool'
            setError(message)
            setResultJson('')
        } finally {
            setRunning(false)
        }
    }

    const handleCopy = async () => {
        if (!resultJson) return
        await navigator.clipboard.writeText(resultJson)
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <Card className="border border-slate-200 bg-white shadow-sm">
                    <CardContent className="space-y-5 p-7 md:p-8">
                        <Badge className="w-fit rounded-full border border-[#b8ecff] bg-[#effbff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#006688]">
                            SME MCP v2.1 Lab
                        </Badge>
                        <div className="space-y-3">
                            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">
                                Visual console for the SME MCP v2.1 workflow surface
                            </h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
                                Use this lab to exercise the workflow-oriented SME MCP tools without switching to curl or JSON scripts.
                                Detailed course and exam authoring stays in the UI; this console is for the v2 operational shortcuts.
                            </p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-4">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Domains</p>
                                <p className="mt-2 text-2xl font-semibold text-slate-950">{domains.length}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Series</p>
                                <p className="mt-2 text-2xl font-semibold text-slate-950">{series.length}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Courses</p>
                                <p className="mt-2 text-2xl font-semibold text-slate-950">{courses.length}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Exams</p>
                                <p className="mt-2 text-2xl font-semibold text-slate-950">{exams.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {error ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                        {error}
                    </div>
                ) : null}

                <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
                    <Card className="border border-slate-200 bg-white shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-2xl text-slate-950">
                                <Bot className="h-5 w-5 text-[#006688]" />
                                Tool Console
                            </CardTitle>
                            <CardDescription className="text-slate-500">
                                Pick a v2 tool, inspect the example payload, then run it against your current SME scope.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Tool</label>
                                <Select value={selectedTool} onValueChange={setSelectedTool}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a tool" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {categories.map((category) => (
                                            <div key={category}>
                                                <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                                    {category}
                                                </div>
                                                {TOOL_DEFINITIONS.filter((tool) => tool.category === category).map((tool) => (
                                                    <SelectItem key={tool.key} value={tool.key}>
                                                        {tool.label}
                                                    </SelectItem>
                                                ))}
                                            </div>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="font-semibold text-slate-950">{selectedToolDef.label}</p>
                                        <p className="mt-1 text-sm text-slate-600">{selectedToolDef.description}</p>
                                    </div>
                                    <Badge variant="outline">{selectedToolDef.category}</Badge>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-[#b8ecff] bg-[#f3fbff] p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-950">Parameter Guide</p>
                                        <p className="mt-1 text-sm text-slate-600">{selectedToolDef.inputSummary}</p>
                                    </div>
                                    <Badge className="rounded-full border border-[#b8ecff] bg-white text-[#006688]">
                                        {selectedToolDef.parameters.filter((parameter) => parameter.required).length} Required
                                    </Badge>
                                </div>

                                {selectedToolDef.notes?.length ? (
                                    <div className="mt-4 rounded-xl border border-[#d7f2fb] bg-white/80 p-3">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#006688]">Usage Notes</p>
                                        <div className="mt-2 space-y-2">
                                            {selectedToolDef.notes.map((note) => (
                                                <p key={note} className="text-sm leading-6 text-slate-600">
                                                    {note}
                                                </p>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

                                <div className="mt-4 space-y-3">
                                    {selectedToolDef.parameters.length ? (
                                        selectedToolDef.parameters.map((parameter) => (
                                            <div key={parameter.name} className="rounded-xl border border-slate-200 bg-white p-4">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="font-mono text-sm font-semibold text-slate-950">{parameter.name}</p>
                                                    <Badge
                                                        className={
                                                            parameter.required
                                                                ? 'rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700'
                                                                : 'rounded-full border border-slate-200 bg-slate-50 text-slate-600'
                                                        }
                                                    >
                                                        {parameter.required ? 'Required' : 'Optional'}
                                                    </Badge>
                                                    <Badge variant="outline" className="rounded-full font-mono text-[11px]">
                                                        {parameter.type}
                                                    </Badge>
                                                </div>
                                                <p className="mt-2 text-sm leading-6 text-slate-600">{parameter.description}</p>
                                                {parameter.acceptedValues?.length ? (
                                                    <div className="mt-3">
                                                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                                            Accepted Values
                                                        </p>
                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                            {parameter.acceptedValues.map((value) => (
                                                                <Badge key={value} variant="outline" className="rounded-full bg-slate-50 font-mono text-[11px]">
                                                                    {value}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : null}
                                                {parameter.example ? (
                                                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Example</p>
                                                        <p className="mt-1 break-all font-mono text-xs text-slate-700">{parameter.example}</p>
                                                    </div>
                                                ) : null}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                                            This tool does not need any input parameters. Leave the JSON input as <span className="font-mono">{'{}'}</span>.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Input JSON</label>
                                <Textarea
                                    value={inputJson}
                                    onChange={(event) => setInputJson(event.target.value)}
                                    className="min-h-[360px] font-mono text-xs"
                                    spellCheck={false}
                                />
                            </div>

                            <div className="flex flex-wrap gap-3">
                                <Button variant="outline" onClick={() => refreshExample(selectedTool)} disabled={loadingContext || running}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Reset Example
                                </Button>
                                <Button onClick={handleRun} disabled={loadingContext || running}>
                                    {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                                    Run Tool
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-6">
                        <Card className="border border-slate-200 bg-white shadow-sm">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-2xl text-slate-950">
                                    <Braces className="h-5 w-5 text-[#006688]" />
                                    Result
                                </CardTitle>
                            <CardDescription className="text-slate-500">
                                Raw MCP response payload from the workflow-oriented SME tool backend.
                            </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex justify-end">
                                    <Button variant="outline" onClick={handleCopy} disabled={!resultJson}>
                                        <Copy className="mr-2 h-4 w-4" />
                                        Copy Result
                                    </Button>
                                </div>
                                <Textarea
                                    value={resultJson}
                                    readOnly
                                    className="min-h-[360px] font-mono text-xs"
                                    placeholder="Run a tool to inspect the structured response here."
                                />
                            </CardContent>
                        </Card>

                        <Card className="border border-slate-200 bg-white shadow-sm">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                                    <Sparkles className="h-5 w-5 text-[#006688]" />
                                    Context Hints
                                </CardTitle>
                                <CardDescription className="text-slate-500">
                                    Current scoped IDs you can reuse while editing JSON inputs.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">First Event</p>
                                    <p className="mt-2 font-medium text-slate-950">{overview?.events[0]?.title ?? 'None in scope'}</p>
                                    <p className="mt-1 break-all font-mono text-xs text-slate-600">{overview?.events[0]?.id ?? '—'}</p>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">First Domain</p>
                                    <p className="mt-2 font-medium text-slate-950">{domains[0]?.name ?? 'None in scope'}</p>
                                    <p className="mt-1 break-all font-mono text-xs text-slate-600">{domains[0]?.id ?? '—'}</p>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">First Series</p>
                                    <p className="mt-2 font-medium text-slate-950">{series[0]?.name ?? 'None in scope'}</p>
                                    <p className="mt-1 break-all font-mono text-xs text-slate-600">{series[0]?.id ?? '—'}</p>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">First Course</p>
                                    <p className="mt-2 font-medium text-slate-950">{courses[0]?.title ?? 'None in scope'}</p>
                                    <p className="mt-1 break-all font-mono text-xs text-slate-600">{courses[0]?.id ?? '—'}</p>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">First Exam</p>
                                    <p className="mt-2 font-medium text-slate-950">{exams[0]?.title ?? 'None in scope'}</p>
                                    <p className="mt-1 break-all font-mono text-xs text-slate-600">{exams[0]?.id ?? '—'}</p>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Active AI Template</p>
                                    <p className="mt-2 font-medium text-slate-950">{templates[0]?.name ?? 'None loaded'}</p>
                                    <p className="mt-1 break-all font-mono text-xs text-slate-600">{templates[0]?.id ?? '—'}</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
