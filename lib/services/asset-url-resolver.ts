import { FileService } from './file.service'

const ABSOLUTE_URL_REGEX = /^https?:\/\//i

const isAbsoluteUrl = (value?: string | null) =>
    typeof value === 'string' && ABSOLUTE_URL_REGEX.test(value)

export function resolveAssetUrl(asset: {
    cloudfrontUrl?: string | null
    url?: string | null
    s3Key?: string | null
}): string | null {
    const primary = asset.cloudfrontUrl ?? asset.url
    if (isAbsoluteUrl(primary)) {
        return primary as string
    }

    const key = primary || asset.s3Key
    return key ? FileService.getAssetPublicUrl(key) : null
}

export function resolveMediaUrl(url?: string | null, key?: string | null): string | null {
    if (isAbsoluteUrl(url)) {
        return url as string
    }

    const candidate = key || url
    return candidate ? FileService.getAssetPublicUrl(candidate) : null
}
