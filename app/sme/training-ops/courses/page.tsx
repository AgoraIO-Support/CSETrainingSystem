'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { CourseManagementList } from '@/components/course/course-management-list'

export default function SmeTrainingOpsCoursesPage() {
    return (
        <DashboardLayout>
            <CourseManagementList
                variant="sme"
                pageTitle="Managed Courses"
                pageDescription="Create and manage courses within your SME scope."
                listTitle="My Created Courses"
                listDescription="Manage your SME course library with the same controls as the admin course list."
            />
        </DashboardLayout>
    )
}
