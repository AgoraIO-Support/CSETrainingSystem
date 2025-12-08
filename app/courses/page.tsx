'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { CourseCard } from '@/components/course/course-card'
import { CourseFilter } from '@/components/course/course-filter'
import { BookOpen, Loader2 } from 'lucide-react'
import { ApiClient } from '@/lib/api-client'
import type { Course } from '@/types'

export default function CoursesPage() {
    const [courses, setCourses] = useState<Course[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        const loadCourses = async () => {
            setLoading(true)
            setError(null)
            try {
                const response = await ApiClient.getCourses()
                if (!cancelled) {
                    setCourses(response.data.courses)
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

    const availableCategories = useMemo(() => {
        const set = new Set<string>()
        courses.forEach(course => course.category && set.add(course.category))
        return ['All', ...Array.from(set)]
    }, [courses])

    const filteredCourses = useMemo(() => {
        const query = searchQuery.toLowerCase().trim()

        return courses.filter(course => {
            const matchesSearch =
                !query ||
                course.title.toLowerCase().includes(query) ||
                course.description.toLowerCase().includes(query) ||
                course.instructor?.name?.toLowerCase().includes(query) ||
                course.tags?.some(tag => tag.toLowerCase().includes(query))

            const matchesCategory = !selectedCategory || course.category === selectedCategory

            return matchesSearch && matchesCategory
        })
    }, [courses, searchQuery, selectedCategory])

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div>
                    <div className="flex items-center space-x-3 mb-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                            <BookOpen className="h-6 w-6" />
                        </div>
                        <h1 className="text-3xl font-bold">Course Library</h1>
                    </div>
                    <p className="text-muted-foreground text-lg">
                        Explore our comprehensive collection of training courses
                    </p>
                </div>

                <CourseFilter
                    onSearch={setSearchQuery}
                    onFilterCategory={setSelectedCategory}
                    selectedCategory={selectedCategory}
                    categories={availableCategories}
                />

                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        {loading ? 'Loading courses...' : `Showing ${filteredCourses.length} ${filteredCourses.length === 1 ? 'course' : 'courses'}`}
                    </p>
                </div>

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
                                setError(null)
                                setLoading(true)
                                ApiClient.getCourses()
                                    .then(res => setCourses(res.data.courses))
                                    .catch(err => setError(err instanceof Error ? err.message : 'Failed to load courses'))
                                    .finally(() => setLoading(false))
                            }}
                            className="text-sm text-primary underline"
                        >
                            Retry
                        </button>
                    </div>
                ) : filteredCourses.length > 0 ? (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {filteredCourses.map(course => (
                            <CourseCard
                                key={course.id}
                                course={course}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No courses found</h3>
                        <p className="text-muted-foreground">
                            Try adjusting your search or filters to find what you're looking for
                        </p>
                    </div>
                )}
            </div>
        </DashboardLayout>
    )
}
