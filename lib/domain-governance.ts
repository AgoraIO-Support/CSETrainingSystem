export type DomainObjectType = 'PROGRAM' | 'EVENT' | 'COURSE' | 'EXAM'

export type DomainCandidateKind = 'STRUCTURAL' | 'COMPATIBILITY' | 'ALIAS'

export type DomainCandidate = {
    domainId: string | null | undefined
    source: string
    kind?: DomainCandidateKind
}

export type DomainResolutionStatus = 'SCOPED' | 'SUGGESTED' | 'UNSCOPED' | 'CONFLICT'

export type DomainResolution = {
    status: DomainResolutionStatus
    domainId: string | null
    structuralDomainIds: string[]
    compatibilityDomainIds: string[]
    aliasDomainIds: string[]
    candidates: Array<Required<Pick<DomainCandidate, 'domainId' | 'source'>> & { kind: DomainCandidateKind }>
    automaticAssignmentAllowed: boolean
}

export const normalizeDomainAlias = (value: string) =>
    value
        .normalize('NFKD')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

export const resolveDomainCandidates = (input: DomainCandidate[]): DomainResolution => {
    const candidates = input
        .filter((candidate): candidate is DomainCandidate & { domainId: string } => Boolean(candidate.domainId))
        .map((candidate) => ({
            domainId: candidate.domainId,
            source: candidate.source,
            kind: candidate.kind ?? 'STRUCTURAL' as DomainCandidateKind,
        }))

    const structuralDomainIds = [
        ...new Set(candidates.filter((candidate) => candidate.kind === 'STRUCTURAL').map((candidate) => candidate.domainId)),
    ]
    const aliasDomainIds = [
        ...new Set(candidates.filter((candidate) => candidate.kind === 'ALIAS').map((candidate) => candidate.domainId)),
    ]
    const compatibilityDomainIds = [
        ...new Set(candidates.filter((candidate) => candidate.kind === 'COMPATIBILITY').map((candidate) => candidate.domainId)),
    ]

    if (structuralDomainIds.length > 1) {
        return {
            status: 'CONFLICT',
            domainId: null,
            structuralDomainIds,
            compatibilityDomainIds,
            aliasDomainIds,
            candidates,
            automaticAssignmentAllowed: false,
        }
    }

    if (structuralDomainIds.length === 1) {
        const domainId = structuralDomainIds[0]
        const aliasConflict = aliasDomainIds.some((aliasDomainId) => aliasDomainId !== domainId)
        const compatibilityConflict = compatibilityDomainIds.some((compatibilityDomainId) => compatibilityDomainId !== domainId)
        return {
            status: aliasConflict || compatibilityConflict ? 'CONFLICT' : 'SCOPED',
            domainId: aliasConflict || compatibilityConflict ? null : domainId,
            structuralDomainIds,
            compatibilityDomainIds,
            aliasDomainIds,
            candidates,
            automaticAssignmentAllowed: !aliasConflict && !compatibilityConflict,
        }
    }

    if (compatibilityDomainIds.length > 1) {
        return {
            status: 'CONFLICT',
            domainId: null,
            structuralDomainIds,
            compatibilityDomainIds,
            aliasDomainIds,
            candidates,
            automaticAssignmentAllowed: false,
        }
    }

    if (
        compatibilityDomainIds.length === 1 &&
        aliasDomainIds.length > 0 &&
        aliasDomainIds.some((aliasDomainId) => aliasDomainId !== compatibilityDomainIds[0])
    ) {
        return {
            status: 'CONFLICT',
            domainId: null,
            structuralDomainIds,
            compatibilityDomainIds,
            aliasDomainIds,
            candidates,
            automaticAssignmentAllowed: false,
        }
    }

    if (aliasDomainIds.length > 1) {
        return {
            status: 'CONFLICT',
            domainId: null,
            structuralDomainIds,
            compatibilityDomainIds,
            aliasDomainIds,
            candidates,
            automaticAssignmentAllowed: false,
        }
    }

    if (aliasDomainIds.length === 1) {
        return {
            status: 'SUGGESTED',
            domainId: aliasDomainIds[0],
            structuralDomainIds,
            compatibilityDomainIds,
            aliasDomainIds,
            candidates,
            automaticAssignmentAllowed: false,
        }
    }

    return {
        status: 'UNSCOPED',
        domainId: null,
        structuralDomainIds,
        compatibilityDomainIds,
        aliasDomainIds,
        candidates,
        automaticAssignmentAllowed: false,
    }
}

export const assertPublishableDomain = (resolution: DomainResolution, objectType: DomainObjectType) => {
    if (resolution.status === 'CONFLICT') {
        throw new Error(`${objectType}_DOMAIN_CONFLICT`)
    }

    if (resolution.status !== 'SCOPED' || !resolution.domainId) {
        throw new Error(`${objectType}_DOMAIN_REQUIRED`)
    }

    return resolution.domainId
}
