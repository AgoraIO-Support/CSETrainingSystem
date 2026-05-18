'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar, ChevronDown, Filter, Search, X } from 'lucide-react'
import type { CourseLevel } from '@/types'

export type CourseCreatedFilter = 'ALL' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'CUSTOM_CREATED'

interface CourseFilterProps {
    searchQuery: string
    onSearch: (query: string) => void
    selectedCategory: string | null
    onFilterCategory: (category: string | null) => void
    categories?: string[]
    selectedLabel: string | null
    onFilterLabel: (label: string | null) => void
    labels?: string[]
    selectedInstructorId: string | null
    onFilterInstructor: (instructorId: string | null) => void
    instructors?: Array<{ id: string; name: string; title?: string }>
    selectedLevel: CourseLevel | null
    onFilterLevel: (level: CourseLevel | null) => void
    createdFilter: CourseCreatedFilter
    onFilterCreated: (filter: CourseCreatedFilter) => void
    createdFrom: string
    createdTo: string
    onCreatedFromChange: (value: string) => void
    onCreatedToChange: (value: string) => void
    dateMenuOpen: boolean
    onDateMenuOpenChange: (open: boolean) => void
    hasActiveFilters: boolean
    onClearFilters: () => void
}

const levelOptions: Array<{ label: string; value: CourseLevel | null }> = [
    { label: 'All Levels', value: null },
    { label: 'Beginner', value: 'BEGINNER' },
    { label: 'Intermediate', value: 'INTERMEDIATE' },
    { label: 'Advanced', value: 'ADVANCED' },
]

const createdFilterLabel: Record<CourseCreatedFilter, string> = {
    ALL: 'All created dates',
    LAST_7_DAYS: 'Last 7 days',
    LAST_30_DAYS: 'Last 30 days',
    CUSTOM_CREATED: 'Created range',
}

