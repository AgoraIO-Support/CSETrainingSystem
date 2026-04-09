export interface User {
    id: string
    name: string
    email: string
    avatar?: string
    role: 'admin' | 'user' | 'ADMIN' | 'USER' | 'SME'
    enrolledCourses: string[]
    completedCourses: string[]
    progress: Record<string, number>
}

export interface AdminUser {
    id: string
    name: string
    email: string
    wecomUserId?: string | null
    avatar?: string | null
    role: 'USER' | 'SME' | 'ADMIN'
    status: 'ACTIVE' | 'SUSPENDED' | 'DELETED'
    department?: string | null
    title?: string | null
    createdAt: string | Date
    lastLoginAt?: string | Date | null
    enrollmentCount: number
    completedCourses: number
}

export interface SmeWorkspaceSummary {
    domains: ProductDomainSummary[]
    series: LearningSeriesSummary[]
    events: LearningEventSummary[]
    effectiveness: ProductDomainEffectivenessSummary[]
    weakTopics: Array<{
        topic: string | null
        misses: number
        answered: number
        domainName: string | null
    }>
    learnerGaps: Array<{
        userId: string
        name: string
        email: string
        gradedAttempts: number
        passedAttempts: number
        failedAttempts: number
        passRate: number
        lastSubmittedAt: string | Date | null
    }>
}

export interface SmeBadgeLadderOverview {
    series: Array<{
        id: string
        name: string
        slug: string
    }>
    templates: Array<{
        id: string
        name: string
        slug: string
        description?: string | null
        icon?: string | null
        thresholdStars: number
        awardCount: number
    }>
    seriesLadders: Array<{
        learningSeries: {
            id: string
            name: string
            slug: string
        }
        totalUnlocks: number
        recognizedLearners: number
        latestUnlockedAt: string | Date | null
        milestones: Array<{
            id: string
            name: string
            slug: string
            description?: string | null
            icon?: string | null
            thresholdStars: number
            awardCount: number
        }>
    }>
    recentUnlocks: Array<{
        id: string
        awardedAt: string | Date
        user: {
            id: string
            name: string
            email: string
        }
        badge: {
            id: string
            name: string
            slug: string
            thresholdStars: number
        }
        learningSeries: {
            id: string
            name: string
            slug: string
        }
        event?: {
            id: string
            title: string
        } | null
        exam?: {
            id: string
            title: string
        } | null
    }>
}

export interface AdminUserStats {
    totalUsers: number
    activeUsers: number
    adminUsers: number
    smeUsers: number
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
    learnerProgress: Array<{
        userId: string
        name: string
        email: string
        status: 'ACTIVE' | 'SUSPENDED' | 'DELETED'
        lastLoginAt: string | Date | null
        enrollmentCount: number
        completedCourses: number
        averageProgress: number
        courses: Array<{
            courseId: string
            title: string
            progress: number
            status: 'ACTIVE' | 'COMPLETED' | 'DROPPED'
            enrolledAt: string | Date
            lastAccessedAt: string | Date | null
            completedAt: string | Date | null
        }>
    }>
    recentActivity: SystemAnalyticsEntry[]
}

