import { AuthUser } from './auth-middleware'
import type {
    Course,
    CourseLevel,
    LessonProgress,
    AdminUser,
    AdminUserStats,
    AdminAnalyticsSummary,
    UserProgressOverview,
    UserProfile,
    UpdateProfilePayload,
    Exam,
    ExamQuestion,
    ExamAttempt,
    ExamInvitation,
    CourseInvitation,
    ExamAnalytics,
    ExamStatus,
    ExamType,
    ExamQuestionType,
} from '@/types'

// Types
export interface LoginResponse {
    success: boolean
    data: {
        user: AuthUser
        session: {
            accessToken: string
            refreshToken: string
            expiresIn: number
        }
    }
    message?: string
}

export interface RegisterPayload {
    email: string
    password: string
    name: string
    department?: string
}

export type RegisterResponse = LoginResponse

export interface AdminCreateUserPayload {
    email: string
    password: string
    name: string
    wecomUserId: string
    department?: string
    title?: string
}

export interface ApiError {
    success: false
    error: {
        code: string
        message: string
    }
}

const BASE_URL = '/api'

type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

type CreateCoursePayload = {
    title: string
    slug: string
    description: string
    thumbnail?: string
    level: CourseLevel
    category: string
    tags: string[]
    instructorId: string
    status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
}

type UpdateCoursePayload = Partial<CreateCoursePayload> & {
    status?: CourseStatus
    sendNotification?: boolean
}

