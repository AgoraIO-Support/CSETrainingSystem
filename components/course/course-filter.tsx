'use client'

import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, Filter, X } from 'lucide-react'
import type { CourseLevel } from '@/types'

interface CourseFilterProps {
    searchQuery: string
    onSearch: (query: string) => void
    onFilterCategory: (category: string | null) => void
    selectedCategory: string | null
    categories?: string[]
    selectedLevel: CourseLevel | null
    onFilterLevel: (level: CourseLevel | null) => void
}

const defaultCategories = ['All', 'SDK Integration', 'Video Solutions', 'Recording', 'Messaging', 'Advanced']
const levelOptions: Array<{ label: string; value: CourseLevel | null }> = [
    { label: 'All Levels', value: null },
    { label: 'Beginner', value: 'BEGINNER' },
    { label: 'Intermediate', value: 'INTERMEDIATE' },
    { label: 'Advanced', value: 'ADVANCED' },
]

export function CourseFilter({
    searchQuery,
    onSearch,
    onFilterCategory,
    selectedCategory,
    categories = defaultCategories,
    selectedLevel,
    onFilterLevel,
}: CourseFilterProps) {
    const handleSearch = (value: string) => onSearch(value)

    const handleCategoryClick = (category: string) => {
        const newCategory = category === 'All' ? null : category
        onFilterCategory(newCategory === selectedCategory ? null : newCategory)
    }

    const handleLevelClick = (level: CourseLevel | null) => {
        onFilterLevel(level === selectedLevel ? null : level)
    }

    const safeCategories = categories?.length ? categories : defaultCategories
    const normalizedCategories = safeCategories.includes('All') ? safeCategories : ['All', ...safeCategories]

    return (
        <div className="rounded-2xl bg-[#edeeef] p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    placeholder="Search courses by title, instructor, or keywords..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="h-12 border-slate-200/70 bg-white pl-10 pr-10"
                />
                {searchQuery && (
                    <button
                        type="button"
                        onClick={() => handleSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear search"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>
                <div className="flex gap-2">
                    <button className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-slate-50">
                        <Filter className="h-4 w-4" />
                        <span>Filters</span>
                    </button>
                </div>
            </div>

            <div className="mt-4 space-y-4">
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Category:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {normalizedCategories.map(category => {
                            const normalized = category === 'All' ? null : category
                            const active = selectedCategory === normalized
                            return (
                                <button
                                    key={category}
                                    type="button"
                                    onClick={() => handleCategoryClick(category)}
                                    aria-pressed={active}
                                >
                                    <Badge
                                        variant={active ? 'default' : 'outline'}
                                        className="cursor-pointer"
                                    >
                                        {category}
                                    </Badge>
                                </button>
                            )
                        })}
                    </div>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Level:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {levelOptions.map(option => (
                            <button
                                key={option.label}
                                type="button"
                                onClick={() => handleLevelClick(option.value)}
                                aria-pressed={selectedLevel === option.value}
                            >
                                <Badge
                                    variant={selectedLevel === option.value ? 'default' : 'outline'}
                                    className="cursor-pointer"
                                >
                                    {option.label}
                                </Badge>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