export interface TrainingOpsBridge {
    generatedAt: string | Date
    analytics: {
        totalUsers: number
        activeUsers: number
        totalCourses: number
        totalEnrollments: number
        completionRate: number
        learnerRows: number
        recentActivityEntries: number
    }
    exams: {
        totalExams: number
        draftExams: number
        pendingReviewExams: number
        approvedExams: number
        publishedExams: number
        invitations: number
        attempts: number
        practiceExams: number | null
        readinessExams: number | null
        formalExams: number | null
        performanceTrackedExams: number | null
        starEnabledExams: number | null
        examsMappedToDomain: number | null
        questionsMappedToDomain: number | null
        recentExams: Array<{
            id: string
            title: string
            status: string
            publishedAt: string | Date | null
            updatedAt: string | Date
            allowReview: boolean
            maxAttempts: number
            questionCount: number
            invitationCount: number
            attemptCount: number
        }>
    }
    rewards: {
        achievementTemplates: number
        achievementAwards: number
        certificateCount: number
        formalCertificateCount: number | null
        badgeMilestones: number | null
        badgeAwards: number | null
        starAwards: number | null
        certificateExams: Array<{
            examId: string
            title: string
            certificateCount: number
            learnerCount: number
        }>
        learnersWithRecognition: number
        topLearners: Array<{
            userId: string
            name: string
            email: string
            stars: number
            badges: number
            lastRewardedAt: string | Date | null
            recentSources: string[]
        }>
    }
    trainingOps: {
        productDomains: number | null
        activeProductDomains: number | null
        learningSeries: number | null
        activeLearningSeries: number | null
        scheduledEvents: number | null
        completedEvents: number | null
        migrated: boolean
        previewDomains: Array<{
            id: string
            name: string
            cadence: string | null
            primarySmeName: string | null
        }>
        previewSeries: Array<{
            id: string
            name: string
            type: string
            domainName: string | null
            cadence: string | null
            isActive: boolean
        }>
        previewEvents: Array<{
            id: string
            title: string
            status: string
            scheduledAt: string | Date | null
            domainName: string | null
            hostName: string | null
        }>
        topRewardDomains: Array<{
            domainId: string | null
            domainName: string | null
            starAwards: number
            badgeAwards: number
            recognizedLearners: number
        }>
        rewardedEvents: Array<{
            id: string
            title: string
            scheduledAt: string | Date | null
            domainName: string | null
            starAwards: number
            badgeAwards: number
            recognizedLearners: number
        }>
    }
}

export interface ProductDomainSummary {
    id: string
    name: string
    slug: string
    category: 'RTE' | 'AI'
    track: 'AGILE' | 'MASTERY' | 'RELEASE' | 'FINAL'
    kpiMode: 'DELTA' | 'RETENTION' | 'READINESS'
    description?: string | null
    cadence?: string | null
    active: boolean
    baselinePassRate?: number | null
    targetPassRate?: number | null
    challengeThreshold?: number | null
    primarySme?: {
        id: string
        name: string
        email: string
    } | null
    backupSme?: {
        id: string
        name: string
        email: string
    } | null
    counts: {
        learningSeries: number
        learningEvents: number
        exams: number
        badgeMilestones: number
    }
    recentEvent?: {
        id: string
        title: string
        scheduledAt: string | Date | null
    } | null
    rewards?: {
        starAwards: number
        badgeAwards: number
        recognizedLearners: number
    }
    createdAt: string | Date
    updatedAt: string | Date
}

export interface ProductDomainEffectivenessSummary {
    id: string
    name: string
    slug: string
    category: 'RTE' | 'AI'
    track: 'AGILE' | 'MASTERY' | 'RELEASE' | 'FINAL'
    kpiMode: 'DELTA' | 'RETENTION' | 'READINESS'
    cadence?: string | null
    baselinePassRate?: number | null
    targetPassRate?: number | null
    challengeThreshold?: number | null
    currentPassRate: number
    deltaFromBaseline: number | null
    targetGap: number | null
    gradedAttempts: number
    passedAttempts: number
    failedAttempts: number
    linkedExamCount: number
    performanceExamCount: number
    scheduledEventCount: number
    status: 'ON_TRACK' | 'MONITOR' | 'AT_RISK' | 'INSUFFICIENT_DATA'
    primarySme?: {
        id: string
        name: string
        email: string
    } | null
}

export interface LearningSeriesSummary {
    id: string
    name: string
    slug: string
    type:
        | 'WEEKLY_DRILL'
        | 'CASE_STUDY'
        | 'KNOWLEDGE_SHARING'
        | 'FAQ_SHARE'
        | 'RELEASE_READINESS'
        | 'QUARTERLY_FINAL'
        | 'YEAR_END_FINAL'
    description?: string | null
    cadence?: string | null
    isActive: boolean
    badgeEligible: boolean
    countsTowardPerformance: boolean
    defaultStarValue?: number | null
    domain?: {
        id: string
        name: string
        slug: string
        track: 'AGILE' | 'MASTERY' | 'RELEASE' | 'FINAL'
    } | null
    owner?: {
        id: string
        name: string
        email: string
    } | null
    counts: {
        events: number
        exams: number
    }
    recentEvent?: {
        id: string
        title: string
        scheduledAt: string | Date | null
    } | null
    rewards?: {
        starAwards: number
        badgeAwards: number
        recognizedLearners: number
    }
    createdAt: string | Date
    updatedAt: string | Date
}

