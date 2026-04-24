import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Course } from '@/types'
import { ArrowUpRight, Clock3, Users, Star } from 'lucide-react'

interface CourseCardProps {
    course: Course
    progress?: number
    showProgress?: boolean
    actions?: React.ReactNode
}

const formatLevelLabel = (level?: string) => {
    if (!level) return 'All Levels'
    return level
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/(^|\s)\S/g, (c) => c.toUpperCase())
}

export function CourseCard({ course, progress, showProgress = false, actions }: CourseCardProps) {
    const totalMinutes = Math.round(course.duration / 60)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    const duration = hours <= 0 ? `${minutes}m` : minutes <= 0 ? `${hours}h` : `${hours}h ${minutes}m`
    const levelLabel = formatLevelLabel(course.level)
    const visibleTags = course.tags.slice(0, 2)
    const extraTagCount = Math.max(course.tags.length - visibleTags.length, 0)

    return (
        <Card className="group relative overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white/95 transition-all duration-300 hover:-translate-y-1 hover:border-[#00c2ff]/20 hover:shadow-xl hover:shadow-[#006688]/8">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,#006688_0%,#00c2ff_45%,rgba(0,194,255,0)_100%)]" />
            <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="border-slate-200/80 bg-white text-[10px] uppercase tracking-[0.18em] text-slate-700">
                            {course.category}
                        </Badge>
                        <Badge variant="secondary" className="bg-slate-100 text-[10px] uppercase tracking-[0.18em] text-slate-700">
                            {levelLabel}
                        </Badge>
                    </div>
                    <div className="flex items-center rounded-full border border-amber-200/70 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                        <Star className="mr-1.5 h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        <span className="font-medium">{course.rating}</span>
                    </div>
                </div>

                <div className="mt-4">
                    <h3 className="line-clamp-2 text-[1.18rem] font-semibold leading-[1.22] tracking-[-0.045em] text-slate-950 transition-colors duration-300 group-hover:text-[#006688]">
                        {course.title}
                    </h3>
                </div>

                {course.instructor && (
                    <div className="mt-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-3 py-3">
                        <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8 ring-2 ring-white">
                                <AvatarImage src={course.instructor.avatar || undefined} alt={course.instructor.name} />
                                <AvatarFallback className="bg-[#d8eff9] text-[11px] font-semibold text-[#006688]">
                                    {course.instructor.name?.charAt(0) || '?'}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-800">{course.instructor.name}</p>
                                {course.instructor.title ? (
                                    <p className="truncate text-xs text-slate-500">{course.instructor.title}</p>
                                ) : null}
                            </div>
                        </div>
                    </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1.5">
                        <Clock3 className="mr-1.5 h-3.5 w-3.5 text-slate-400" />
                        {duration}
                    </div>
                    <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1.5">
                        <Users className="mr-1.5 h-3.5 w-3.5 text-slate-400" />
                        {course.enrolledCount.toLocaleString()}
                    </div>
                </div>

                {showProgress && progress !== undefined && (
                    <div className="mt-4 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Progress</span>
                            <span className="font-medium text-slate-800">{progress}%</span>
                        </div>
                        <Progress value={progress} />
                    </div>
                )}

                <div className="mt-4 flex flex-wrap gap-1.5">
                    {visibleTags.map(tag => (
                        <Badge key={tag} variant="secondary" className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-600">
                            {tag}
                        </Badge>
                    ))}
                    {extraTagCount > 0 ? (
                        <Badge variant="secondary" className="rounded-full bg-[#e8f7fc] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[#006688]">
                            +{extraTagCount}
                        </Badge>
                    ) : null}
                </div>

                <div className="mt-5 space-y-2">
                    <Link href={`/courses/${course.slug || course.id}`} className="block">
                        <Button
                            className="h-10 w-full rounded-xl border-slate-200 bg-white text-slate-900 shadow-none transition-all duration-300 hover:border-[#00c2ff]/30 hover:bg-[#f2fbff] hover:text-[#006688]"
                            variant={showProgress ? 'default' : 'outline'}
                        >
                            {showProgress ? 'Continue Learning' : 'View Course'}
                            <ArrowUpRight className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                    {actions}
                </div>
            </CardContent>
        </Card>
    )
}
