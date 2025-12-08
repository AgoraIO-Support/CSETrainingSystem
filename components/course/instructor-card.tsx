import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Instructor } from '@/types'
import { Award } from 'lucide-react'

interface InstructorCardProps {
    instructor: Instructor
}

export function InstructorCard({ instructor }: InstructorCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Instructor</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-start space-x-4">
                    <Avatar className="h-16 w-16">
                        <AvatarImage src={instructor.avatar} alt={instructor.name} />
                        <AvatarFallback>{instructor.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                        <h4 className="font-semibold text-lg">{instructor.name}</h4>
                        <p className="text-sm text-muted-foreground flex items-center mt-1">
                            <Award className="h-4 w-4 mr-1" />
                            {instructor.title}
                        </p>
                        <p className="text-sm mt-3">{instructor.bio}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