export interface BadgeMilestoneSummary {
    id: string
    name: string
    slug: string
    description?: string | null
    icon?: string | null
    thresholdStars: number
    active: boolean
    domain?: {
        id: string
        name: string
        slug: string
    } | null
    learningSeries?: {
        id: string
        name: string
        slug: string
    } | null
    awardCount: number
    createdAt: string | Date
    updatedAt: string | Date
}

export interface TrainingOpsBadgeImportItemSummary {
    slug: string
    name: string
    scope: 'SERIES' | 'GLOBAL' | 'DOMAIN'
    learningSeriesSlug?: string | null
    domainSlug?: string | null
    thresholdStars: number
    action: 'plan' | 'upserted'
}

export interface TrainingOpsBadgeImportSummary {
    version: number
    scopeModel: string
    activeSeries: string[]
    dryRun: boolean
    totals: {
        items: number
        processed: number
    }
    items: TrainingOpsBadgeImportItemSummary[]
}

export interface TrainingOpsLearningSeriesImportItemSummary {
    slug: string
    name: string
    type:
        | 'WEEKLY_DRILL'
        | 'CASE_STUDY'
        | 'KNOWLEDGE_SHARING'
        | 'FAQ_SHARE'
        | 'RELEASE_READINESS'
        | 'QUARTERLY_FINAL'
        | 'YEAR_END_FINAL'
    domainSlug?: string | null
    ownerEmail?: string | null
    action: 'plan' | 'upserted'
}

export interface TrainingOpsLearningSeriesImportSummary {
    version: number
    scopeModel: string
    activeDomains: string[]
    dryRun: boolean
    totals: {
        items: number
        processed: number
    }
    items: TrainingOpsLearningSeriesImportItemSummary[]
}

export interface TrainingOpsDomainImportItemSummary {
    slug: string
    name: string
    category: 'RTE' | 'AI'
    track: 'AGILE' | 'MASTERY' | 'RELEASE' | 'FINAL'
    kpiMode: 'DELTA' | 'RETENTION' | 'READINESS'
    primarySmeEmail?: string | null
    backupSmeEmail?: string | null
    action: 'plan' | 'upserted'
}

export interface TrainingOpsDomainImportSummary {
    version: number
    scopeModel: string
    dryRun: boolean
    totals: {
        items: number
        processed: number
    }
    items: TrainingOpsDomainImportItemSummary[]
}

export interface TrainingOpsBootstrapImportSummary {
    version: number
    scopeModel: string
    dryRun: boolean
    totals: {
        sections: number
        items: number
        processed: number
    }
    domains: TrainingOpsDomainImportSummary
    series: TrainingOpsLearningSeriesImportSummary
    badges: TrainingOpsBadgeImportSummary
}

export interface LearningEventSummary {
    id: string
    title: string
    format:
        | 'CASE_STUDY'
        | 'KNOWLEDGE_SHARING'
        | 'FAQ_SHARE'
        | 'RELEASE_BRIEFING'
        | 'QUIZ_REVIEW'
        | 'FINAL_EXAM'
        | 'WORKSHOP'
    status: 'DRAFT' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'
    description?: string | null
    releaseVersion?: string | null
    scheduledAt?: string | Date | null
    startsAt?: string | Date | null
    endsAt?: string | Date | null
    isRequired: boolean
    countsTowardPerformance: boolean
    starValue?: number | null
    domain?: {
        id: string
        name: string
        slug: string
    } | null
    series?: {
        id: string
        name: string
        slug: string
        type: string
    } | null
    host?: {
        id: string
        name: string
        email: string
    } | null
    createdBy?: {
        id: string
        name: string
        email: string
    } | null
    exams: Array<{
        id: string
        title: string
        status: string
        publishedAt?: string | Date | null
        invitationCount?: number
        attemptCount?: number
        gradedAttemptCount?: number
        passedCount?: number
        failedCount?: number
        passRate?: number
    }>
    courses: Array<{
        id: string
        title: string
        slug: string
        status: string
        publishedAt?: string | Date | null
        enrolledCount: number
    }>
    analytics?: {
        linkedCourseCount: number
        linkedExamCount: number
        invitationCount: number
        attemptCount: number
        gradedAttemptCount: number
        passedCount: number
        failedCount: number
        passRate: number
        starAwardCount: number
        badgeAwardCount: number
        recognizedLearners: number
    }
    createdAt: string | Date
    updatedAt: string | Date
    completedAt?: string | Date | null
}