export class ApiClient {
    private static getToken(): string | null {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('accessToken')
        }
        return null
    }

    private static setToken(token: string) {
        if (typeof window !== 'undefined') {
            localStorage.setItem('accessToken', token)
        }
    }

    static logout() {
        if (typeof window !== 'undefined') {
            localStorage.removeItem('accessToken')
            window.location.href = '/login'
        }
    }

    public static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const token = this.getToken()

        const { headers: requestHeaders, ...restOptions } = options
        const headers = new Headers(requestHeaders ?? {})

        if (!headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json')
        }

        if (token) {
            headers.set('Authorization', `Bearer ${token}`)
        }

        const response = await fetch(`${BASE_URL}${endpoint}`, {
            ...restOptions,
            headers,
        })

        const data = await response.json()

        if (!response.ok) {
            if (response.status === 401) {
                // Token expired or invalid
                this.logout()
            }

            const detailMessage = Array.isArray(data?.error?.details) && data.error.details.length > 0
                ? data.error.details[0]?.message
                : undefined

            const baseMessage = data?.error?.message || 'API request failed'
            const message = detailMessage ? `${baseMessage} (${detailMessage})` : baseMessage

            throw new Error(message)
        }

        return data
    }

    // Auth
    static async login(email: string, password: string): Promise<LoginResponse> {
        const response = await this.request<LoginResponse>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        })

        if (response.success && response.data.session) {
            this.setToken(response.data.session.accessToken)
        }

        return response
    }

    static async register(payload: RegisterPayload): Promise<RegisterResponse> {
        const response = await this.request<RegisterResponse>('/auth/register', {
            method: 'POST',
            body: JSON.stringify(payload),
        })

        if (response.success && response.data.session) {
            this.setToken(response.data.session.accessToken)
        }

        return response
    }

    static async getMe(): Promise<{ success: boolean; data: AuthUser }> {
        return this.request('/auth/me')
    }

    static async getProfile(): Promise<{ success: boolean; data: UserProfile }> {
        return this.request('/profile')
    }

    static async updateProfile(payload: UpdateProfilePayload): Promise<{
        success: boolean
        data: UserProfile
    }> {
        return this.request('/profile', {
            method: 'PUT',
            body: JSON.stringify(payload),
        })
    }

    static async changePassword(payload: { currentPassword?: string; newPassword: string }): Promise<{ success: boolean }> {
        return this.request('/profile/password', {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    }

    // Courses (public)
    static async getCourses(params: Record<string, string | number | undefined> = {}): Promise<{
        success: boolean
        data: {
            courses: Course[]
            pagination: {
                page: number
                limit: number
                total: number
                totalPages: number
            }
        }
    }> {
        const query = new URLSearchParams()
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                query.set(key, String(value))
            }
        })

        const search = query.toString() ? `?${query.toString()}` : ''
        return this.request(`/courses${search}`)
    }

    // Admin Courses (ALL statuses by default)
    static async getAdminCourses(params: Record<string, string | number | undefined> = {}): Promise<{
        success: boolean
        data: Course[]
        pagination: {
            page: number
            limit: number
            total: number
            totalPages: number
        }
    }> {
        const query = new URLSearchParams()
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                query.set(key, String(value))
            }
        })
        const search = query.toString() ? `?${query.toString()}` : ''
        return this.request(`/admin/courses${search}`)
    }

    static async getAdminCourseAnalytics(courseId: string): Promise<{
        success: boolean
        data: {
            courseId: string
            enrolledUsers: Array<{
                user: {
                    id: string
                    name: string
                    email: string
                    avatar?: string | null
                    department?: string | null
                    title?: string | null
                }
                status: 'ACTIVE' | 'COMPLETED' | 'DROPPED'
                progress: number
                enrolledAt: string | Date
                lastAccessedAt?: string | Date | null
                completedAt?: string | Date | null
            }>
            activeLearners: { d7: number; d14: number; d30: number }
            completionRate: number
            averageCompletionTimeSeconds: number | null
        }
    }> {
        return this.request(`/admin/courses/${courseId}/analytics`)
    }

    static async getCourse(id: string): Promise<{ success: boolean; data: Course & { isEnrolled: boolean; progress: number; aiAssistantEnabled?: boolean } }> {
        return this.request(`/courses/${id}`)
    }

    static async getCourseContent(id: string) {
        return this.request(`/courses/${id}/content`)
    }

    static async enrollInCourse(courseId: string) {
        return this.request(`/courses/${courseId}/enroll`, {
            method: 'POST',
        })
    }

    // Admin Courses
    static async createCourse(payload: CreateCoursePayload) {
        return this.request('/admin/courses', {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    }

    static async updateCourse(courseId: string, payload: UpdateCoursePayload) {
        return this.request(`/admin/courses/${courseId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        })
    }

    static async deleteCourse(courseId: string) {
        return this.request(`/admin/courses/${courseId}`, {
            method: 'DELETE',
        })
    }

    // Course structure (Step 2)
    static async createChapter(courseId: string, payload: { title: string; description?: string; order?: number }) {
        return this.request(`/admin/courses/${courseId}/chapters`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    }

    static async updateChapter(courseId: string, chapterId: string, payload: Partial<{ title: string; description?: string; order?: number }>) {
        return this.request(`/admin/courses/${courseId}/chapters/${chapterId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        })
    }

    static async deleteChapter(courseId: string, chapterId: string) {
        return this.request(`/admin/courses/${courseId}/chapters/${chapterId}`, { method: 'DELETE' })
    }

    static async reorderChapters(courseId: string, chapterOrder: string[]) {
        return this.request(`/admin/courses/${courseId}/chapters/reorder`, {
            method: 'PATCH',
            body: JSON.stringify({ chapterOrder }),
        })
    }

    static async createLesson(courseId: string, chapterId: string, payload: {
        title: string
        description?: string
        durationMinutes?: number
        lessonType?: 'VIDEO' | 'DOC' | 'QUIZ' | 'OTHER'
        learningObjectives?: string[]
        completionRule?: 'VIEW_ASSETS' | 'MANUAL' | 'QUIZ'
        order?: number
    }) {
        return this.request(`/admin/courses/${courseId}/chapters/${chapterId}/lessons`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    }

    static async updateLesson(courseId: string, chapterId: string, lessonId: string, payload: Partial<{
        title: string
        description?: string
        durationMinutes?: number
        lessonType?: 'VIDEO' | 'DOC' | 'QUIZ' | 'OTHER'
        learningObjectives?: string[]
        completionRule?: 'VIEW_ASSETS' | 'MANUAL' | 'QUIZ'
        order?: number
    }>) {
        return this.request(`/admin/courses/${courseId}/chapters/${chapterId}/lessons/${lessonId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        })
    }

    static async deleteLesson(courseId: string, chapterId: string, lessonId: string) {
        return this.request(`/admin/courses/${courseId}/chapters/${chapterId}/lessons/${lessonId}`, { method: 'DELETE' })
    }

    static async reorderLessons(courseId: string, chapterId: string, lessonOrder: string[]) {
        return this.request(`/admin/courses/${courseId}/chapters/${chapterId}/lessons/reorder`, {
            method: 'PATCH',
            body: JSON.stringify({ lessonOrder }),
        })
    }

    static async replaceLessonAssets(courseId: string, chapterId: string, lessonId: string, courseAssetIds: string[]) {
        return this.request(`/admin/courses/${courseId}/chapters/${chapterId}/lessons/${lessonId}/assets`, {
            method: 'POST',
            body: JSON.stringify({ courseAssetIds }),
        })
    }

    static async uploadLessonAsset(courseId: string, chapterId: string, lessonId: string, payload: { filename: string; contentType: string; type: 'VIDEO' | 'DOCUMENT' | 'PRESENTATION' | 'TEXT' | 'AUDIO' | 'OTHER' }) {
        return this.request(`/admin/courses/${courseId}/chapters/${chapterId}/lessons/${lessonId}/assets/upload`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    }

    static async deleteLessonAsset(courseId: string, chapterId: string, lessonId: string, courseAssetId: string) {
        return this.request(`/admin/courses/${courseId}/chapters/${chapterId}/lessons/${lessonId}/assets/${courseAssetId}`, { method: 'DELETE' })
    }

    static async getInstructors(): Promise<{ success: boolean; data: Array<{ id: string; name: string; email: string; title?: string }> }> {
        return this.request('/admin/instructors')
    }

    static async getUsers(params: Record<string, string | number | undefined> = {}): Promise<{
        success: boolean
        data: {
            users: AdminUser[]
            stats: AdminUserStats
            pagination: {
                page: number
                limit: number
                total: number
                totalPages: number
            }
        }
    }> {
        const query = new URLSearchParams()
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                query.set(key, String(value))
            }
        })

        const search = query.toString() ? `?${query.toString()}` : ''
        return this.request(`/admin/users${search}`)
    }

    static async updateUser(
        userId: string,
        payload: {
            role?: 'USER' | 'ADMIN'
            status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED'
            name?: string
            email?: string
            wecomUserId?: string
            department?: string | null
            title?: string | null
        }
    ) {
        return this.request(`/admin/users/${userId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        })
    }

    static async createAdminUser(payload: AdminCreateUserPayload): Promise<{
        success: boolean
        data: AdminUser
    }> {
        return this.request('/admin/users', {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    }

    static async getAnalytics(params: Record<string, string | number | undefined> = {}): Promise<{
        success: boolean
        data: AdminAnalyticsSummary
    }> {
        const query = new URLSearchParams()
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                query.set(key, String(value))
            }
        })

        const search = query.toString() ? `?${query.toString()}` : ''
        return this.request(`/admin/analytics${search}`)
    }

    static async getProgressOverview(): Promise<{
        success: boolean
        data: UserProgressOverview
    }> {
        return this.request('/progress/overview')
    }

    // Progress
    static async getCourseProgress(courseId: string): Promise<{
        success: boolean
        data: {
            courseId: string
            overallProgress: number
            completedLessons: number
            totalLessons: number
            lessonProgress: LessonProgress[]
        }
    }> {
        return this.request(`/progress/courses/${courseId}`)
    }

    static async updateLessonProgress(
        lessonId: string,
        payload: {
            watchedDuration: number
            lastTimestamp: number
            completed?: boolean
        }
    ) {
        return this.request(`/progress/lessons/${lessonId}`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    }

    // AI assistant
    static async createConversation(payload: { courseId?: string; lessonId?: string }) {
        return this.request(`/ai/conversations`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    }

    static async getConversationMessages(conversationId: string) {
        return this.request(`/ai/conversations/${conversationId}/messages`)
    }

    static async sendAIMessage(
        conversationId: string,
        payload: {
            message: string
            videoTimestamp?: number
            context?: Record<string, unknown>
        }
    ) {
        return this.request(`/ai/conversations/${conversationId}/messages`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    }

    // ========== Admin Exams ==========

    static async getAdminExams(params: Record<string, string | number | undefined> = {}): Promise<{
        success: boolean
        data: Exam[]
        pagination: {
            page: number
            limit: number
            total: number
            totalPages: number
        }
    }> {
        const query = new URLSearchParams()
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                query.set(key, String(value))
            }
        })
        const search = query.toString() ? `?${query.toString()}` : ''
        return this.request(`/admin/exams${search}`)
    }

    static async getAdminExam(examId: string): Promise<{ success: boolean; data: Exam }> {
        return this.request(`/admin/exams/${examId}`)
    }

    static async createExam(payload: {
        title: string
        examType: ExamType
        courseId?: string
        description?: string
        instructions?: string
        timeLimit?: number
        totalScore?: number
        passingScore?: number
        maxAttempts?: number
        randomizeQuestions?: boolean
        randomizeOptions?: boolean
        showResultsImmediately?: boolean
        allowReview?: boolean
        timezone: string
        availableFrom?: string
        deadline?: string
    }): Promise<{ success: boolean; data: Exam }> {
        return this.request('/admin/exams', {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    }

    static async updateExam(examId: string, payload: Partial<{
        title: string
        description: string | null
        instructions: string | null
        timeLimit: number | null
        totalScore: number
        passingScore: number
        maxAttempts: number
        randomizeQuestions: boolean
        randomizeOptions: boolean
        showResultsImmediately: boolean
        allowReview: boolean
        timezone: string
        availableFrom: string | null
        deadline: string | null
    }>): Promise<{ success: boolean; data: Exam }> {
        return this.request(`/admin/exams/${examId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        })
    }

    static async deleteExam(examId: string): Promise<{ success: boolean; message: string }> {
        return this.request(`/admin/exams/${examId}`, {
            method: 'DELETE',
        })
    }

    static async deleteExamForce(examId: string): Promise<{ success: boolean; message: string }> {
        return this.request(`/admin/exams/${examId}?force=1`, {
            method: 'DELETE',
        })
    }

    static async updateExamStatus(examId: string, status: ExamStatus): Promise<{ success: boolean; data: Exam }> {
        return this.request(`/admin/exams/${examId}/status`, {
            method: 'POST',
            body: JSON.stringify({ status }),
        })
    }

    static async publishExam(examId: string, payload: { userIds: string[]; sendNotification?: boolean; sendEmail?: boolean }): Promise<{ success: boolean; data: Exam; meta?: { invited: number; skipped: number; notificationsSent?: number; notificationsFailed?: number; emailsSent?: number; emailsFailed?: number } }> {
        return this.request(`/admin/exams/${examId}/publish`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    }

    // Exam Certificate Template
    static async getAdminExamCertificateTemplate(examId: string): Promise<{
        success: boolean
        data: {
            id: string
            examId: string
            isEnabled: boolean
            title: string
            badgeMode: 'AUTO' | 'UPLOADED'
            badgeS3Key?: string | null
            badgeMimeType?: string | null
            badgeStyle?: any | null
            createdAt: string | Date
            updatedAt: string | Date
        } | null
    }> {
        return this.request(`/admin/exams/${examId}/certificate-template`)
    }

    static async upsertAdminExamCertificateTemplate(
        examId: string,
        payload: {
            isEnabled: boolean
            title: string
            badgeMode: 'AUTO' | 'UPLOADED'
            badgeS3Key?: string | null
            badgeMimeType?: string | null
            badgeStyle?: any | null
        }
    ): Promise<{ success: boolean; data: any }> {
        return this.request(`/admin/exams/${examId}/certificate-template`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        })
    }

    static async getAdminExamCertificateBadgeUploadUrl(
        examId: string,
        payload: { filename: string; contentType: 'image/png' | 'image/jpeg' }
    ): Promise<{ success: boolean; data: { uploadUrl: string; key: string; bucket: string; publicUrl: string; accessUrl: string; expiresIn: number } }> {
        return this.request(`/admin/exams/${examId}/certificate-template/badge-upload-url`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    }

    // Exam Questions
    static async getExamQuestions(examId: string): Promise<{ success: boolean; data: ExamQuestion[] }> {
        return this.request(`/admin/exams/${examId}/questions`)
    }

    static async createExamQuestion(examId: string, payload: {
        type: ExamQuestionType
        question: string
        options?: string[]
        correctAnswer?: string
        explanation?: string
        points: number
        order?: number
        difficulty?: 'EASY' | 'MEDIUM' | 'HARD'
        maxWords?: number
        rubric?: string
        sampleAnswer?: string
        attachmentS3Key?: string | null
        attachmentFilename?: string | null
        attachmentMimeType?: string | null
    }): Promise<{ success: boolean; data: ExamQuestion }> {
        return this.request(`/admin/exams/${examId}/questions`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    }

    static async updateExamQuestion(examId: string, questionId: string, payload: Partial<{
        type: ExamQuestionType
        question: string
        options: string[]
        correctAnswer: string
        explanation: string
        points: number
        order: number
        difficulty: 'EASY' | 'MEDIUM' | 'HARD'
        maxWords: number
        rubric: string
        sampleAnswer: string
        attachmentS3Key: string | null
        attachmentFilename: string | null
        attachmentMimeType: string | null
    }>): Promise<{ success: boolean; data: ExamQuestion }> {
        return this.request(`/admin/exams/${examId}/questions/${questionId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        })
    }

    static async getAdminExamQuestionAttachmentUploadUrl(examId: string, questionId: string, payload: {
        filename: string
        contentType: string
    }): Promise<{
        success: boolean
        data: {
            uploadUrl: string
            key: string
            bucket: string
            publicUrl: string
            accessUrl: string
            expiresIn: number
        }
    }> {
        return this.request(`/admin/exams/${examId}/questions/${questionId}/attachment-upload-url`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    }

    static async deleteExamQuestion(examId: string, questionId: string): Promise<{ success: boolean; message: string }> {
        return this.request(`/admin/exams/${examId}/questions/${questionId}`, {
            method: 'DELETE',
        })
    }

    static async reorderExamQuestions(examId: string, questionOrder: string[]): Promise<{ success: boolean; data: ExamQuestion[] }> {
        return this.request(`/admin/exams/${examId}/questions/reorder`, {
            method: 'PATCH',
            body: JSON.stringify({ questionOrder }),
        })
    }

    static async generateExamQuestions(examId: string, config: {
        questionCounts: {
            singleChoice?: number
            multipleChoice?: number
            trueFalse?: number
            fillInBlank?: number
            essay?: number
        }
        difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'mixed'
        lessonIds?: string[]
        topics?: string[]
    }): Promise<{ success: boolean; data: ExamQuestion[] }> {
        return this.request(`/admin/exams/${examId}/generate-questions`, {
            method: 'POST',
            body: JSON.stringify(config),
        })
    }

    static async getExamKnowledgeContexts(examId: string): Promise<{
        success: boolean
        data: {
            courseId: string | null
            lessons: Array<{
                lessonId: string
                lessonTitle: string
                chapterTitle: string
                chapterOrder: number
                lessonOrder: number
                knowledgeStatus: string
                anchorCount: number
                processedAt: string | null
                hasTranscript: boolean
                transcriptId: string | null
                transcriptFilename: string | null
            }>
        }
    }> {
        return this.request(`/admin/exams/${examId}/knowledge-contexts`)
    }

    // Exam Invitations
    static async getExamInvitations(examId: string): Promise<{ success: boolean; data: ExamInvitation[] }> {
        return this.request(`/admin/exams/${examId}/invitations`)
    }

    static async createExamInvitations(examId: string, userIds: string[], opts?: { sendNotification?: boolean; sendEmail?: boolean }): Promise<{ success: boolean; data: { invited: number; skipped: number; notificationsSent?: number; notificationsFailed?: number; emailsSent?: number; emailsFailed?: number } }> {
        return this.request(`/admin/exams/${examId}/invitations`, {
            method: 'POST',
            body: JSON.stringify({
                userIds,
                sendNotification: opts?.sendNotification,
                sendEmail: opts?.sendEmail,
            }),
        })
    }

    static async sendExamInvitationNotifications(examId: string, userIds?: string[]): Promise<{ success: boolean; data: { sent: number; failed: number } }> {
        return this.request(`/admin/exams/${examId}/invitations/send`, {
            method: 'POST',
            body: JSON.stringify({ userIds }),
        })
    }

    // Backward-compatible alias
    static async sendExamInvitationEmails(examId: string, userIds?: string[]): Promise<{ success: boolean; data: { sent: number; failed: number } }> {
        return this.sendExamInvitationNotifications(examId, userIds)
    }

    // Course Invitations
    static async getCourseInvitations(courseId: string): Promise<{ success: boolean; data: CourseInvitation[] }> {
        return this.request(`/admin/courses/${courseId}/invitations`)
    }

    static async createCourseInvitations(courseId: string, userIds: string[], opts?: { sendNotification?: boolean; sendEmail?: boolean }): Promise<{ success: boolean; data: { invited: number; skipped: number; notificationsSent?: number; notificationsFailed?: number; emailsSent?: number; emailsFailed?: number } }> {
        return this.request(`/admin/courses/${courseId}/invitations`, {
            method: 'POST',
            body: JSON.stringify({
                userIds,
                sendNotification: opts?.sendNotification,
                sendEmail: opts?.sendEmail,
            }),
        })
    }

    static async sendCourseInvitationNotifications(courseId: string, userIds?: string[]): Promise<{ success: boolean; data: { sent: number; failed: number } }> {
        return this.request(`/admin/courses/${courseId}/invitations/send`, {
            method: 'POST',
            body: JSON.stringify({ userIds }),
        })
    }

    // Exam Attempts (Admin)
    static async getExamAttempts(examId: string, params: Record<string, string | number | undefined> = {}): Promise<{
        success: boolean
        data: ExamAttempt[]
        pagination: {
            page: number
            limit: number
            total: number
            totalPages: number
        }
    }> {
        const query = new URLSearchParams()
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                query.set(key, String(value))
            }
        })
        const search = query.toString() ? `?${query.toString()}` : ''
        return this.request(`/admin/exams/${examId}/attempts${search}`)
    }

    static async getExamAttemptDetail(examId: string, attemptId: string): Promise<{
        success: boolean
        data: ExamAttempt & {
            answers: Array<{
                id: string
                questionId: string
                answer?: string | null
                selectedOption?: number | null
                recordingS3Key?: string | null
                recordingStatus?: 'PENDING_UPLOAD' | 'UPLOADED' | 'FAILED' | null
                recordingMimeType?: string | null
                recordingSizeBytes?: number | null
                recordingDurationSeconds?: number | null
                recordingUrl?: string | null
                gradingStatus: string
                isCorrect?: boolean | null
                pointsAwarded?: number | null
                aiSuggestedScore?: number | null
                aiFeedback?: string | null
                adminScore?: number | null
                adminFeedback?: string | null
                question: ExamQuestion
            }>
            certificate?: {
                id: string
                certificateNumber: string
                issueDate: string | Date
                pdfUrl: string | null
                status: 'ISSUED' | 'REVOKED'
                revokedAt?: string | Date | null
                certificateTitle?: string | null
            } | null
        }
    }> {
        return this.request(`/admin/exams/${examId}/attempts/${attemptId}`)
    }

    // Essay Grading
    static async getEssaysToGrade(examId: string): Promise<{
        success: boolean
        data: Array<{
            attemptId: string
            answerId: string
            userId: string
            userName: string
            questionId: string
            question: string
            answer: string
            points: number
            aiSuggestedScore?: number | null
            aiFeedback?: string | null
            rubric?: string | null
            sampleAnswer?: string | null
        }>
    }> {
        return this.request(`/admin/exams/${examId}/essays`)
    }

    static async gradeEssay(examId: string, attemptId: string, answerId: string, payload: {
        score: number
        feedback?: string
    }): Promise<{ success: boolean; data: { answerId: string; score: number } }> {
        return this.request(`/admin/exams/${examId}/attempts/${attemptId}/grade-essay`, {
            method: 'POST',
            body: JSON.stringify({ answerId, ...payload }),
        })
    }

    static async triggerAutoGrade(examId: string, attemptId: string): Promise<{ success: boolean; data: ExamAttempt }> {
        return this.request(`/admin/exams/${examId}/attempts/${attemptId}/grade`, {
            method: 'POST',
        })
    }

    // Exam Analytics
    static async getExamAnalytics(examId: string): Promise<{ success: boolean; data: ExamAnalytics }> {
        const response: any = await this.request(`/admin/exams/${examId}/analytics`)
        const raw = response?.data

        // Backward/forward compatibility:
        // - Some API versions return a flat `ExamAnalytics` object
        // - The current backend returns a comprehensive object: `{ examId, examTitle, summary: {...} }`
        if (raw?.summary) {
            return {
                ...response,
                data: {
                    examId: raw.examId ?? examId,
                    totalAttempts: raw.summary.totalAttempts ?? 0,
                    uniqueUsers: raw.summary.uniqueUsers ?? 0,
                    avgScore: raw.summary.averageScore ?? 0,
                    medianScore: raw.summary.medianScore ?? null,
                    highestScore: raw.summary.maxScore ?? 0,
                    lowestScore: raw.summary.minScore ?? 0,
                    passCount: raw.summary.passedCount ?? 0,
                    failCount: raw.summary.failedCount ?? 0,
                    avgCompletionTime: raw.summary.averageCompletionTime ?? null,
                    lastUpdatedAt: new Date().toISOString(),
                } satisfies ExamAnalytics,
            }
        }

        return response
    }

    static async exportExamResults(examId: string): Promise<Blob> {
        const token = this.getToken()
        const response = await fetch(`/api/admin/exams/${examId}/export`, {
            headers: {
                Authorization: token ? `Bearer ${token}` : '',
            },
        })

        if (!response.ok) {
            throw new Error('Failed to export results')
        }

        return response.blob()
    }

    static async getExamLeaderboard(examId: string, limit?: number): Promise<{
        success: boolean
        data: {
            examId: string
            examTitle: string
            leaderboard: Array<{
                rank: number
                userId: string
                userName: string
                score: number
                percentageScore: number
                completedAt: string
            }>
        }
    }> {
        const query = limit ? `?limit=${limit}` : ''
        const response: any = await this.request(`/admin/exams/${examId}/leaderboard${query}`)
        const leaderboard = Array.isArray(response?.data?.leaderboard) ? response.data.leaderboard : []
        const normalized = leaderboard.map((entry: any) => ({
            rank: entry.rank,
            userId: entry.userId,
            userName: entry.userName,
            score: entry.score ?? entry.bestScore ?? 0,
            percentageScore: entry.percentageScore ?? entry.bestScore ?? entry.score ?? 0,
            completedAt: entry.completedAt,
        }))

        return {
            ...response,
            data: {
                examId: response?.data?.examId ?? examId,
                examTitle: response?.data?.examTitle ?? '',
                leaderboard: normalized,
            },
        }
    }

    // ========== User Exams ==========

    static async getAvailableExams(): Promise<{
        success: boolean
        data: Array<Exam & {
            userAttempts: number
            bestScore: number | null
            hasPassed: boolean
        }>
    }> {
        return this.request('/exams')
    }

    static async getExamDetails(examId: string): Promise<{
        success: boolean
        data: Exam & {
            questionsCount: number
            userAttempts: Array<{
                id: string
                attemptNumber: number
                status: string
                percentageScore: number | null
                passed: boolean | null
                submittedAt: string | null
            }>
            canAttempt: boolean
            remainingAttempts: number
        }
    }> {
        return this.request(`/exams/${examId}`)
    }

    static async startExamAttempt(examId: string): Promise<{
        success: boolean
        data: {
            attemptId: string
            examId: string
            attemptNumber: number
            startedAt: string
            expiresAt: string | null
            timeLimit: number | null
            totalQuestions: number
            questions: Array<{
                id: string
                type: ExamQuestionType
                question: string
                options: string[] | null
                points: number
                order: number
                maxWords?: number
                attachmentFilename?: string | null
                attachmentMimeType?: string | null
                attachmentUrl?: string | null
            }>
        }
    }> {
        return this.request(`/exams/${examId}/start`, {
            method: 'POST',
        })
    }

    static async saveExamAnswer(examId: string, payload: {
        attemptId: string
        questionId: string
        answer?: string
        selectedOption?: number
    }): Promise<{ success: boolean }> {
        return this.request(`/exams/${examId}/answer`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    }

    static async createExerciseUploadUrl(examId: string, payload: {
        attemptId: string
        questionId: string
    }): Promise<{ success: boolean; data: { uploadUrl: string; key: string; bucket: string; contentType: string; expiresIn: number } }> {
        return this.request(`/exams/${examId}/exercise/upload-url`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    }

    static async confirmExerciseUpload(examId: string, payload: {
        attemptId: string
        questionId: string
        durationSeconds?: number
    }): Promise<{ success: boolean; data: { answerId: string; recordingS3Key: string; bucket: string; recordingMimeType: string | null; recordingSizeBytes: number | null } }> {
        return this.request(`/exams/${examId}/exercise/confirm`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
    }

    static async getExerciseAccessUrl(examId: string, payload: {
        attemptId: string
        questionId: string
    }): Promise<{ success: boolean; data: { url: string } }> {
        const qs = new URLSearchParams(payload).toString()
        return this.request(`/exams/${examId}/exercise/access-url?${qs}`)
    }

    static async submitExam(examId: string, attemptId: string): Promise<{
        success: boolean
        data: {
            attemptId: string
            status: string
            rawScore: number | null
            percentageScore: number | null
            passed: boolean | null
            totalQuestions: number
            correctAnswers: number
            showResults: boolean
        }
    }> {
        return this.request(`/exams/${examId}/submit`, {
            method: 'POST',
            body: JSON.stringify({ attemptId }),
        })
    }

    static async getExamResult(examId: string, attemptId?: string): Promise<{
        success: boolean
        data: {
            attemptId: string
            examTitle: string
            attemptNumber: number
            status: string
            startedAt: string
            submittedAt: string | null
            rawScore: number | null
            percentageScore: number | null
            passed: boolean | null
            totalScore: number
            passingScore: number
            allowReview: boolean
            maxAttempts: number
            attemptsUsed: number
            reviewUnlocked: boolean
            answers?: Array<{
                questionId: string
                question: string
                type: ExamQuestionType
                userAnswer: string | null
                selectedOption: number | null
                correctAnswer: string | null
                isCorrect: boolean | null
                pointsAwarded: number | null
                maxPoints: number
                explanation: string | null
            }>
        }
    }> {
        const query = attemptId ? `?attemptId=${attemptId}` : ''
        return this.request(`/exams/${examId}/result${query}`)
    }

    static async getUserExamAttempts(examId: string): Promise<{
        success: boolean
        data: Array<{
            id: string
            attemptNumber: number
            status: string
            startedAt: string
            submittedAt: string | null
            percentageScore: number | null
            passed: boolean | null
        }>
    }> {
        return this.request(`/exams/${examId}/attempts`)
    }

    static async getCurrentAttempt(examId: string): Promise<{
        success: boolean
        data: {
            attemptId: string
            examId: string
            attemptNumber: number
            startedAt: string
            expiresAt: string | null
            timeLimit: number | null
            totalQuestions: number
            questions: Array<{
                id: string
                type: ExamQuestionType
                question: string
                options: string[] | null
                points: number
                order: number
                maxWords?: number
                attachmentFilename?: string | null
                attachmentMimeType?: string | null
                attachmentUrl?: string | null
            }>
            existingAnswers: Record<string, {
                answer: string | null
                selectedOption: number | null
                recordingS3Key?: string | null
                recordingStatus?: 'PENDING_UPLOAD' | 'UPLOADED' | 'FAILED' | null
            }>
        } | null
    }> {
        return this.request(`/exams/${examId}/current`)
    }

    // ========== Certificates ==========

    static async getUserCertificates(): Promise<{
        success: boolean
        data: Array<{
            id: string
            certificateNumber: string
            userId: string
            userName: string
            courseId: string | null
            courseTitle: string | null
            examId: string | null
            examTitle: string
            score: number
            totalScore: number
            percentageScore: number
            issueDate: string
            pdfUrl: string | null
            status: 'ISSUED' | 'REVOKED'
            revokedAt?: string | null
            certificateTitle?: string | null
            badgeMode?: 'AUTO' | 'UPLOADED' | null
            badgeUrl?: string | null
        }>
    }> {
        return this.request('/certificates')
    }

    static async getCertificate(certificateId: string): Promise<{
        success: boolean
        data: {
            id: string
            certificateNumber: string
            userId: string
            userName: string
            courseId: string | null
            courseTitle: string | null
            examId: string | null
            examTitle: string
            score: number
            totalScore: number
            percentageScore: number
            issueDate: string
            pdfUrl: string | null
            status: 'ISSUED' | 'REVOKED'
            revokedAt?: string | null
            certificateTitle?: string | null
            badgeMode?: 'AUTO' | 'UPLOADED' | null
            badgeUrl?: string | null
            badgeStyle?: any | null
        }
    }> {
        return this.request(`/certificates/${certificateId}`)
    }

    static async generateCertificate(attemptId: string, sendEmail = true): Promise<{
        success: boolean
        data: {
            certificate: {
                id: string
                certificateNumber: string
                userName: string
                examTitle: string
                score: number
                totalScore: number
                percentageScore: number
                issueDate: string
                pdfUrl: string | null
                status: 'ISSUED' | 'REVOKED'
            }
            pdfUrl: string | null
            emailSent: boolean
        }
    }> {
        return this.request('/certificates', {
            method: 'POST',
            body: JSON.stringify({ attemptId, sendEmail }),
        })
    }

    static async verifyCertificate(certificateNumber: string): Promise<{
        success: boolean
        data: {
            valid: boolean
            message?: string
            certificate?: {
                certificateNumber: string
                userName: string
                examTitle: string
                issueDate: string
                percentageScore: number
            }
        }
    }> {
        return this.request(`/certificates/verify/${encodeURIComponent(certificateNumber)}`)
    }

    static async adminRevokeCertificate(certificateId: string): Promise<{
        success: boolean
        data: { id: string; status: 'REVOKED'; revokedAt: string; certificateNumber: string }
    }> {
        return this.request(`/admin/certificates/${certificateId}/revoke`, {
            method: 'POST',
            body: JSON.stringify({}),
        })
    }

    static async adminReissueCertificate(certificateId: string): Promise<{
        success: boolean
        data: { id: string; status: 'ISSUED'; issueDate: string; pdfUrl: string | null; certificateNumber: string }
    }> {
        return this.request(`/admin/certificates/${certificateId}/reissue`, {
            method: 'POST',
            body: JSON.stringify({}),
        })
    }
}
