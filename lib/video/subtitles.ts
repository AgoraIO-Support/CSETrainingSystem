export function isVttUrl(url?: string | null): boolean {
    if (!url) return false

    try {
        return new URL(url).pathname.toLowerCase().endsWith('.vtt')
    } catch {
        return url.toLowerCase().split('?')[0].endsWith('.vtt')
    }
}

export function getUrlBasename(url?: string | null): string | null {
    if (!url) return null

    try {
        const pathname = new URL(url).pathname
        const last = pathname.split('/').pop() ?? ''
        const decoded = decodeURIComponent(last)
        if (!decoded) return null
        return decoded.toLowerCase().replace(/\.[^.]+$/, '')
    } catch {
        const noQuery = url.split('?')[0]
        const last = noQuery.split('/').pop() ?? ''
        if (!last) return null
        return last.toLowerCase().replace(/\.[^.]+$/, '')
    }
}

export function getAssetBasename(asset?: { title?: string | null; url?: string | null } | null): string | null {
    if (!asset) return null

    const title = asset.title?.trim()
    if (title) {
        return title.toLowerCase().replace(/\.[^.]+$/, '')
    }

    return getUrlBasename(asset.url ?? null)
}
