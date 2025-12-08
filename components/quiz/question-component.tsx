'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Question } from '@/types'
import { cn } from '@/lib/utils'
import { CheckCircle, Circle } from 'lucide-react'

interface QuizQuestionProps {
    question: Question
    questionNumber: number
    totalQuestions: number
    selectedAnswer?: string | number
    onAnswerSelect: (answer: string | number) => void
    showExplanation?: boolean
    isCorrect?: boolean
}

export function QuizQuestion({
    question,
    questionNumber,
    totalQuestions,
    selectedAnswer,
    onAnswerSelect,
    showExplanation = false,
    isCorrect,
}: QuizQuestionProps) {
    return (
        <Card>
            <CardContent className="p-6">
                <div className="space-y-6">
                    {/* Question Header */}
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-3">
                                <Badge variant="outline">
                                    Question {questionNumber} of {totalQuestions}
                                </Badge>
                                <Badge variant="secondary">
                                    {question.type === 'multiple-choice'
                                        ? 'Multiple Choice'
                                        : question.type === 'true-false'
                                            ? 'True/False'
                                            : 'Fill in the Blank'}
                                </Badge>
                            </div>
                            <h3 className="text-xl font-semibold">{question.question}</h3>
                        </div>
                        {showExplanation && (
                            <div className="ml-4">
                                {isCorrect ? (
                                    <CheckCircle className="h-8 w-8 text-green-500" />
                                ) : (
                                    <Circle className="h-8 w-8 text-red-500" />
                                )}
                            </div>
                        )}
                    </div>

                    {/* Answer Options */}
                    {question.type === 'multiple-choice' || question.type === 'true-false' ? (
                        <div className="space-y-3">
                            {question.options?.map((option, index) => {
                                const isSelected = selectedAnswer === index
                                const isThisCorrect = question.correctAnswer === index
                                const showCorrectAnswer = showExplanation

                                return (
                                    <button
                                        key={index}
                                        onClick={() => !showExplanation && onAnswerSelect(index)}
                                        disabled={showExplanation}
                                        className={cn(
                                            'w-full p-4 rounded-lg border-2 text-left transition-all',
                                            'hover:border-primary hover:bg-accent',
                                            isSelected && !showExplanation && 'border-primary bg-primary/5',
                                            showCorrectAnswer && isThisCorrect && 'border-green-500 bg-green-50 dark:bg-green-950/30',
                                            showCorrectAnswer && isSelected && !isThisCorrect && 'border-red-500 bg-red-50 dark:bg-red-950/30',
                                            showExplanation && 'cursor-not-allowed'
                                        )}
                                    >
                                        <div className="flex items-center space-x-3">
                                            <div
                                                className={cn(
                                                    'flex h-6 w-6 items-center justify-center rounded-full border-2',
                                                    isSelected && !showExplanation && 'border-primary bg-primary',
                                                    showCorrectAnswer && isThisCorrect && 'border-green-500 bg-green-500',
                                                    showCorrectAnswer && isSelected && !isThisCorrect && 'border-red-500 bg-red-500'
                                                )}
                                            >
                                                {(isSelected || (showCorrectAnswer && isThisCorrect)) && (
                                                    <div className="h-2 w-2  rounded-full bg-white" />
                                                )}
                                            </div>
                                            <span className={cn(
                                                'flex-1',
                                                showCorrectAnswer && isThisCorrect && 'font-semibold text-green-700 dark:text-green-400',
                                                showCorrectAnswer && isSelected && !isThisCorrect && 'text-red-700 dark:text-red-400'
                                            )}>
                                                {option}
                                            </span>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <Input
                                placeholder="Type your answer here..."
                                value={selectedAnswer as string || ''}
                                onChange={(e) => !showExplanation && onAnswerSelect(e.target.value)}
                                disabled={showExplanation}
                                className={cn(
                                    showExplanation && isCorrect && 'border-green-500',
                                    showExplanation && !isCorrect && 'border-red-500'
                                )}
                            />
                            {showExplanation && (
                                <p className="text-sm text-muted-foreground">
                                    Correct answer: <span className="font-semibold text-green-600">{question.correctAnswer}</span>
                                </p>
                            )}
                        </div>
                    )}

                    {/* Explanation */}
                    {showExplanation && question.explanation && (
                        <div className="mt-6 p-4 rounded-lg bg-muted">
                            <p className="text-sm font-semibold mb-2">Explanation:</p>
                            <p className="text-sm text-muted-foreground">{question.explanation}</p>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
