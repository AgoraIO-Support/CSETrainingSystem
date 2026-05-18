'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { CourseCard } from '@/components/course/course-card'
import { CourseFilter, type CourseCreatedFilter } from '@/components/course/course-filter'
import { BookOpen, BarChart3, Loader2 } from 'lucide-react'
import { ApiClient } from '@/lib/api-client'
import type { Course } from '@/types'
import type { AuthUser } from '@/lib/auth-middleware'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { CourseLevel } from '@/types'

export default function CoursesPage() {
    const [courses, setCourses] = useState<Course[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
    const [selectedLabel, setSelectedLabel] = useState<string | null>(null)
    const [selectedInstructorId, setSelectedInstructorId] = useState<string | null>(null)
    const [selectedLevel, setSelectedLevel] = useState<CourseLevel | null>(null)
    const [createdFilter, setCreatedFilter] = useState<CourseCreatedFilter>('ALL')
    const [createdFromFilter, setCreatedFromFilter] = useState('')
    const [createdToFilter, setCreatedToFilter] = useState('')
    const [createdMenuOpen, setCreatedMenuOpen] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [me, setMe] = useState<AuthUser | null>(null)

    const [analyticsOpen, setAnalyticsOpen] = useState(false)
    const [analyticsCourse, setAnalyticsCourse] = useState<Course | null>(null)
    const [analyticsLoading, setAnalyticsLoading] = useState(false)
    const [analyticsError, setAnalyticsError] = useState<string | null>(null)
    const [analyticsData, setAnalyticsData] = useState<Awaited<ReturnType<typeof ApiClient.getAdminCourseAnalytics>>['data'] | null>(null)

    const isAdmin = me?.role === 'ADMIN'

    useEffect(() => {
        let cancelled = false
        const loadCourses = async () => {
            setLoading(true)
            setError(null)

            try {
                const limit = 200
                const firstResponse = await ApiClient.getCourses({ page: 1, limit })
                let allCourses = [...firstResponse.data.courses]

                const totalPages = firstResponse.data.pagination.totalPages
                if (totalPages > 1) {
                    for (let page = 2; page <= totalPages; page += 1) {
                        const response = await ApiClient.getCourses({ page, limit })
                        allCourses = allCourses.concat(response.data.courses)
                        if (cancelled) return
                    }
                }

                if (!cancelled) {
                    setCourses(allCourses)
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load courses')
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadCourses()

        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        ApiClient.getMe()
            .then(res => {
                if (!cancelled) setMe(res.data)
            })
            .catch(() => {
                if (!cancelled) setMe(null)
            })

        return () => {
            cancelled = true
        }
    }, [])

    const openAnalytics = async (course: Course) => {
        if (!isAdmin) return
        setAnalyticsCourse(course)
        setAnalyticsOpen(true)
        setAnalyticsLoading(true)
        setAnalyticsError(null)
        setAnalyticsData(null)

        try {
            const res = await ApiClient.getAdminCourseAnalytics(course.id)
            setAnalyticsData(res.data)
        } catch (err) {
            setAnalyticsError(err instanceof Error ? err.message : 'Failed to load analytics')
        } finally {
            setAnalyticsLoading(false)
        }
    }

    const formatDuration = (seconds: number) => {
        const totalMinutes = Math.round(seconds / 60)
        const hours = Math.floor(totalMinutes / 60)
        const minutes = totalMinutes % 60
        if (hours <= 0) return `${minutes}m`
        if (minutes <= 0) return `${hours}h`
        return `${hours}h ${minutes}m`
    }

    const availableCategories = useMemo(() => {
        const set = new Set<string>()
        courses.forEach(course => course.category && set.add(course.category))
        return Array.from(set)
    }, [courses])

    const availableLabels = useMemo(() => {
        const set = new Set<string>()
        courses.forEach(course => course.tags?.forEach(tag => tag && set.add(tag)))
        return Array.from(set)
    }, [courses])

    const availableInstructors = useMemo(() => {
        const map = new Map<string, { id: string; name: string; title?: string }>()
        courses.forEach((course) => {
            if (course.instructor?.id && course.instructor?.name) {
                map.set(course.instructor.id, {
                    id: course.instructor.id,
                    name: course.instructor.name,
                    title: course.instructor.title,
                })
            }
        })
        return Array.from(map.values())
    }, [courses])

    const handleSearch = (query: string) => {
        setSearchQuery(query)
    }

    const handleFilterCategory = (category: string | null) => {
        setSelectedCategory(category)
    }

    const handleFilterLevel = (level: CourseLevel | null) => {
        setSelectedLevel(level)
    }

    const hasActiveFilters =
        Boolean(searchQuery.trim()) ||
        Boolean(selectedCategory) ||
        Boolean(selectedLabel) ||
        Boolean(selectedInstructorId) ||
        Boolean(selectedLevel) ||
        createdFilter !== 'ALL' ||
        Boolean(createdFromFilter) ||
        Boolean(createdToFilter)

    const clearFilters = () => {
        setSearchQuery('')
        setSelectedCategory(null)
        setSelectedLabel(null)
        setSelectedInstructorId(null)
        setSelectedLevel(null)
        setCreatedFilter('ALL')
        setCreatedFromFilter('')
        setCreatedToFilter('')
        setCreatedMenuOpen(false)
    }

    const filteredCourses = useMemo(() => {
        const query = searchQuery.toLowerCase().trim()
        const isCreatedWithinCustomRange = (createdAt: string | Date | null | undefined) => {
            if (!createdAt) return false
            const createdDate = new Date(createdAt)
            const from = createdFromFilter ? new Date(`${createdFromFilter}T00:00:00`) : null
            const to = createdToFilter ? new Date(`${createdToFilter}T23:59:59.999`) : null

            if (from && createdDate < from) return false
            if (to && createdDate > to) return false
            return true
        }
        const isCreatedWithinDays = (createdAt: string | Date | null | undefined, days: number) => {
            if (!createdAt) return false
            const createdDate = new Date(createdAt)
            const start = new Date()
            start.setDate(start.getDate() - days)
            start.setHours(0, 0, 0, 0)
            return createdDate >= start
        }

        return courses.filter(course => {
            const matchesSearch =
                !query ||
                course.title.toLowerCase().includes(query) ||
                course.description.toLowerCase().includes(query) ||
                course.category.toLowerCase().includes(query) ||
                course.instructor?.name?.toLowerCase().includes(query) ||
                course.tags?.some(tag => tag.toLowerCase().includes(query))

            const matchesCategory = !selectedCategory || course.category === selectedCategory
            const matchesLabel = !selectedLabel || course.tags?.includes(selectedLabel)
            const matchesInstructor = !selectedInstructorId || course.instructor?.id === selectedInstructorId
            const matchesLevel = !selectedLevel || course.level === selectedLevel
            const matchesCreated =
                createdFilter === 'ALL' ||
                (createdFilter === 'LAST_7_DAYS' && isCreatedWithinDays(course.createdAt, 7)) ||
                (createdFilter === 'LAST_30_DAYS' && isCreatedWithinDays(course.createdAt, 30)) ||
                (createdFilter === 'CUSTOM_CREATED' && isCreatedWithinCustomRange(course.createdAt))

            return matchesSearch && matchesCategory && matchesLabel && matchesInstructor && matchesLevel && matchesCreated
        })
    }, [courses, searchQuery, selectedCategory, selectedLabel, selectedInstructorId, selectedLevel, createdFilter, createdFromFilter, createdToFilter])

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="rounded-[1.6rem] border border-slate-200/60 bg-white p-7 shadow-sm">
                    <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#006688_0%,#00c2ff_100%)] text-primary-foreground shadow-lg shadow-[#006688]/15">
                            <BookOpen className="h-6 w-6" />
                        </div>
                        <Badge className="w-fit">Course Library</Badge>
                    </div>
                    <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">Explore course content</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                        Browse structured learning tracks, filter by category or level, and review progress-oriented content in one place.
                    </p>
                </div>

                <CourseFilter
                    searchQuery={searchQuery}
                    onSearch={handleSearch}
                    onFilterCategory={handleFilterCategory}
                    selectedCategory={selectedCategory}
                    categories={availableCategories}
                    selectedLabel={selectedLabel}
                    onFilterLabel={setSelectedLabel}
                    labels={availableLabels}
                    selectedInstructorId={selectedInstructorId}
                    onFilterInstructor={setSelectedInstructorId}
                    instructors={availableInstructors}
                    selectedLevel={selectedLevel}
                    onFilterLevel={handleFilterLevel}
                    createdFilter={createdFilter}
                    onFilterCreated={setCreatedFilter}
                    createdFrom={createdFromFilter}
                    createdTo={createdToFilter}
                    onCreatedFromChange={setCreatedFromFilter}
                    onCreatedToChange={setCreatedToFilter}
                    dateMenuOpen={createdMenuOpen}
                    onDateMenuOpenChange={setCreatedMenuOpen}
                    hasActiveFilters={hasActiveFilters}
                    onClearFilters={clearFilters}
                />

                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        {loading ? 'Loading courses...' : `Showing ${filteredCourses.length} ${filteredCourses.length === 1 ? 'course' : 'courses'}`}
                    </p>
                </div>

                <Dialog
                    open={analyticsOpen}
                    onOpenChange={(open) => {
                        setAnalyticsOpen(open)
                        if (!open) {
                            setAnalyticsCourse(null)
                            setAnalyticsData(null)
                            setAnalyticsError(null)
                            setAnalyticsLoading(false)
                        }
                    }}
                >
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <BarChart3 className="h-5 w-5" />
                                Course analytics
                            </DialogTitle>
                            <DialogDescription>
                                {analyticsCourse ? analyticsCourse.title : '—'}
                            </DialogDescription>
                        </DialogHeader>

                        {analyticsLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                        ) : analyticsError ? (
                            <div className="text-sm text-destructive">{analyticsError}</div>
                        ) : analyticsData ? (
                            <div className="space-y-6">
                                <div className="flex flex-wrap gap-2">
                                    <Badge variant="outline">Enrolled: {analyticsData.enrolledUsers.length}</Badge>
                                    <Badge variant="outline">Active (7d): {analyticsData.activeLearners.d7}</Badge>
                                    <Badge variant="outline">Active (14d): {analyticsData.activeLearners.d14}</Badge>
                                    <Badge variant="outline">Active (30d): {analyticsData.activeLearners.d30}</Badge>
                                    <Badge variant="outline">Completion rate: {analyticsData.completionRate}%</Badge>
                                    <Badge variant="outline">
                                        Avg completion time:{' '}
                                        {analyticsData.averageCompletionTimeSeconds === null
                                            ? '—'
                                            : formatDuration(analyticsData.averageCompletionTimeSeconds)}
                                    </Badge>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-muted-foreground border-b">
                                                <th className="py-3 pr-4 font-medium">User</th>
                                                <th className="py-3 pr-4 font-medium">Status</th>
                                                <th className="py-3 pr-4 font-medium">Progress</th>
                                                <th className="py-3 pr-4 font-medium">Last active</th>
                                                <th className="py-3 font-medium">Enrolled</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {analyticsData.enrolledUsers.map((entry) => (
                                                <tr key={entry.user.id} className="border-b last:border-0">
                                                    <td className="py-3 pr-4">
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">{entry.user.name}</span>
                                                            <span className="text-xs text-muted-foreground">{entry.user.email}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 pr-4">
                                                        <Badge variant={entry.status === 'COMPLETED' ? 'default' : 'secondary'}>
                                                            {entry.status}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-3 pr-4">{Math.round(entry.progress)}%</td>
                                                    <td className="py-3 pr-4">
                                                        {entry.lastAccessedAt ? new Date(entry.lastAccessedAt).toLocaleDateString() : '—'}
                                                    </td>
                                                    <td className="py-3">{new Date(entry.enrolledAt).toLocaleDateString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground">No analytics data.</div>
                        )}
                    </DialogContent>
                </Dialog>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
                        <p className="text-lg font-semibold">Unable to load courses</p>
                        <p className="text-muted-foreground">{error}</p>
                        <button
                            onClick={() => {
                                setSearchQuery('')
                                setSelectedCategory(null)
                                setSelectedLabel(null)
                                setSelectedInstructorId(null)
                                setSelectedLevel(null)
                                setCreatedFilter('ALL')
                                setCreatedFromFilter('')
                                setCreatedToFilter('')
                                setError(null)
                                setLoading(true)

                                const limit = 200
                                ApiClient.getCourses({ page: 1, limit })
                                    .then(async (res) => {
                                        let allCourses = [...res.data.courses]
                                        const totalPages = res.data.pagination.totalPages
                                        if (totalPages > 1) {
                                            for (let page = 2; page <= totalPages; page += 1) {
                                                const pageRes = await ApiClient.getCourses({ page, limit })
                                                allCourses = allCourses.concat(pageRes.data.courses)
                                            }
                                        }
                                        setCourses(allCourses)
                                    })
                                    .catch(err => setError(err instanceof Error ? err.message : 'Failed to load courses'))
                                    .finally(() => setLoading(false))
                            }}
                            className="text-sm text-primary underline"
                        >
                            Retry
                        </button>
                    </div>
                ) : filteredCourses.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                        {filteredCourses.map(course => (
                            <CourseCard
                                key={course.id}
                                course={course}
                                actions={isAdmin ? (
                                    <Button variant="secondary" className="w-full" onClick={() => openAnalytics(course)}>
                                        <BarChart3 className="h-4 w-4 mr-2" />
                                        View analytics
                                    </Button>
                                ) : null}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center rounded-[1.35rem] border border-dashed border-border bg-secondary/35 py-12 text-center">
                        <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No courses found</h3>
                        <p className="text-muted-foreground">
                            Try adjusting your search or filters to find what you&apos;re looking for
                        </p>
                    </div>
                )}
            </div>
        </DashboardLayout>
    )
}
