'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { QuizQuestion } from '@/components/quiz/question-component'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { mockQuizzes, mockCurrentUser } from '@/lib/mock-data'
import { Clock, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'

export default function QuizPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const quiz = mockQuizzes.find(q => q.id === id)

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
    const [answers, setAnswers] = useState<Record<string, string | number>>({})
    const [timeRemaining, setTimeRemaining] = useState(quiz?.timeLimit || 1800)
    const [isSubmitted, setIsSubmitted] = useState(false)

    useEffect(() => {
        if (quiz?.timeLimit && !isSubmitted) {
            const timer = setInterval(() => {
                setTimeRemaining(prev => {
                    if (prev <= 1) {
                        handleSubmit()
                        return 0
                    }
                    return prev - 1
                })
            }, 1000)

            return () => clearInterval(timer)
        }
    }, [quiz, isSubmitted])

    if (!quiz) {
        return (
            <DashboardLayout>
                <div className="text-center py-12">
                    <h1 className="text-2xl font-bold">Quiz not found</h1>
                </div>
            </DashboardLayout>
        )
    }

    const currentQuestion = quiz.questions[currentQuestionIndex]
    const progress = ((currentQuestionIndex + 1) / quiz.questions.length) * 100
    const answeredCount = Object.keys(answers).length

    const handleAnswerSelect = (answer: string | number) => {
        setAnswers(prev => ({
            ...prev,
            [currentQuestion.id]: answer,
        }))
    }

    const handleNext = () => {
        if (currentQuestionIndex < quiz.questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1)
        }
    }

    const handlePrevious = () => {
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(prev => prev - 1)
        }
    }

    const handleSubmit = () => {
        // Calculate score
        let correct = 0
        quiz.questions.forEach(q => {
            if (answers[q.id] === q.correctAnswer) {
                correct++
            }
        })
        const score = Math.round((correct / quiz.questions.length) * 100)

        // Navigate to results page
        router.push(`/quiz/${quiz.id}/result?score=${score}&correct=${correct}&total=${quiz.questions.length}`)
    }

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    return (
        <DashboardLayout>
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Quiz Header */}
                <div>
                    <h1 className="text-3xl font-bold mb-2">{quiz.title}</h1>
                    <p className="text-muted-foreground">
                        Answer all questions to complete the quiz. Passing score: {quiz.passingScore}%
                    </p>
                </div>

                {/* Quiz Stats */}
                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center space-x-3">
                                <Clock className="h-5 w-5 text-muted-foreground" />
                                <div>
                                    <p className="text-sm text-muted-foreground">Time Remaining</p>
                                    <p className="text-2xl font-bold">{formatTime(timeRemaining)}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center space-x-3">
                                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                                <div>
                                    <p className="text-sm text-muted-foreground">Questions</p>
                                    <p className="text-2xl font-bold">
                                        {currentQuestionIndex + 1} / {quiz.questions.length}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4">
                            <div>
                                <p className="text-sm text-muted-foreground mb-2">Progress</p>
                                <Progress value={progress} className="h-2" />
                                <p className="text-sm font-medium mt-2">{Math.round(progress)}%</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Question Navigation */}
                <Card>
                    <CardContent className="p-4">
                        <div className="flex flex-wrap gap-2">
                            {quiz.questions.map((q, index) => (
                                <Button
                                    key={q.id}
                                    variant={currentQuestionIndex === index ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setCurrentQuestionIndex(index)}
                                    className="w-12 h-12 p-0"
                                >
                                    {index + 1}
                                    {answers[q.id] !== undefined && (
                                        <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500" />
                                    )}
                                </Button>
                            ))}
                        </div>
                        <p className="text-sm text-muted-foreground mt-3">
                            {answeredCount} of {quiz.questions.length} questions answered
                        </p>
                    </CardContent>
                </Card>

                {/* Current Question */}
                <QuizQuestion
                    question={currentQuestion}
                    questionNumber={currentQuestionIndex + 1}
                    totalQuestions={quiz.questions.length}
                    selectedAnswer={answers[currentQuestion.id]}
                    onAnswerSelect={handleAnswerSelect}
                />

                {/* Navigation Buttons */}
                <div className="flex items-center justify-between">
                    <Button
                        variant="outline"
                        onClick={handlePrevious}
                        disabled={currentQuestionIndex === 0}
                    >
                        <ChevronLeft className="h-4 w-4 mr-2" />
                        Previous
                    </Button>

                    <div className="flex space-x-2">
                        {currentQuestionIndex < quiz.questions.length - 1 ? (
                            <Button onClick={handleNext}>
                                Next
                                <ChevronRight className="h-4 w-4 ml-2" />
                            </Button>
                        ) : (
                            <Button
                                onClick={handleSubmit}
                                disabled={answeredCount < quiz.questions.length}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                Submit Quiz
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
