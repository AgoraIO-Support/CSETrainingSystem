/**
 * Admin Exam Content Export Route
 * GET /api/admin/exams/[examId]/content-export - Export exam questions and answer key to Markdown
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '@/lib/auth-middleware'
import { ExamService } from '@/lib/services/exam.service'
import { stripRichTextToPlainText } from '@/lib/rich-text'
import type { ExamQuestion } from '@/types'

type RouteContext = {
  params: Promise<{ examId: string }>
}

const questionTypeLabels: Record<ExamQuestion['type'], string> = {
  SINGLE_CHOICE: 'Single Choice',
  MULTIPLE_CHOICE: 'Multiple Choice',
  TRUE_FALSE: 'True/False',
  FILL_IN_BLANK: 'Fill in Blank',
  ESSAY: 'Essay',
  EXERCISE: 'Exercise',
}

function toPlainText(value?: string | null): string {
  return stripRichTextToPlainText(value || '').replace(/\r\n/g, '\n').trim()
}

function formatChoiceAnswer(question: ExamQuestion): string {
  const indexes = (question.correctAnswer || '')
    .split(',')
    .map(part => Number.parseInt(part.trim(), 10))
    .filter(idx => Number.isFinite(idx))

  if (!indexes.length) {
    return question.correctAnswer || '(missing)'
  }

  return indexes
    .map(idx => {
      const optionLabel = String.fromCharCode(65 + idx)
      const optionText = toPlainText(question.options?.[idx] || '')
      return optionText ? `${optionLabel}. ${optionText}` : optionLabel
    })
    .join(', ')
}

function formatAnswer(question: ExamQuestion): string {
  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
    return formatChoiceAnswer(question)
  }

  if (question.type === 'TRUE_FALSE') {
    if (question.correctAnswer === 'true') return 'True'
    if (question.correctAnswer === 'false') return 'False'
    return question.correctAnswer || '(missing)'
  }

  if (question.type === 'FILL_IN_BLANK') {
    return question.correctAnswer || '(missing)'
  }

  if (question.type === 'ESSAY') {
    return toPlainText(question.sampleAnswer) || '(sample answer missing)'
  }

  return question.type === 'EXERCISE'
    ? 'Manual review (exercise recording)'
    : question.correctAnswer || '(missing)'
}

function renderQuestionBlock(question: ExamQuestion, index: number): string {
  const lines: string[] = [
    `## Q${index + 1}. ${questionTypeLabels[question.type]}`,
    '',
    toPlainText(question.question) || '(question text missing)',
    '',
    `- Points: ${question.points}`,
  ]

  if (question.difficulty) {
    lines.push(`- Difficulty: ${question.difficulty}`)
  }

  if (question.maxWords) {
    lines.push(`- Max Words: ${question.maxWords}`)
  }

  if (question.attachmentUrl) {
    const attachmentLabel = question.attachmentFilename || 'Attachment'
    lines.push(`- Attachment: [${attachmentLabel}](${question.attachmentUrl})`)
  }

  if (
    (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') &&
    question.options?.length
  ) {
    lines.push('', '### Options', '')
    question.options.forEach((option, optionIndex) => {
      lines.push(`${String.fromCharCode(65 + optionIndex)}. ${toPlainText(option)}`)
    })
  }

  lines.push('', '### Answer', '', formatAnswer(question))

  if (question.explanation) {
    lines.push('', '### Explanation', '', toPlainText(question.explanation))
  }

  if (question.rubric) {
    lines.push('', '### Rubric', '', toPlainText(question.rubric))
  }

  if (question.type === 'ESSAY' && question.sampleAnswer) {
    lines.push('', '### Sample Answer', '', toPlainText(question.sampleAnswer))
  }

  if (question.type === 'ESSAY' && question.gradingCriteria?.length) {
    lines.push('', '### Key Grading Points', '')
    question.gradingCriteria.forEach((criterion, criterionIndex) => {
      const requiredText = criterion.required ? ' [Required]' : ''
      lines.push(`${criterionIndex + 1}. ${criterion.title} (${criterion.maxPoints} pts)${requiredText}`)
      if (criterion.description?.trim()) {
        lines.push(`   - Description: ${criterion.description.trim()}`)
      }
      if (criterion.guidance?.trim()) {
        lines.push(`   - Guidance: ${criterion.guidance.trim()}`)
      }
    })
  }

  return lines.join('\n')
}

export const GET = withAdminAuth(
  async (_req: NextRequest, _user, context: RouteContext) => {
    try {
      const { examId } = await context.params
      const [exam, rawQuestions] = await Promise.all([
        ExamService.getExamById(examId),
        ExamService.getQuestions(examId),
      ])

      if (!exam) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'EXAM_NOT_FOUND',
              message: 'Exam not found',
            },
          },
          { status: 404 }
        )
      }

      const questions = rawQuestions as ExamQuestion[]
      const sections: string[] = [
        `# ${exam.title}`,
        '',
        `- Status: ${exam.status}`,
        `- Questions: ${questions.length}`,
        `- Total Score: ${exam.totalScore}`,
        `- Passing Score: ${exam.passingScore}`,
        `- Exported At: ${new Date().toISOString()}`,
      ]

      if (exam.description) {
        sections.push('', '## Description', '', toPlainText(exam.description))
      }

      if (exam.instructions) {
        sections.push('', '## Instructions', '', toPlainText(exam.instructions))
      }

      sections.push('', '## Questions', '')

      if (questions.length === 0) {
        sections.push('_No questions configured yet._')
      } else {
        sections.push(questions.map((question, index) => renderQuestionBlock(question, index)).join('\n\n'))
      }

      const filename = `exam-content-${exam.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.md`

      return new NextResponse(sections.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    } catch (error) {
      console.error('Exam content export error:', error)

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EXPORT_002',
            message: 'Failed to export exam content',
          },
        },
        { status: 500 }
      )
    }
  }
)
