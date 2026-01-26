import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Course } from '@/types'
import { Clock, Users, Star } from 'lucide-react'

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
    const duration = `${Math.floor(course.duration / 3600)}h ${Math.floor((course.duration % 3600) / 60)}m`
    const levelLabel = formatLevelLabel(course.level)
    const defaultThumbnail = 'https://placehold.co/800x450/0f172a/ffffff?text=Course'

    return (
        <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
            <div className="aspect-video relative overflow-hidden">
                <img
                    src={course.thumbnail || defaultThumbnail}
                    alt={course.title}
                    className="object-cover w-full h-full hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-2 right-2">
                    <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm">
                        {levelLabel}
                    </Badge>
                </div>
            </div>

            <CardHeader>
                <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline">{course.category}</Badge>
                    <div className="flex items-center text-sm">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 mr-1" />
                        <span className="font-medium">{course.rating}</span>
                    </div>
                </div>
                <CardTitle className="text-xl line-clamp-2 mt-2">{course.title}</CardTitle>
                <CardDescription className="line-clamp-2">{course.description}</CardDescription>
            </CardHeader>

            <CardContent>
                <div className="space-y-4">
                    {/* Instructor */}
                    {course.instructor && (
                        <div className="flex items-center space-x-2">
                            {course.instructor.avatar ? (
                                <img
                                    src={course.instructor.avatar}
                                    alt={course.instructor.name}
                                    className="h-8 w-8 rounded-full object-cover"
                                />
                            ) : (
                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">
                                    {course.instructor.name?.charAt(0) || '?'}
                                </div>
                            )}
                            <div>
                                <p className="text-sm font-medium">{course.instructor.name}</p>
                                {course.instructor.title && (
                                    <p className="text-xs text-muted-foreground">{course.instructor.title}</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Course Info */}
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            <span>{duration}</span>
                        </div>
                        <div className="flex items-center">
                            <Users className="h-4 w-4 mr-1" />
                            <span>{course.enrolledCount.toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    {showProgress && progress !== undefined && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Progress</span>
                                <span className="font-medium">{progress}%</span>
                            </div>
                            <Progress value={progress} />
                        </div>
                    )}

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1">
                        {course.tags.slice(0, 3).map(tag => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                            </Badge>
                        ))}
                    </div>

                    {/* Action Button */}
                    <div className="space-y-2">
                        <Link href={`/courses/${course.slug || course.id}`} className="block">
                            <Button className="w-full" variant={showProgress ? "default" : "outline"}>
                                {showProgress ? 'Continue Learning' : 'View Course'}
                            </Button>
                        </Link>
                        {actions}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
