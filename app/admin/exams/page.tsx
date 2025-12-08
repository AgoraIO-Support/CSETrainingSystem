'use client'

import { useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { mockCourses } from '@/lib/mock-data'
import { BookOpen, ClipboardList, GraduationCap, TrendingUp } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { Input } from '@/components/ui/input'

const DEFAULT_EXAMS = [
    {
        id: 'exam-1',
        courseId: '1',
        title: 'Agora SDK Fundamentals - Final Assessment',
        status: 'Scheduled',
        type: 'Final',
        duration: 45,
        attempts: 48,
        passRate: 82,
        lastRun: '2025-12-01',
    },
    {
        id: 'exam-2',
        courseId: '2',
        title: 'Advanced RTC Optimization - Midterm',
        status: 'Active',
        type: 'Midterm',
        duration: 30,
        attempts: 32,
        passRate: 75,
        lastRun: '2025-11-28',
    },
    {
        id: 'exam-3',
        courseId: '3',
        title: 'Live Streaming Essentials - Knowledge Check',
        status: 'Draft',
        type: 'Quiz',
        duration: 20,
        attempts: 0,
        passRate: null,
        lastRun: null,
    },
]

export default function AdminExamsPage() {
    const [exams, setExams] = useState(DEFAULT_EXAMS)
    const [showCreate, setShowCreate] = useState(false)
    const [creating, setCreating] = useState(false)
    const [createError, setCreateError] = useState<string | null>(null)
    const [form, setForm] = useState({
        title: '',
        courseId: mockCourses[0]?.id ?? '',
        type: 'Final',
        duration: 45,
    })

    const courseLookup = useMemo(
        () =>
            mockCourses.reduce<Record<string, (typeof mockCourses)[number]>>((acc, course) => {
                acc[course.id] = course
                return acc
            }, {}),
        []
    )

    const activeExams = exams.filter(exam => exam.status !== 'Draft')
    const draftExams = exams.filter(exam => exam.status === 'Draft')

    const stats = {
        total: exams.length,
        active: activeExams.length,
        draft: draftExams.length,
        avgPassRate: Math.round(
            activeExams.reduce((total, exam) => total + (exam.passRate ?? 0), 0) / Math.max(activeExams.length, 1)
        ),
    }

    const handleCreateExam = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!form.title.trim()) {
            setCreateError('Exam title is required')
            return
        }
        if (!form.courseId) {
            setCreateError('Please select a course')
            return
        }
        setCreating(true)
        setCreateError(null)
        setTimeout(() => {
            setExams(prev => [
                {
                    id: `exam-${prev.length + 1}`,
                    courseId: form.courseId,
                    title: form.title.trim(),
                    status: 'Draft',
                    type: form.type,
                    duration: Number(form.duration) || 30,
                    attempts: 0,
                    passRate: null,
                    lastRun: null,
                },
                ...prev,
            ])
            setForm({
                title: '',
                courseId: mockCourses[0]?.id ?? '',
                type: 'Final',
                duration: 45,
            })
            setShowCreate(false)
            setCreating(false)
        }, 400)
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <h1 className="text-3xl font-bold">Exam Management</h1>
                        <p className="text-muted-foreground mt-1">
                            Schedule, monitor, and iterate on course exams and certifications
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline">Import Blueprint</Button>
                        <Button onClick={() => setShowCreate(current => !current)}>{showCreate ? 'Close' : 'Create Exam'}</Button>
                    </div>
                </div>

                {showCreate && (
                    <Card>
                        <CardHeader>
                            <CardTitle>New Exam</CardTitle>
                            <CardDescription>Provide the essential details to draft a new exam configuration.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form className="space-y-4" onSubmit={handleCreateExam}>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="text-sm font-medium">Title</label>
                                        <Input
                                            value={form.title}
                                            onChange={event => setForm(prev => ({ ...prev, title: event.target.value }))}
                                            placeholder="e.g. Advanced RTC Final"
                                            className="mt-1"
                                            required
                                        />
                                    </div>
                                    <div>
                                            <label className="text-sm font-medium">Course</label>
                                            <select
                                                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                                                value={form.courseId}
                                                onChange={event => setForm(prev => ({ ...prev, courseId: event.target.value }))}
                                            >
                                                {mockCourses.map(course => (
                                                    <option key={course.id} value={course.id}>
                                                        {course.title}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="text-sm font-medium">Exam Type</label>
                                        <select
                                            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                                            value={form.type}
                                            onChange={event => setForm(prev => ({ ...prev, type: event.target.value }))}
                                        >
                                            <option value="Final">Final</option>
                                            <option value="Midterm">Midterm</option>
                                            <option value="Quiz">Quiz</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium">Duration (minutes)</label>
                                        <Input
                                            type="number"
                                            min={10}
                                            value={form.duration}
                                            onChange={event => setForm(prev => ({ ...prev, duration: Number(event.target.value) }))}
                                            className="mt-1"
                                        />
                                    </div>
                                </div>
                                {createError && <p className="text-sm text-destructive">{createError}</p>}
                                <div className="flex items-center gap-3">
                                    <Button type="submit" disabled={creating}>
                                        {creating ? 'Creating...' : 'Create Draft'}
                                    </Button>
                                    <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                                        Cancel
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                )}

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <StatCard title="Total Exams" value={stats.total} helper="Across all courses" icon={ClipboardList} />
                    <StatCard title="Active" value={stats.active} helper="Currently available" icon={BookOpen} />
                    <StatCard title="Drafts" value={stats.draft} helper="Needs configuration" icon={GraduationCap} />
                    <StatCard title="Avg. Pass Rate" value={`${stats.avgPassRate}%`} helper="Rolling 30 days" icon={TrendingUp} />
                </div>

                <Tabs defaultValue="active" className="w-full">
                    <TabsList>
                        <TabsTrigger value="active">Active Exams</TabsTrigger>
                        <TabsTrigger value="drafts">Drafts</TabsTrigger>
                    </TabsList>

                    <TabsContent value="active" className="mt-6">
                        <ExamTable exams={activeExams} courseLookup={courseLookup} emptyLabel="No active exams yet." />
                    </TabsContent>

                    <TabsContent value="drafts" className="mt-6">
                        <ExamTable exams={draftExams} courseLookup={courseLookup} emptyLabel="No drafts available." />
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    )
}

interface StatCardProps {
    title: string
    value: string | number
    helper: string
    icon: React.ComponentType<{ className?: string }>
}

function StatCard({ title, value, helper, icon: Icon }: StatCardProps) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                <p className="text-xs text-muted-foreground mt-1">{helper}</p>
            </CardContent>
        </Card>
    )
}

