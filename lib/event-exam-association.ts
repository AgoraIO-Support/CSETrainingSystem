type ExamEventAssociationInput = {
    eventId: string
    eventSeriesId: string | null
    eventDomainId: string | null
    examSeriesId: string | null
    examDomainId: string | null
    assessmentKind: 'PRACTICE' | 'READINESS' | 'FORMAL'
    countsTowardPerformance: boolean
}

export const buildExamEventAssociationData = (input: ExamEventAssociationInput) => ({
    learningEventId: input.eventId,
    learningSeriesId: input.examSeriesId ?? input.eventSeriesId,
    productDomainId: input.examDomainId ?? input.eventDomainId,
    assessmentKind: input.assessmentKind,
    countsTowardPerformance: input.countsTowardPerformance,
})
