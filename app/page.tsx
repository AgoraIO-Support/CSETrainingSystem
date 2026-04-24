'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ApiClient } from '@/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ArrowRight, BookOpen, Award, Loader2, Medal, Star } from 'lucide-react'
import type { AuthUser } from '@/lib/auth-middleware'
import type { Course, LearnerRewardsOverview, LearnerTrainingOverview } from '@/types'

type DashboardUser = AuthUser & {
    name?: string | null
}

interface StoredLessonResume {
    courseId: string
    lessonId: string
    lessonTitle?: string
    chapterTitle?: string
}

export default function HomePage() {
    const router = useRouter()
    const [user, setUser] = useState<DashboardUser | null>(null)
    const [courses, setCourses] = useState<Course[]>([])
    const [enrolledCourseCount, setEnrolledCourseCount] = useState(0)
    const [rewardsOverview, setRewardsOverview] = useState<LearnerRewardsOverview | null>(null)
    const [trainingOverview, setTrainingOverview] = useState<LearnerTrainingOverview | null>(null)
    const [loading, setLoading] = useState(true)
    const [continueLoading, setContinueLoading] = useState(false)
    const [continueCard, setContinueCard] = useState<null | {
        courseId: string
        courseTitle: string
        courseSlug?: string
        lessonId: string
        lessonTitle: string
        chapterTitle?: string
        nextLesson?: { id: string; title: string; chapterTitle?: string }
    }>(null)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [userRes, coursesRes] = await Promise.all([
                    ApiClient.getMe(),
                    ApiClient.getCourses()
                ])
                setUser(userRes.data)
                setCourses(coursesRes.data.courses)

                const [progressOverviewRes, rewardsRes, trainingRes] = await Promise.allSettled([
                    ApiClient.getProgressOverview(),
                    ApiClient.getLearnerRewardsOverview(),
                    ApiClient.getLearnerTrainingOverview(),
                ])

                if (progressOverviewRes.status === 'fulfilled') {
                    setEnrolledCourseCount(progressOverviewRes.value.data.stats.totalEnrolled || 0)
                }
                if (rewardsRes.status === 'fulfilled') {
                    setRewardsOverview(rewardsRes.value.data)
                }
                if (trainingRes.status === 'fulfilled') {
                    setTrainingOverview(trainingRes.value.data)
                }
            } catch (error) {
                console.error('Failed to fetch data:', error)
                router.push('/login')
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [router])

    useEffect(() => {
        if (!user) return
        const stored = (() => {
            try {
                const key = `cse:lastLesson:${user?.id ?? 'anon'}`
                return localStorage.getItem(key)
            } catch {
                return null
            }
        })()
        if (!stored) return
        let parsed: StoredLessonResume | null = null
        try {
            parsed = JSON.parse(stored)
        } catch {
            return
        }
        if (!parsed?.courseId || !parsed?.lessonId) return

        const loadContinueCard = async () => {
            setContinueLoading(true)
            try {
                const courseRes = await ApiClient.getCourse(parsed.courseId)
                const course = courseRes.data
                if (course?.isEnrolled === false) {
                    setContinueCard(null)
                    return
                }
                const chapters = course.chapters || []
                let nextLesson: { id: string; title: string; chapterTitle?: string } | undefined

                for (let c = 0; c < chapters.length; c++) {
                    const lessons = chapters[c].lessons || []
                    for (let l = 0; l < lessons.length; l++) {
                        if (lessons[l].id === parsed.lessonId) {
                            if (l < lessons.length - 1) {
                                nextLesson = {
                                    id: lessons[l + 1].id,
                                    title: lessons[l + 1].title,
                                    chapterTitle: chapters[c].title,
                                }
                            } else if (c < chapters.length - 1) {
                                const firstNext = chapters[c + 1].lessons?.[0]
                                if (firstNext) {
                                    nextLesson = {
                                        id: firstNext.id,
                                        title: firstNext.title,
                                        chapterTitle: chapters[c + 1].title,
                                    }
                                }
                            }
                            break
                        }
                    }
                }

                setContinueCard({
                    courseId: course.id,
                    courseTitle: course.title,
                    courseSlug: course.slug,
                    lessonId: parsed.lessonId,
                    lessonTitle: parsed.lessonTitle || 'Last lesson',
                    chapterTitle: parsed.chapterTitle,
                    nextLesson,
                })
            } catch (error) {
                console.error('Failed to load continue card:', error)
            } finally {
                setContinueLoading(false)
            }
        }

        loadContinueCard()
    }, [user])

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!user) return null

    return (
        <DashboardLayout initialUser={user}>
            <div className="space-y-8">
                <div className="grid gap-6 xl:grid-cols-[1.8fr_1fr]">
                    <Card className="overflow-hidden">
                        <CardContent className="p-7 md:p-8">
                            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
                                <div className="max-w-2xl space-y-4">
                                    <Badge className="w-fit">Learning Overview</Badge>
                                    <div className="space-y-3">
                                        <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground md:text-4xl">
                                            {`Welcome back, ${(user.name || 'Teammate').split(' ')[0]}`}
                                        </h1>
                                        <p className="max-w-xl text-sm leading-7 text-muted-foreground md:text-base">
                                            Track your assigned learning, return to recent lessons, and keep progress moving across courses and assessments.
                                        </p>
                                    </div>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[320px]">
                                    <div className="rounded-2xl border border-slate-200/70 bg-slate-50 p-4">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                            Enrolled
                                        </p>
                                        <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{enrolledCourseCount}</p>
                                        <p className="mt-1 text-sm text-muted-foreground">Active learning programs</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200/70 bg-slate-50 p-4">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                            Stars
                                        </p>
                                        <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{rewardsOverview?.summary.totalStars ?? 0}</p>
                                        <p className="mt-1 text-sm text-muted-foreground">Training rewards earned</p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/70">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg">Training snapshot</CardTitle>
                            <CardDescription>What needs attention next</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                                    Pending Assessments
                                </p>
                                <p className="mt-2 text-2xl font-semibold text-sky-800">{trainingOverview?.summary.pendingExams ?? 0}</p>
                                <p className="mt-1 text-sm text-sky-700/80">
                                    {trainingOverview?.summary.upcomingEvents ?? 0} linked events · {rewardsOverview?.summary.totalBadges ?? 0} badges unlocked
                                </p>
                            </div>
                            <Link href="/training" className="block">
                                <Button variant="outline" className="w-full justify-between">
                                    Open learning hub
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                            </Link>
                            <Link href="/rewards" className="block">
                                <Button variant="outline" className="w-full justify-between">
                                    View rewards
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="flex flex-col gap-4 pb-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-1">
                            <CardTitle className="text-xl">Continue learning</CardTitle>
                            <CardDescription>Resume your most recent lesson or move to the next recommended step.</CardDescription>
                        </div>
                        {continueLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {continueCard ? (
                            <>
                                <div className="grid gap-4 lg:grid-cols-2">
                                    <div className="rounded-2xl border border-border/70 bg-secondary/45 p-4">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Last watched</p>
                                        <p className="mt-2 text-lg font-semibold tracking-[-0.03em]">{continueCard.lessonTitle}</p>
                                        {continueCard.chapterTitle && (
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                {continueCard.courseTitle} · {continueCard.chapterTitle}
                                            </p>
                                        )}
                                    </div>
                                    <div className="rounded-2xl border border-border/70 bg-secondary/45 p-4">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Next recommendation</p>
                                        {continueCard.nextLesson ? (
                                            <>
                                                <p className="mt-2 text-lg font-semibold tracking-[-0.03em]">{continueCard.nextLesson.title}</p>
                                                {continueCard.nextLesson.chapterTitle && (
                                                    <p className="mt-1 text-sm text-muted-foreground">
                                                        {continueCard.nextLesson.chapterTitle}
                                                    </p>
                                                )}
                                            </>
                                        ) : (
                                            <p className="mt-2 text-sm text-muted-foreground">
                                                You are at the end of this course.
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Link href={`/learn/${continueCard.courseId}/${continueCard.lessonId}`}>
                                        <Button size="sm">
                                            Continue lesson
                                        </Button>
                                    </Link>
                                    <Link href={`/courses/${continueCard.courseSlug ?? continueCard.courseId}`}>
                                        <Button size="sm" variant="outline">
                                            Open course home
                                        </Button>
                                    </Link>
                                    {continueCard.nextLesson && (
                                        <Link href={`/learn/${continueCard.courseId}/${continueCard.nextLesson.id}`}>
                                            <Button size="sm" variant="ghost">
                                                Go to next lesson
                                            </Button>
                                        </Link>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-border bg-secondary/30 p-5 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <p className="font-medium">No recent lesson found</p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Start from your enrolled courses or explore available learning content.
                                    </p>
                                </div>
                                <Link href="/courses">
                                    <Button size="sm" variant="outline">Browse courses</Button>
                                </Link>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-3">
                    <Link href="/progress#enrolled-courses" className="block">
                        <Card className="transition-transform duration-200 hover:translate-y-[-2px]">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-semibold">Enrolled Courses</CardTitle>
                                <BookOpen className="h-4 w-4 text-primary" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-semibold tracking-[-0.04em]">{enrolledCourseCount}</div>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Open your enrolled course list.
                                </p>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link href="/rewards" className="block">
                        <Card className="transition-transform duration-200 hover:translate-y-[-2px]">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-semibold">Badges Unlocked</CardTitle>
                                <Medal className="h-4 w-4 text-primary" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-semibold tracking-[-0.04em]">
                                    {rewardsOverview?.summary.totalBadges ?? 0}
                                </div>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Milestones unlocked through consistent stars earned in training series.
                                </p>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link href="/certificates" className="block">
                        <Card className="transition-transform duration-200 hover:translate-y-[-2px]">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-semibold">Certificates</CardTitle>
                                <Award className="h-4 w-4 text-primary" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-semibold tracking-[-0.04em] text-emerald-700">
                                    {rewardsOverview?.summary.certificatesEarned ?? 0}
                                </div>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Formal achievements issued separately from day-to-day practice rewards.
                                </p>
                            </CardContent>
                        </Card>
                    </Link>
                </div>

                <Card>
                    <CardHeader className="flex flex-col gap-3 pb-3 md:flex-row md:items-start md:justify-between">
                        <div>
                            <CardTitle className="text-xl">Rewards progression</CardTitle>
                            <CardDescription>
                                Stars advance domain badge ladders, while certificates remain a formal outcome.
                            </CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Link href="/rewards">
                                <Button variant="outline" size="sm">Open rewards</Button>
                            </Link>
                            <Link href="/training">
                                <Button variant="outline" size="sm">Training queue</Button>
                            </Link>
                        </div>
                    </CardHeader>
                    <CardContent className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                        <div className="rounded-2xl border border-slate-200/70 bg-slate-50 p-4">
                            <div className="flex items-center gap-2">
                                <Star className="h-4 w-4 text-[#006688]" />
                                <p className="text-sm font-semibold text-slate-900">Next domain badge</p>
                            </div>
                            {rewardsOverview?.nextBadge ? (
                                <>
                                    <p className="mt-3 text-lg font-semibold tracking-[-0.03em]">
                                        {rewardsOverview.nextBadge.name}
                                    </p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {rewardsOverview.nextBadge.domain.name} · {rewardsOverview.nextBadge.remainingStars} more star{rewardsOverview.nextBadge.remainingStars === 1 ? '' : 's'} needed.
                                    </p>
                                </>
                            ) : (
                                <p className="mt-3 text-sm text-muted-foreground">
                                    No further domain milestone is currently configured.
                                </p>
                            )}
                        </div>
                        <div className="rounded-2xl border border-slate-200/70 bg-slate-50 p-4">
                            <p className="text-sm font-semibold text-slate-900">Strongest domain</p>
                            {rewardsOverview?.domainProgressions?.[0] ? (
                                <>
                                    <p className="mt-3 text-lg font-semibold tracking-[-0.03em]">
                                        {rewardsOverview.domainProgressions[0].domain.name}
                                    </p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {rewardsOverview.domainProgressions[0].currentBadge
                                            ? `Current level: ${rewardsOverview.domainProgressions[0].currentBadge.name}`
                                            : 'No domain badge unlocked yet'}
                                    </p>
                                    {rewardsOverview.domainProgressions[0].nextBadge ? (
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            Next: {rewardsOverview.domainProgressions[0].nextBadge.name} · {rewardsOverview.domainProgressions[0].nextBadge.remainingStars} stars to go
                                        </p>
                                    ) : (
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            Top badge reached in this domain.
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="mt-3 text-sm text-muted-foreground">
                                    Earn stars from assigned training to begin domain badge progression.
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <div>
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-semibold tracking-[-0.04em]">Available courses</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Browse current learning tracks and assigned programs.
                            </p>
                        </div>
                        <Link href="/courses">
                            <Button variant="ghost" size="sm">
                                View all
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-3">
                        {courses.map(course => (
                            <Card key={course.id} className="overflow-hidden transition-transform duration-200 hover:translate-y-[-2px]">
                                <div className="relative aspect-video overflow-hidden rounded-t-[1.25rem] bg-slate-100">
                                    <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(15,23,42,0.22))]" />
                                    <img
                                        src={
                                            course.thumbnail ||
                                            'https://placehold.co/800x450/0f172a/ffffff?text=Course'
                                        }
                                        alt={course.title}
                                        className="h-full w-full object-cover"
                                    />
                                </div>
                                <CardHeader className="space-y-3">
                                    <Badge variant="outline" className="w-fit">
                                        {course.category}
                                    </Badge>
                                    <CardTitle className="line-clamp-2 text-lg">{course.title}</CardTitle>
                                    <CardDescription className="line-clamp-2">
                                        {course.description}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                                        <span>
                                            {Math.floor(course.duration / 3600)}h {Math.floor((course.duration % 3600) / 60)}m
                                        </span>
                                        <span className="font-semibold text-foreground">⭐ {course.rating}</span>
                                    </div>
                                    <Link href={`/courses/${course.slug || course.id}`}>
                                        <Button variant="outline" className="w-full justify-between">
                                            View course
                                            <ArrowRight className="h-4 w-4" />
                                        </Button>
                                    </Link>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
