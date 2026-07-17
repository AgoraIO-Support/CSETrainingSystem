export interface RewardDomainCandidates {
    examDomainId?: string | null
    awardEventDomainId?: string | null
    examEventDomainId?: string | null
    examSeriesDomainId?: string | null
    awardEventSeriesDomainId?: string | null
    examEventSeriesDomainId?: string | null
}

const orderedDomainCandidates = (input: RewardDomainCandidates) => [
    input.examDomainId,
    input.awardEventDomainId,
    input.examEventDomainId,
    input.examSeriesDomainId,
    input.awardEventSeriesDomainId,
    input.examEventSeriesDomainId,
].filter((value): value is string => Boolean(value))

export const resolveRewardDomainId = (input: RewardDomainCandidates) =>
    orderedDomainCandidates(input)[0] ?? null

export const resolveUnambiguousRewardDomainId = (input: RewardDomainCandidates) => {
    const candidates = [...new Set(orderedDomainCandidates(input))]
    return {
        domainId: candidates.length === 1 ? candidates[0] : null,
        candidates,
        conflict: candidates.length > 1,
    }
}