export interface TrainingOpsExamSummary {
    id: string
    title: string
    status: ExamStatus
    publishedAt?: string | Date | null
    productDomainId?: string | null
    learningSeriesId?: string | null
    learningEventId?: string | null
    invitationCount?: number
    attemptCount?: number
    gradedAttemptCount?: number
    passedCount?: number
    failedCount?: number
    passRate?: number
}

export interface SmeManagedExamDetail extends TrainingOpsExamSummary {
    description?: string | null
    instructions?: string | null
    assessmentKind?: string | null
    awardsStars?: boolean
    starValue?: number | null
    countsTowardPerformance?: boolean
    createdAt: string | Date
    updatedAt: string | Date
    questionCount: number
    domain?: {
        id: string
        name: string
        slug: string
    } | null
    series?: {
        id: string
        name: string
        slug: string
    } | null
    event?: {
        id: string
        title: string
        format: string
        status: string
    } | null
}

export interface TrainingOpsCourseSummary {
    id: string
    title: string
    slug: string
    status: CourseStatus
    publishedAt?: string | Date | null
    enrolledCount: number
    learningEventId?: string | null
}

export interface SmeManagedCourseDetail extends TrainingOpsCourseSummary {
    description: string
    category: string
    level: CourseLevel
    tags: string[]
    learningOutcomes: string[]
    requirements: string[]
    createdAt: string | Date
    updatedAt: string | Date
    chapterCount: number
    enrollmentCount: number
    linkedExamCount: number
    instructor: {
        id: string
        name: string
        email: string
    }
    event?: {
        id: string
        title: string
        format: string
        status: string
    } | null
}

export interface LearnerRewardsOverview {
    summary: {
        totalStars: number
        totalBadges: number
        recognizedEvents: number
        activeDomains: number
        certificatesEarned: number
    }
    recentStarAwards: Array<{
        id: string
        stars: number
        sourceType: string
        reason?: string | null
        awardedAt: string | Date
        domain?: {
            id: string
            name: string
            slug: string
        } | null
        learningSeries?: {
            id: string
            name: string
            slug: string
        } | null
        event?: {
            id: string
            title: string
        } | null
        exam?: {
            id: string
            title: string
        } | null
    }>
    badges: Array<{
        id: string
        awardedAt: string | Date
        badge: {
            id: string
            name: string
            slug: string
            description?: string | null
            icon?: string | null
            thresholdStars: number
        }
        domain?: {
            id: string
            name: string
            slug: string
        } | null
        learningSeries?: {
            id: string
            name: string
            slug: string
        } | null
        event?: {
            id: string
            title: string
        } | null
    }>
    topDomains: Array<{
        domainId: string | null
        domainName: string
        stars: number
        badges: number
    }>
    seriesProgressions: Array<{
        learningSeries: {
            id: string
            name: string
            slug: string
        }
        stars: number
        unlockedBadges: number
        currentBadge: {
            id: string
            name: string
            slug: string
            thresholdStars: number
        } | null
        nextBadge: {
            id: string
            name: string
            slug: string
            thresholdStars: number
            remainingStars: number
        } | null
        progressPercent: number
    }>
    nextBadge?: {
        id: string
        name: string
        slug: string
        thresholdStars: number
        remainingStars: number
    } | null
}

