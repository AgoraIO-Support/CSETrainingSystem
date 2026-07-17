export type AnalyticsActivityMetrics = {
    activeUsers: number
    newEnrollments: number
    completedCourses: number
    totalViews: number
    aiInteractions: number
}

export const hasRecordedAnalyticsActivity = (activity: AnalyticsActivityMetrics) =>
    activity.activeUsers > 0 ||
    activity.newEnrollments > 0 ||
    activity.completedCourses > 0 ||
    activity.totalViews > 0 ||
    activity.aiInteractions > 0

