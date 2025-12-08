'use client'

import { use } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Trophy, CheckCircle, XCircle, Award, Home, RotateCcw } from 'lucide-react'

export default function QuizResultPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const searchParams = useSearchParams()
    const score = parseInt(searchParams.get('score') || '0')
    const correct = parseInt(searchParams.get('correct') || '0')
    const total = parseInt(searchParams.get('total') || '0')

    const passingScore = 70
    const passed = score >= passingScore
    const incorrect = total - correct

    return (
        <DashboardLayout>
            <div className="max-w-3xl mx-auto space-y-6">
                {/* Result Header */}
                <Card className={passed ? 'border-green-500' : 'border-red-500'}>
                    <CardContent className="p-8 text-center">
                        <div className="flex justify-center mb-4">
                            {passed ? (
                                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
                                    <Trophy className="h-10 w-10 text-green-600 dark:text-green-400" />
                                </div>
                            ) : (
                                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
                                    <XCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
                                </div>
                            )}
                        </div>

                        <h1 className="text-3xl font-bold mb-2">
                            {passed ? 'Congratulations! 🎉' : 'Keep Learning!'}
                        </h1>
                        <p className="text-muted-foreground mb-6">
                            {passed
                                ? 'You passed the quiz! Great job on completing this assessment.'
                                : `You need ${passingScore}% to pass. Review the material and try again.`}
                        </p>

                        <div className="inline-block">
                            <div className="text-6xl font-bold mb-2">{score}%</div>
                            <Badge variant={passed ? 'default' : 'destructive'} className="text-lg px-4 py-1">
                                {passed ? 'Passed' : 'Failed'}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                {/* Score Breakdown */}
                <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg flex items-center">
                                <CheckCircle className="h-5 w-5  mr-2 text-green-500" />
                                Correct Answers
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-bold text-green-600 dark:text-green-400">
                                {correct}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                                out of {total} questions
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg flex items-center">
                                <XCircle className="h-5 w-5 mr-2 text-red-500" />
                                Incorrect Answers
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-bold text-red-600 dark:text-red-400">
                                {incorrect}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                                out of {total} questions
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Progress Bar */}
                <Card>
                    <CardContent className="p-6">
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Your Score</span>
                                <span className="font-medium">{score}%</span>
                            </div>
                            <Progress value={score} className="h-3" />
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>0%</span>
                                <span>Passing: {passingScore}%</span>
                                <span>100%</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Certificate */}
                {passed && (
                    <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950/20 dark:to-orange-950/20 border-yellow-200 dark:border-yellow-800">
                        <CardContent className="p-6">
                            <div className="flex items-start space-x-4">
                                <Award className="h-12 w-12 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                                <div className="flex-1">
                                    <h3 className="font-semibold text-lg mb-2">Certificate Available</h3>
                                    <p className="text-sm text-muted-foreground mb-4">
                                        You've earned a certificate of completion for this course!
                                    </p>
                                    <Button variant="outline" className="border-yellow-600 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-950/30">
                                        Download Certificate
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Actions */}
                <div className="flex items-center justify-center space-x-4">
                    <Link href="/">
                        <Button variant="outline">
                            <Home className="h-4 w-4 mr-2" />
                            Back to Dashboard
                        </Button>
                    </Link>
                    {!passed && (
                        <Link href={`/quiz/${id}`}>
                            <Button>
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Retry Quiz
                            </Button>
                        </Link>
                    )}
                </div>
            </div>
        </DashboardLayout>
    )
}
