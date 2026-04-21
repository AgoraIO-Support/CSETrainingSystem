export const LEARNING_SERIES_TYPES = [
    'WEEKLY_DRILL',
    'CASE_STUDY',
    'KNOWLEDGE_SHARING',
    'FAQ_SHARE',
    'RELEASE_READINESS',
    'QUARTERLY_FINAL',
    'YEAR_END_FINAL',
] as const

export const LEARNING_EVENT_FORMATS = [
    'CASE_STUDY',
    'KNOWLEDGE_SHARING',
    'FAQ_SHARE',
    'RELEASE_BRIEFING',
    'QUIZ_REVIEW',
    'FINAL_EXAM',
    'WORKSHOP',
] as const

export type LearningSeriesTypeValue = (typeof LEARNING_SERIES_TYPES)[number]
export type LearningEventFormatValue = (typeof LEARNING_EVENT_FORMATS)[number]

export const SERIES_TYPE_LABELS: Record<LearningSeriesTypeValue, string> = {
    WEEKLY_DRILL: 'Weekly Drill',
    CASE_STUDY: 'Case Study',
    KNOWLEDGE_SHARING: 'Knowledge Sharing',
    FAQ_SHARE: 'FAQ Share',
    RELEASE_READINESS: 'Release Readiness',
    QUARTERLY_FINAL: 'Quarterly Final',
    YEAR_END_FINAL: 'Year-end Final',
}

export const EVENT_FORMAT_LABELS: Record<LearningEventFormatValue, string> = {
    CASE_STUDY: 'Case Study',
    KNOWLEDGE_SHARING: 'Knowledge Sharing',
    FAQ_SHARE: 'FAQ Share',
    RELEASE_BRIEFING: 'Release Briefing',
    QUIZ_REVIEW: 'Quiz Review',
    FINAL_EXAM: 'Final Exam',
    WORKSHOP: 'Workshop',
}

type SeriesEventRule = {
    primaryFormat: LearningEventFormatValue
    allowedFormats: readonly LearningEventFormatValue[]
    guidance: string
}

export const SERIES_EVENT_FORMAT_RULES: Record<LearningSeriesTypeValue, SeriesEventRule> = {
    WEEKLY_DRILL: {
        primaryFormat: 'CASE_STUDY',
        allowedFormats: ['CASE_STUDY', 'QUIZ_REVIEW', 'WORKSHOP', 'KNOWLEDGE_SHARING'],
        guidance: 'Weekly drills should stay in practice-oriented formats such as case studies, quiz reviews, workshops, or light knowledge sharing.',
    },
    CASE_STUDY: {
        primaryFormat: 'CASE_STUDY',
        allowedFormats: ['CASE_STUDY', 'QUIZ_REVIEW', 'WORKSHOP'],
        guidance: 'Case-study series should stay anchored in case study sessions, optionally supported by quiz reviews or workshops.',
    },
    KNOWLEDGE_SHARING: {
        primaryFormat: 'KNOWLEDGE_SHARING',
        allowedFormats: ['KNOWLEDGE_SHARING', 'WORKSHOP'],
        guidance: 'Knowledge-sharing series should use knowledge-sharing sessions or workshops, not assessment-heavy formats.',
    },
    FAQ_SHARE: {
        primaryFormat: 'FAQ_SHARE',
        allowedFormats: ['FAQ_SHARE', 'KNOWLEDGE_SHARING'],
        guidance: 'FAQ-share series should focus on FAQ walkthroughs or adjacent knowledge-sharing sessions.',
    },
    RELEASE_READINESS: {
        primaryFormat: 'RELEASE_BRIEFING',
        allowedFormats: ['RELEASE_BRIEFING', 'QUIZ_REVIEW', 'WORKSHOP'],
        guidance: 'Release-readiness series should stay in readiness-oriented formats such as release briefings, quiz reviews, or workshops.',
    },
    QUARTERLY_FINAL: {
        primaryFormat: 'FINAL_EXAM',
        allowedFormats: ['FINAL_EXAM', 'QUIZ_REVIEW'],
        guidance: 'Quarterly final series should center on final exams, with quiz reviews used only as supporting sessions.',
    },
    YEAR_END_FINAL: {
        primaryFormat: 'FINAL_EXAM',
        allowedFormats: ['FINAL_EXAM', 'QUIZ_REVIEW'],
        guidance: 'Year-end final series should center on final exams, with quiz reviews used only as supporting sessions.',
    },
}

export const getAllowedEventFormatsForSeriesType = (
    seriesType?: LearningSeriesTypeValue | null
): LearningEventFormatValue[] => {
    if (!seriesType) {
        return [...LEARNING_EVENT_FORMATS]
    }
    return [...SERIES_EVENT_FORMAT_RULES[seriesType].allowedFormats]
}

export const getDefaultEventFormatForSeriesType = (
    seriesType?: LearningSeriesTypeValue | null
): LearningEventFormatValue => {
    if (!seriesType) {
        return 'CASE_STUDY'
    }
    return SERIES_EVENT_FORMAT_RULES[seriesType].primaryFormat
}

export const isEventFormatAllowedForSeriesType = (
    seriesType: LearningSeriesTypeValue | null | undefined,
    format: LearningEventFormatValue
): boolean => getAllowedEventFormatsForSeriesType(seriesType).includes(format)

export const getSeriesEventFormatGuidance = (
    seriesType?: LearningSeriesTypeValue | null
): string | null => {
    if (!seriesType) {
        return null
    }
    return SERIES_EVENT_FORMAT_RULES[seriesType].guidance
}