export function CourseFilter({
    searchQuery,
    onSearch,
    selectedCategory,
    onFilterCategory,
    categories = [],
    selectedLabel,
    onFilterLabel,
    labels = [],
    selectedInstructorId,
    onFilterInstructor,
    instructors = [],
    selectedLevel,
    onFilterLevel,
    createdFilter,
    onFilterCreated,
    createdFrom,
    createdTo,
    onCreatedFromChange,
    onCreatedToChange,
    dateMenuOpen,
    onDateMenuOpenChange,
    hasActiveFilters,
    onClearFilters,
}: CourseFilterProps) {
    const sortedCategories = [...categories].sort((a, b) => a.localeCompare(b))
    const sortedLabels = [...labels].sort((a, b) => a.localeCompare(b))
    const sortedInstructors = [...instructors].sort((a, b) => a.name.localeCompare(b.name))
    const createdLabel =
        createdFilter === 'CUSTOM_CREATED' && (createdFrom || createdTo)
            ? `${createdFrom || 'Any'} -> ${createdTo || 'Any'}`
            : createdFilterLabel[createdFilter]

    const selectTriggerClass = 'h-11 border-slate-200/70 bg-white text-left shadow-sm'
    const fieldLabelClass = 'mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500'

    const handleCreatedFilter = (filter: CourseCreatedFilter) => {
        onFilterCreated(filter)
        if (filter !== 'CUSTOM_CREATED') {
            onDateMenuOpenChange(false)
        }
    }

    const resetCreatedRange = () => {
        onCreatedFromChange('')
        onCreatedToChange('')
        onFilterCreated('ALL')
        onDateMenuOpenChange(false)
    }

    return (
        <div className="rounded-[1.35rem] border border-slate-200/70 bg-[#f3f5f6] p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search courses by title, instructor, or keywords..."
                        value={searchQuery}
                        onChange={(event) => onSearch(event.target.value)}
                        className="h-12 border-slate-200/70 bg-white pl-10 pr-10 shadow-sm"
                    />
                    {searchQuery ? (
                        <button
                            type="button"
                            onClick={() => onSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label="Clear search"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    ) : null}
                </div>
                {hasActiveFilters ? (
                    <Button type="button" variant="outline" className="h-12 bg-white" onClick={onClearFilters}>
                        Clear filters
                    </Button>
                ) : null}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div>
                    <div className={fieldLabelClass}>Category</div>
                    <Select value={selectedCategory ?? 'ALL'} onValueChange={(value) => onFilterCategory(value === 'ALL' ? null : value)}>
                        <SelectTrigger className={selectTriggerClass}>
                            <SelectValue placeholder="All categories" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All categories</SelectItem>
                            {sortedCategories.map((category) => (
                                <SelectItem key={category} value={category}>
                                    {category}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <div className={fieldLabelClass}>Label</div>
                    <Select value={selectedLabel ?? 'ALL'} onValueChange={(value) => onFilterLabel(value === 'ALL' ? null : value)}>
                        <SelectTrigger className={selectTriggerClass}>
                            <div className="flex min-w-0 items-center gap-2">
                                <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <SelectValue placeholder="All labels" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All labels</SelectItem>
                            {sortedLabels.map((label) => (
                                <SelectItem key={label} value={label}>
                                    {label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <div className={fieldLabelClass}>Instructor</div>
                    <Select
                        value={selectedInstructorId ?? 'ALL'}
                        onValueChange={(value) => onFilterInstructor(value === 'ALL' ? null : value)}
                    >
                        <SelectTrigger className={selectTriggerClass}>
                            <SelectValue placeholder="All instructors" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All instructors</SelectItem>
                            {sortedInstructors.map((instructor) => (
                                <SelectItem key={instructor.id} value={instructor.id}>
                                    {instructor.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <div className={fieldLabelClass}>Level</div>
                    <Select value={selectedLevel ?? 'ALL'} onValueChange={(value) => onFilterLevel(value === 'ALL' ? null : (value as CourseLevel))}>
                        <SelectTrigger className={selectTriggerClass}>
                            <SelectValue placeholder="All levels" />
                        </SelectTrigger>
                        <SelectContent>
                            {levelOptions.map((option) => (
                                <SelectItem key={option.label} value={option.value ?? 'ALL'}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="relative">
                    <div className={fieldLabelClass}>Course Created</div>
                    <button
                        type="button"
                        className="flex h-11 w-full items-center justify-between gap-2 rounded-md border border-slate-200/70 bg-white px-3 py-2 text-left text-sm shadow-sm ring-offset-background transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        onClick={() => onDateMenuOpenChange(!dateMenuOpen)}
                    >
                        <span className="flex min-w-0 items-center gap-2">
                            <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">{createdLabel}</span>
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                    </button>
                    {dateMenuOpen ? (
                        <div className="absolute right-0 z-50 mt-2 w-[min(380px,calc(100vw-3rem))] rounded-lg border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
                            <div className="grid gap-1">
                                {(['ALL', 'LAST_7_DAYS', 'LAST_30_DAYS'] as CourseCreatedFilter[]).map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        className={`rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100 ${createdFilter === value ? 'bg-slate-100 font-medium text-[#006688]' : ''}`}
                                        onClick={() => handleCreatedFilter(value)}
                                    >
                                        {createdFilterLabel[value]}
                                    </button>
                                ))}
                            </div>

                            <div className="mt-2 border-t border-slate-200 pt-3">
                                <button
                                    type="button"
                                    className={`mb-3 w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100 ${createdFilter === 'CUSTOM_CREATED' ? 'bg-slate-100 font-medium text-[#006688]' : ''}`}
                                    onClick={() => handleCreatedFilter('CUSTOM_CREATED')}
                                >
                                    Created range
                                </button>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground" htmlFor="courseCreatedFrom">
                                            Created from
                                        </label>
                                        <Input
                                            id="courseCreatedFrom"
                                            type="date"
                                            value={createdFrom}
                                            onChange={(event) => {
                                                onFilterCreated('CUSTOM_CREATED')
                                                onCreatedFromChange(event.target.value)
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground" htmlFor="courseCreatedTo">
                                            Created to
                                        </label>
                                        <Input
                                            id="courseCreatedTo"
                                            type="date"
                                            value={createdTo}
                                            onChange={(event) => {
                                                onFilterCreated('CUSTOM_CREATED')
                                                onCreatedToChange(event.target.value)
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="mt-3 flex justify-end gap-2">
                                    <Button type="button" variant="outline" size="sm" onClick={resetCreatedRange}>
                                        Reset
                                    </Button>
                                    <Button type="button" size="sm" onClick={() => onDateMenuOpenChange(false)}>
                                        Apply
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                    {dateMenuOpen ? (
                        <button
                            type="button"
                            className="fixed inset-0 z-40 cursor-default"
                            aria-label="Close course created filter"
                            tabIndex={-1}
                            onClick={() => onDateMenuOpenChange(false)}
                        />
                    ) : null}
                </div>
            </div>
        </div>
    )
}
