type TranscriptTrackLike = {
    id?: string
    language?: string | null
    label?: string | null
    isDefaultSubtitle?: boolean | null
    isPrimaryForAI?: boolean | null
    isActive?: boolean | null
    archivedAt?: Date | string | null
    createdAt?: Date | string | null
    updatedAt?: Date | string | null
    s3Key?: string | null
    filename?: string | null
    url?: string | null
}

export function isTranscriptTrackActive(track: Pick<TranscriptTrackLike, 'isActive' | 'archivedAt'>) {
    return track.isActive !== false && !track.archivedAt
}

function toTimestamp(value?: Date | string | null) {
    if (!value) return 0
    return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

export function sortTranscriptTracks<T extends TranscriptTrackLike>(tracks: T[]) {
    return tracks.slice().sort((a, b) => {
        if (Boolean(a.isDefaultSubtitle) !== Boolean(b.isDefaultSubtitle)) {
            return a.isDefaultSubtitle ? -1 : 1
        }
        if (Boolean(a.isPrimaryForAI) !== Boolean(b.isPrimaryForAI)) {
            return a.isPrimaryForAI ? -1 : 1
        }
        return toTimestamp(a.createdAt) - toTimestamp(b.createdAt)
    })
}

export function getActiveTranscriptTracks<T extends TranscriptTrackLike>(tracks: T[]) {
    return sortTranscriptTracks(tracks.filter(isTranscriptTrackActive))
}

export function getPrimaryAiTranscriptTrack<T extends TranscriptTrackLike>(tracks: T[]) {
    return (
        getActiveTranscriptTracks(tracks).find((track) => track.isPrimaryForAI) ??
        getActiveTranscriptTracks(tracks)[0] ??
        null
    )
}

export function getDefaultSubtitleTrack<T extends TranscriptTrackLike>(tracks: T[]) {
    return (
        getActiveTranscriptTracks(tracks).find((track) => track.isDefaultSubtitle) ??
        getActiveTranscriptTracks(tracks)[0] ??
        null
    )
}

export function getTranscriptLabel(track: Pick<TranscriptTrackLike, 'language' | 'label'>) {
    if (track.label?.trim()) return track.label.trim()
    const normalized = normalizeTranscriptLanguage(track.language ?? 'en')
    if (normalized === 'zh-CN') return 'Chinese (Simplified)'
    if (normalized === 'zh-TW') return 'Chinese (Traditional)'
    if (normalized === 'zh') return 'Chinese'
    if (normalized === 'en') return 'English'
    return normalized
}

export function normalizeTranscriptLanguage(language: string) {
    const trimmed = language.trim()
    if (!trimmed) return 'en'
    const [rawBase, ...rest] = trimmed.replace(/_/g, '-').split('-')
    const normalizedBase = rawBase.toLowerCase() === 'cn' ? 'zh' : rawBase.toLowerCase()
    if (rest.length === 0) return normalizedBase
    return `${normalizedBase}-${rest.map((part) => part.toUpperCase()).join('-')}`
}

export function inferTranscriptLanguageFromFilename(filename: string) {
    const basename = filename.replace(/\.[^.]+$/, '')
    const normalized = basename.replace(/[_\s.]+/g, '-')
    const matches = normalized.match(/(?:^|-)((?:zh|cn)-(?:CN|TW)|en-(?:US|GB)|zh|cn|en|ja|ko|fr|de|es)(?:-|$)/i)
    if (!matches) return null
    return normalizeTranscriptLanguage(matches[1])
}
