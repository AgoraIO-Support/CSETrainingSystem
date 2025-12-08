'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, Filter, X } from 'lucide-react'

interface CourseFilterProps {
    onSearch: (query: string) => void
    onFilterCategory: (category: string | null) => void
    selectedCategory: string | null
    categories?: string[]
}

const defaultCategories = ['All', 'SDK Integration', 'Video Solutions', 'Recording', 'Messaging', 'Advanced']
const levels = ['All Levels', 'Beginner', 'Intermediate', 'Advanced']

export function CourseFilter({ onSearch, onFilterCategory, selectedCategory, categories = defaultCategories }: CourseFilterProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedLevel, setSelectedLevel] = useState('All Levels')

    const handleSearch = (value: string) => {
        setSearchQuery(value)
        onSearch(value)
    }

    const handleCategoryClick = (category: string) => {
        const newCategory = category === 'All' ? null : category
        onFilterCategory(newCategory)
    }

    return (
        <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    placeholder="Search courses by title, instructor, or keywords..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="pl-10 pr-10"
                />
                {searchQuery && (
                    <button
                        onClick={() => handleSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Category:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {categories.map(category => (
                        <Badge
                            key={category}
                            variant={selectedCategory === (category === 'All' ? null : category) ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => handleCategoryClick(category)}
                        >
                            {category}
                        </Badge>
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Level:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {levels.map(level => (
                        <Badge
                            key={level}
                            variant={selectedLevel === level ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => setSelectedLevel(level)}
                        >
                            {level}
                        </Badge>
                    ))}
                </div>
            </div>
        </div>
    )
}
