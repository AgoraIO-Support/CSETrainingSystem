'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { CourseManagementList } from '@/components/course/course-management-list'

export default function AdminCoursesPage() {
    return (
        <DashboardLayout>
            <CourseManagementList
                variant="admin"
                pageTitle="Course Management"
                pageDescription="Create and manage training courses"
                listTitle="All Courses"
                listDescription="Manage your course library"
            />
        </DashboardLayout>
    )
}
