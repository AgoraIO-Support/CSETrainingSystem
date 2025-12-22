import { notFound, redirect } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { CourseContent } from '@/components/curriculum/course-content'
import { ApiClient } from '@/lib/api-client'
import { use } from 'react'

async function fetchCourseAndContent(courseId: string) {
  // Validate enrollment via course detail endpoint
  const courseRes = await ApiClient.getCourse(courseId)
  if (!courseRes.data.isEnrolled) {
    redirect(`/courses/${courseId}`)
  }
  const contentRes: any = await ApiClient.getCourseContent(courseId)
  return { course: courseRes.data, content: contentRes.data }
}

export default function CurriculumPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params)
  let course: any = null
  let content: any = null
  try {
    const data = use(fetchCourseAndContent(courseId))
    course = data.course
    content = data.content
  } catch (err) {
    notFound()
  }

  return (
    <DashboardLayout>
      <CourseContent course={course} content={content} />
    </DashboardLayout>
  )
}
