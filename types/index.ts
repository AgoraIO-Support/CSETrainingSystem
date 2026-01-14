export interface User {
    id: string
    name: string
    email: string
    avatar?: string
    role: 'admin' | 'user' | 'ADMIN' | 'USER'
    enrolledCourses: string[]
    completedCourses: string[]
    progress: Record<string, number>
}

export interface AdminUser {
    id: string
    name: string
    email: string
    avatar?: string | null
    role: 'USER' | 'ADMIN'
    status: 'ACTIVE' | 'SUSPENDED' | 'DELETED'
    department?: string | null
    title?: string | null
    createdAt: string | Date
    lastLoginAt?: string | Date | null
    enrollmentCount: number
    completedCourses: number
}

export interface AdminUserStats {
    totalUsers: number
    activeUsers: number
    adminUsers: number
    newThisMonth: number
}

export interface SystemAnalyticsEntry {
    id: string
    date: Date | string
    activeUsers: number
    newEnrollments: number
    completedCourses: number
    totalViews: number
    aiInteractions: number
    createdAt: Date | string
}

export interface AdminAnalyticsSummary {
    totalUsers: number
    activeUsers: number
    totalCourses: number
    totalEnrollments: number
    completionRate: number
    recentActivity: SystemAnalyticsEntry[]
}

export interface UserProfile {
    id: string
    email: string
    name: string
    role: 'USER' | 'ADMIN'
    avatar?: string | null
    bio?: string | null
    title?: string | null
    department?: string | null
    createdAt: string | Date
    lastLoginAt?: string | Date | null
}

export interface UpdateProfilePayload {
    name: string
    title?: string | null
    department?: string | null
    bio?: string | null
    avatar?: string | null
}

export interface CourseProgressSummary {
    courseId: string
    title: string
    thumbnail?: string | null
    instructorName?: string | null
    progress: number
    status: 'ACTIVE' | 'COMPLETED' | 'DROPPED'
    level: CourseLevel
    category: string
    lastAccessedAt?: string | Date | null
    completedAt?: string | Date | null
}

export interface LearningActivityEntry {
    id: string
    lessonId: string
    lessonTitle: string
    courseId: string
    courseTitle: string
    completed: boolean
    watchedDuration: number
    updatedAt: string | Date
}

export interface UserProgressOverview {
    stats: {
        totalEnrolled: number
        completedCourses: number
        inProgressCourses: number
        avgProgress: number
        hoursLearned: number
    }
    courses: CourseProgressSummary[]
    recentActivity: LearningActivityEntry[]
    upcomingDeadlines: CourseDeadline[]
    certificates: CertificateSummary[]
}

export interface CourseDeadline {
    courseId: string
    title: string
    deadline: Date | string
    progress: number
    status: 'ACTIVE' | 'COMPLETED' | 'DROPPED'
}

export interface CertificateSummary {
    id: string
    courseId: string
    courseTitle: string
    instructorName?: string
    certificateNumber: string
    issueDate: Date | string
    pdfUrl?: string
}

export type CourseLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'

export interface Instructor {
    id: string
    name: string
    title?: string
    avatar?: string
    bio?: string
}

export interface Lesson {
    id: string
    title: string
    description?: string
    duration?: number
    durationMinutes?: number | null
    order?: number
    videoUrl?: string // legacy
    subtitleUrl?: string // legacy
    transcript?: string // legacy
    lessonType?: 'VIDEO' | 'DOC' | 'QUIZ' | 'OTHER'
    learningObjectives?: string[]
    completionRule?: 'VIEW_ASSETS' | 'MANUAL' | 'QUIZ'
    assets?: CourseAsset[]
    completed?: boolean
}

export interface Chapter {
    id: string
    title: string
    description?: string
    order?: number
    lessons: Lesson[]
}

export type CourseAssetType = 'VIDEO' | 'DOCUMENT' | 'PRESENTATION' | 'TEXT' | 'AUDIO' | 'OTHER'

export interface CourseAsset {
    id: string
    title: string
    description?: string | null
    type: CourseAssetType
    url: string
    cloudfrontUrl?: string | null
    mimeType?: string | null
    contentType?: string | null
    createdAt?: string | Date
}

export interface Course {
    id: string
    title: string
    description: string
    instructor: Instructor
    thumbnail?: string
    duration: number // in seconds
    level: CourseLevel
    category: string
    rating: number
    reviewCount: number
    enrolledCount: number
    tags: string[]
    learningOutcomes?: string[]
    requirements?: string[]
    chapters?: Chapter[]
    assets?: CourseAsset[]
    aiAssistantEnabled?: boolean
}

// Curriculum (new)
export type CurriculumStatus = 'DRAFT' | 'PUBLISHED' | 'DEPRECATED'
export type AudienceLevel = 'L1' | 'L2' | 'L3' | 'L4'