export interface LearnerTrainingOverview {
    summary: {
        assignedExams: number
        pendingExams: number
        inProgressExams: number
        passedExams: number
        upcomingEvents: number
        requiredItems: number
    }
    upcomingEvents: Array<{
        id: string
        title: string
        format: string
        status: string
        scheduledAt?: string | Date | null
        startsAt?: string | Date | null
        isRequired: boolean
        domain?: {
            id: string
            name: string
            slug: string
        } | null
        linkedExams: Array<{
            id: string
            title: string
            deadline?: string | Date | null
        }>
    }>
    assignedExams: Array<{
        id: string
        title: string
        status: string
        assessmentKind?: 'PRACTICE' | 'READINESS' | 'FORMAL'
        countsTowardPerformance: boolean
        awardsStars: boolean
        starValue?: number | null
        certificateEligible?: boolean
        deadline?: string | Date | null
        availableFrom?: string | Date | null
        domain?: {
            id: string
            name: string
            slug: string
        } | null
        learningSeries?: {
            id: string
            name: string
            slug: string
            type: string
        } | null
        learningEvent?: {
            id: string
            title: string
            format: string
            scheduledAt?: string | Date | null
            isRequired: boolean
        } | null
        userStatus: {
            completedAttempts: number
            remainingAttempts: number
            hasInProgressAttempt: boolean
            inProgressAttemptId?: string
            bestScore?: number | null
            hasPassed: boolean
        }
    }>
    recentCompletions: Array<{
        attemptId: string
        examId: string
        examTitle: string
        submittedAt?: string | Date | null
        percentageScore?: number | null
        passed?: boolean | null
        domainName?: string | null
        eventTitle?: string | null
        assessmentKind?: 'PRACTICE' | 'READINESS' | 'FORMAL'
    }>
}

export interface UserProfile {
    id: string
    email: string
    name: string
    role: 'USER' | 'SME' | 'ADMIN'
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
    subtitleTracks?: SubtitleTrack[]
    transcript?: string // legacy
    lessonType?: 'VIDEO' | 'DOC' | 'QUIZ' | 'OTHER'
    learningObjectives?: string[]
    completionRule?: 'VIEW_ASSETS' | 'MANUAL' | 'QUIZ'
    assets?: CourseAsset[]
    completed?: boolean
}

export interface SubtitleTrack {
    id: string
    src: string
    srclang: string
    label: string
    default?: boolean
    isPrimaryForAI?: boolean
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

export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

export interface Course {
    id: string
    title: string
    slug?: string
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
    status?: CourseStatus
    learningEventId?: string | null
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
export type ExamQuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_IN_BLANK' | 'ESSAY' | 'EXERCISE'
export type ExamAttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED' | 'EXPIRED'
export type GradingStatus = 'PENDING' | 'AUTO_GRADED' | 'AI_SUGGESTED' | 'MANUALLY_GRADED'

export interface EssayGradingCriterion {
    id: string
    title: string
    description?: string | null
    maxPoints: number
    guidance?: string | null
    required?: boolean
}

export interface EssayAIGradingCriterionResult {
    criterionId: string
    criterionTitle?: string | null
    suggestedPoints: number
    reasoning: string
    evidence?: string | null
    met?: boolean | null
}

export interface EssayAIGradingBreakdown {
    criteria: EssayAIGradingCriterionResult[]
    overallFeedback?: string | null
    rubricEvaluation?: string | null
    confidence?: number | null
    flags?: string[]
}

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
    assessmentKind?: 'PRACTICE' | 'READINESS' | 'FORMAL'
    productDomainId?: string | null
    learningSeriesId?: string | null
    learningEventId?: string | null
    awardsStars?: boolean
    starValue?: number | null
    countsTowardPerformance?: boolean
    certificateEligible?: boolean
    timezone: string
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
    gradingCriteria?: EssayGradingCriterion[] | null
    attachmentS3Key?: string | null
    attachmentFilename?: string | null
    attachmentMimeType?: string | null
    attachmentUrl?: string | null
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
    aiGradingBreakdown?: EssayAIGradingBreakdown | null
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

export interface CourseInvitation {
    id: string
    courseId: string
    userId: string
    status: 'ACTIVE' | 'COMPLETED' | 'DROPPED'
    progress: number
    enrolledAt: string | Date
    lastAccessedAt?: string | Date | null
    completedAt?: string | Date | null
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
