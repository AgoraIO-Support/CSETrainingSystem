import { mockCourses, mockCurrentUser, mockQuizzes } from './mock-data'
import { Course, User, Quiz, QuizResult } from '@/types'

// Simulate API delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function getCourses(): Promise<Course[]> {
    await delay(500)
    return mockCourses
}

export async function getCourseById(id: string): Promise<Course | undefined> {
    await delay(300)
    return mockCourses.find(course => course.id === id)
}

export async function getCoursesByCategory(category: string): Promise<Course[]> {
    await delay(400)
    return mockCourses.filter(course => course.category === category)
}

export async function getUserProfile(): Promise<User> {
    await delay(200)
    return mockCurrentUser
}

export async function getQuizByCourseId(courseId: string): Promise<Quiz | undefined> {
    await delay(300)
    return mockQuizzes.find(quiz => quiz.courseId === courseId)
}

export async function submitQuiz(
    quizId: string,
    answers: Record<string, string | number>
): Promise<QuizResult> {
    await delay(500)

    const quiz = mockQuizzes.find(q => q.id === quizId)
    if (!quiz) {
        throw new Error('Quiz not found')
    }

    let correctCount = 0
    quiz.questions.forEach(question => {
        if (answers[question.id] === question.correctAnswer) {
            correctCount++
        }
    })

    const score = Math.round((correctCount / quiz.questions.length) * 100)
    const passed = score >= quiz.passingScore

    return {
        id: `result-${Date.now()}`,
        quizId,
        userId: mockCurrentUser.id,
        score,
        totalQuestions: quiz.questions.length,
        answers,
        completedAt: new Date(),
        passed,
    }
}

export async function enrollCourse(courseId: string): Promise<void> {
    await delay(300)
    // In a real app, this would make a POST request
    console.log(`Enrolled in course ${courseId}`)
}

export async function updateProgress(
    courseId: string,
    lessonId: string,
    progress: number
): Promise<void> {
    await delay(200)
    console.log(`Updated progress for course ${courseId}, lesson ${lessonId}: ${progress}%`)
}
