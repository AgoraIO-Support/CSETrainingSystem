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

    private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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

    // Courses
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

    static async getCourse(id: string): Promise<{ success: boolean; data: Course & { isEnrolled: boolean; progress: number } }> {
        return this.request(`/courses/${id}`)
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
        }
    ) {
        return this.request(`/admin/users/${userId}`, {
            method: 'PATCH',
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
}