export interface CurriculumSummary {
    id: string
    code: string
    title: string
    status: CurriculumStatus
    versionNumber: number
    audienceLevel: AudienceLevel
    modulesCount: number
    lessonsCount: number
    updatedAt?: string | Date
    publishedAt?: string | Date | null
}

export interface CurriculumModule {
    id: string
    title: string
    description?: string
    position: number
    lessons: Array<{
        id: string
        title: string
        durationSeconds?: number
        skillLevel?: AudienceLevel
    }>
}

export interface CurriculumVersion {
    id: string
    curriculumId: string
    versionNumber: number
    status: CurriculumStatus
    title: string
    description?: string
    audienceLevel: AudienceLevel
    learningOutcomes: string[]
    requirements: string[]
    tags?: string[]
    modules: CurriculumModule[]
    publishedAt?: string | Date | null
    updatedAt?: string | Date | null
}

export interface Quiz {
    id: string
    courseId: string
    title: string
    questions: Question[]
    passingScore: number
    timeLimit?: number // in seconds
}

export interface Question {
    id: string
    type: 'multiple-choice' | 'true-false' | 'fill-in'
    question: string
    options?: string[]
    correctAnswer: string | number
    explanation?: string
}

export interface QuizResult {
    id: string
    quizId: string
    userId: string
    score: number
    totalQuestions: number
    answers: Record<string, string | number>
    completedAt: Date
    passed: boolean
}

export interface AIMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
}

export interface LessonProgress {
    lessonId: string
    completed: boolean
    watchedDuration: number
    lastTimestamp: number
}

export interface TrainingReport {
    userId: string
    coursesCompleted: Course[]
    totalLearningTime: number
    knowledgePoints: string[]
    recommendedCourses: Course[]
    achievements: Achievement[]
}

export interface Achievement {
    id: string
    title: string
    description: string
    icon: string
    earnedAt: Date
}

// Exam System Types
export type ExamStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED'
export type ExamType = 'COURSE_BASED' | 'STANDALONE'
export type ExamQuestionType = 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_IN_BLANK' | 'ESSAY' | 'EXERCISE'
export type ExamAttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED' | 'EXPIRED'
export type GradingStatus = 'PENDING' | 'AUTO_GRADED' | 'AI_SUGGESTED' | 'MANUALLY_GRADED'

export interface Exam {
    id: string
    title: string
    description?: string | null
    instructions?: string | null
    examType: ExamType
    status: ExamStatus
    courseId?: string | null
    course?: { id: string; title: string } | null
    timeLimit?: number | null
    totalScore: number
    passingScore: number
    maxAttempts: number
    randomizeQuestions: boolean
    randomizeOptions: boolean
    showResultsImmediately: boolean
    allowReview: boolean
    availableFrom?: string | Date | null
    deadline?: string | Date | null
    createdAt: string | Date
    updatedAt: string | Date
    publishedAt?: string | Date | null
    _count?: {
        questions: number
        attempts: number
        invitations: number
    }
}

export interface ExamQuestion {
    id: string
    examId: string
    type: ExamQuestionType
    question: string
    options?: string[] | null
    correctAnswer?: string | null
    explanation?: string | null
    points: number
    order: number
    difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | null
    maxWords?: number | null
    rubric?: string | null
    sampleAnswer?: string | null
}

export interface ExamAttempt {
    id: string
    examId: string
    userId: string
    attemptNumber: number
    status: ExamAttemptStatus
    startedAt: string | Date
    submittedAt?: string | Date | null
    expiresAt?: string | Date | null
    rawScore?: number | null
    percentageScore?: number | null
    passed?: boolean | null
    hasEssays: boolean
    essaysGraded: boolean
    user?: {
        id: string
        name: string
        email: string
    }
    exam?: {
        id: string
        title: string
        totalScore: number
        passingScore: number
    }
    _count?: {
        answers: number
    }
}

export interface ExamAnswer {
    id: string
    attemptId: string
    questionId: string
    answer?: string | null
    selectedOption?: number | null
    recordingS3Key?: string | null
    recordingMimeType?: string | null
    recordingSizeBytes?: number | null
    recordingDurationSeconds?: number | null
    recordingStatus?: 'PENDING_UPLOAD' | 'UPLOADED' | 'FAILED' | null
    gradingStatus: GradingStatus
    isCorrect?: boolean | null
    pointsAwarded?: number | null
    aiSuggestedScore?: number | null
    aiFeedback?: string | null
    adminScore?: number | null
    adminFeedback?: string | null
    question?: ExamQuestion
}

export interface ExamInvitation {
    id: string
    examId: string
    userId: string
    emailSentAt?: string | Date | null
    viewed: boolean
    viewedAt?: string | Date | null
    user?: {
        id: string
        name: string
        email: string
    }
}

export interface ExamAnalytics {
    examId: string
    totalAttempts: number
    uniqueUsers: number
    avgScore: number
    medianScore?: number | null
    highestScore: number
    lowestScore: number
    passCount: number
    failCount: number
    avgCompletionTime?: number | null
    lastUpdatedAt: string | Date
}