interface ExamTableProps {
    exams: typeof DEFAULT_EXAMS
    courseLookup: Record<string, (typeof mockCourses)[number]>
    emptyLabel: string
}

function ExamTable({ exams, courseLookup, emptyLabel }: ExamTableProps) {
    if (!exams.length) {
        return (
            <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">{emptyLabel}</CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Exam Overview</CardTitle>
                <CardDescription>Key metrics for each exam</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-muted-foreground border-b">
                            <th className="py-3 pr-4 font-medium">Exam</th>
                            <th className="py-3 pr-4 font-medium">Course</th>
                            <th className="py-3 pr-4 font-medium">Type</th>
                            <th className="py-3 pr-4 font-medium">Status</th>
                            <th className="py-3 pr-4 font-medium">Duration</th>
                            <th className="py-3 pr-4 font-medium">Attempts</th>
                            <th className="py-3 pr-4 font-medium">Pass Rate</th>
                            <th className="py-3 font-medium">Last Run</th>
                        </tr>
                    </thead>
                    <tbody>
                        {exams.map(exam => {
                            const course = courseLookup[exam.courseId]
                            return (
                                <tr key={exam.id} className="border-b last:border-none">
                                    <td className="py-3 pr-4 font-medium">{exam.title}</td>
                                    <td className="py-3 pr-4">
                                        <div>
                                            <p className="font-medium">{course?.title ?? '—'}</p>
                                            <p className="text-xs text-muted-foreground">{course?.instructor?.name ?? '—'}</p>
                                        </div>
                                    </td>
                                    <td className="py-3 pr-4">
                                        <Badge variant="outline">{exam.type}</Badge>
                                    </td>
                                    <td className="py-3 pr-4">
                                        <Badge variant={exam.status === 'Active' ? 'default' : 'secondary'}>{exam.status}</Badge>
                                    </td>
                                    <td className="py-3 pr-4">{exam.duration} min</td>
                                    <td className="py-3 pr-4">{exam.attempts}</td>
                                    <td className="py-3 pr-4">
                                        {exam.passRate ? (
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span>{exam.passRate}%</span>
                                                    <span>{exam.passRate >= 80 ? 'On track' : 'Review'}</span>
                                                </div>
                                                <Progress value={exam.passRate} />
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground text-xs">No data</span>
                                        )}
                                    </td>
                                    <td className="py-3">{exam.lastRun ? formatDate(exam.lastRun) : '—'}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </CardContent>
        </Card>
    )
}
