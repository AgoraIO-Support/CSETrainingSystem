import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getSignedUrl as getCloudFrontSignedUrl } from 'aws-cloudfront-sign'
import s3Client, {
    S3_BUCKET_NAME,
    CLOUDFRONT_DOMAIN,
    S3_ASSET_BASE_PREFIX,
    ASSET_PUBLIC_BASE_URL,
    ASSET_S3_BUCKET_NAME,
} from '@/lib/aws-s3'
import { v4 as uuidv4 } from 'uuid'
import { log, timeAsync } from '@/lib/logger'

type AssetDeliveryMode = 'public' | 's3_presigned' | 'cloudfront_signed'

const joinPathSegments = (...segments: (string | undefined | null)[]) => {
    return segments
        .filter(Boolean)
        .map(segment => segment!.replace(/^\/+|\/+$/g, ''))
        .filter(segment => segment.length > 0)
        .join('/')
}

const readInt = (value: string | undefined, fallback: number) => {
    if (!value) return fallback
    const n = Number.parseInt(value, 10)
    return Number.isFinite(n) ? n : fallback
}

const getDeliveryMode = (): AssetDeliveryMode => {
    const raw = (process.env.CSE_ASSET_DELIVERY_MODE || '').trim()
    if (raw === 'cloudfront_signed' || raw === 's3_presigned' || raw === 'public') return raw
    // Sensible defaults:
    // - Local dev should "just work" without CloudFront by using S3 presigned GET URLs.
    // - Production should default to CloudFront signed URLs for private `/assets/*`.
    return process.env.NODE_ENV === 'production' ? 'cloudfront_signed' : 's3_presigned'
}

const getAssetUrlTtlSeconds = (): number => {
    // 12 hours default: long enough for learning/exam sessions.
    const ttl = readInt(process.env.CSE_ASSET_URL_TTL_SECONDS, 60 * 60 * 12)
    // Clamp to avoid surprising values.
    return Math.max(60, Math.min(ttl, 60 * 60 * 24 * 7))
}

const getCloudFrontSignerConfig = () => {
    const keyPairId = (process.env.CLOUDFRONT_KEY_PAIR_ID || '').trim()
    const privateKeyString = (process.env.CLOUDFRONT_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim()
    if (!keyPairId || !privateKeyString) {
        throw new Error('CLOUDFRONT_SIGNING_NOT_CONFIGURED')
    }
    return { keyPairId, privateKeyString }
}

export class FileService {
    /**
     * Generate presigned URL for video upload
     */
    static async generateUploadUrl(params: {
        filename: string
        contentType: string
        lessonId?: string
    }) {
        const key = `videos/${uuidv4()}-${params.filename}`

        const command = new PutObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: key,
            ContentType: params.contentType,
            ServerSideEncryption: 'AES256',
        })

        // Generate presigned URL (valid for 1 hour)
        const uploadUrl = await timeAsync(
            'S3',
            'presign PutObject',
            { bucket: S3_BUCKET_NAME, key, contentType: params.contentType, expiresIn: 3600 },
            () => getSignedUrl(s3Client, command, { expiresIn: 3600 })
        )

        return {
            uploadUrl,
            key,
            expiresIn: 3600,
        }
    }

    /**
     * Generate presigned URL for subtitle (VTT) upload
     */
    static async generateSubtitleUploadUrl(params: {
        filename: string
        lessonId?: string
    }) {
        const key = `subtitles/${uuidv4()}-${params.filename}`

        const command = new PutObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: key,
            ContentType: 'text/vtt',
            ServerSideEncryption: 'AES256',
        })

        const uploadUrl = await timeAsync(
            'S3',
            'presign PutObject',
            { bucket: S3_BUCKET_NAME, key, contentType: 'text/vtt', expiresIn: 3600 },
            () => getSignedUrl(s3Client, command, { expiresIn: 3600 })
        )

        return {
            uploadUrl,
            key,
            expiresIn: 3600,
        }
    }

    /**
     * Generate presigned URL for transcript (VTT) upload for RAG
     * Stored in lesson-assets/transcripts folder for organization
     */
    static async generateTranscriptUploadUrl(params: {
        filename: string
        lessonId: string
        key?: string
    }) {
        const key =
            params.key ??
            (() => {
                const lessonPrefix = `lesson-assets/${params.lessonId}`
                const prefix = joinPathSegments(S3_ASSET_BASE_PREFIX, lessonPrefix, 'transcripts')
                return joinPathSegments(prefix, `${uuidv4()}-${params.filename}`)
            })()

        const command = new PutObjectCommand({
            Bucket: ASSET_S3_BUCKET_NAME,
            Key: key,
            ContentType: 'text/vtt',
            ServerSideEncryption: 'AES256',
        })

        const uploadUrl = await timeAsync(
            'S3',
            'presign PutObject',
            { bucket: ASSET_S3_BUCKET_NAME, key, contentType: 'text/vtt', expiresIn: 3600 },
            () => getSignedUrl(s3Client, command, { expiresIn: 3600 })
        )

        return {
            uploadUrl,
            key,
            bucket: ASSET_S3_BUCKET_NAME,
            // Do not persist this URL in DB (it may require signing in production).
            // Always compute an access URL at read-time based on `CSE_ASSET_DELIVERY_MODE`.
            url: this.getAssetPublicUrl(key),
            expiresIn: 3600,
        }
    }

    /**
     * Generate presigned URL for general lesson asset upload
     */
    static async generateAssetUploadUrl(params: {
        filename: string
        contentType: string
        assetType?: 'documents' | 'presentations' | 'videos' | 'other'
        lessonId?: string
        key?: string
    }) {
        const key =
            params.key ??
            (() => {
                const folder = params.assetType || 'documents'
                const lessonPrefix = params.lessonId ? `lesson-assets/${params.lessonId}` : undefined
                const prefix = joinPathSegments(S3_ASSET_BASE_PREFIX, lessonPrefix, folder)
                return joinPathSegments(prefix, `${uuidv4()}-${params.filename}`)
            })()

        const command = new PutObjectCommand({
            Bucket: ASSET_S3_BUCKET_NAME,
            Key: key,
            ContentType: params.contentType,
            ServerSideEncryption: 'AES256',
        })

        const uploadUrl = await timeAsync(
            'S3',
            'presign PutObject',
            { bucket: ASSET_S3_BUCKET_NAME, key, contentType: params.contentType, expiresIn: 3600 },
            () => getSignedUrl(s3Client, command, { expiresIn: 3600 })
        )

        return {
            uploadUrl,
            key,
            bucket: ASSET_S3_BUCKET_NAME,
            // Do not persist this URL in DB (it may require signing in production).
            // Always compute an access URL at read-time based on `CSE_ASSET_DELIVERY_MODE`.
            url: this.getAssetPublicUrl(key),
            mimeType: params.contentType,
            expiresIn: 3600,
        }
    }

    /**
     * Get CloudFront URL for a file
     */
    static getCloudFrontUrl(key: string): string {
        const domain = (CLOUDFRONT_DOMAIN || '').trim().replace(/^https?:\/\//, '')
        const domainIsValid = /^[a-zA-Z0-9.-]+$/.test(domain)
        if (domain && domainIsValid) {
            return `https://${domain}/${key}`
        }
        // Fallback to S3 direct URL
        return this.getS3Url(key)
    }

    static getS3Url(key: string): string {
        return `https://${S3_BUCKET_NAME}.s3.amazonaws.com/${key}`
    }

    static getAssetPublicUrl(key: string): string {
        if (ASSET_PUBLIC_BASE_URL) {
            return `${ASSET_PUBLIC_BASE_URL}/${key}`
        }
        return this.getCloudFrontUrl(key)
    }

    /**
     * Get a time-limited URL that can actually be fetched by browsers.
     *
     * Modes:
     * - `public`: returns an unsigned CloudFront/S3 URL (dev convenience)
     * - `s3_presigned`: returns S3 presigned GET (recommended for local dev)
     * - `cloudfront_signed`: returns CloudFront signed URL (recommended for production)
     */
    static async getAssetAccessUrl(key: string): Promise<string> {
        const normalizedKey = key.replace(/^\/+/, '')
        const mode = getDeliveryMode()

        if (mode === 'public') {
            return this.getAssetPublicUrl(normalizedKey)
        }

        const ttlSeconds = getAssetUrlTtlSeconds()

        if (mode === 's3_presigned') {
            const command = new GetObjectCommand({
                Bucket: ASSET_S3_BUCKET_NAME,
                Key: normalizedKey,
            })
            return await timeAsync(
                'S3',
                'presign GetObject',
                { bucket: ASSET_S3_BUCKET_NAME, key: normalizedKey, expiresIn: ttlSeconds },
                () => getSignedUrl(s3Client, command, { expiresIn: ttlSeconds })
            )
        }

        // cloudfront_signed
        const domain = (CLOUDFRONT_DOMAIN || '').trim().replace(/^https?:\/\//, '')
        if (!domain) {
            throw new Error('CLOUDFRONT_DOMAIN_NOT_CONFIGURED')
        }

        const { keyPairId, privateKeyString } = getCloudFrontSignerConfig()
        const url = `https://${domain}/${normalizedKey}`
        const epochExpires = Math.floor(Date.now() / 1000) + ttlSeconds

        return getCloudFrontSignedUrl(url, {
            keypairId: keyPairId,
            privateKeyString,
            expireTime: epochExpires,
        })
    }

    /**
     * Generate temporary signed URL for video access (1 hour validity)
     */
    static async generateVideoAccessUrl(key: string): Promise<string> {
        // Back-compat helper: use the new delivery-mode aware accessor.
        // NOTE: despite the name, this returns a GET access URL (not an upload URL).
        return this.getAssetAccessUrl(key)
    }

    /**
     * Generate a presigned PUT URL to upload an object at a specific key (used by admin upload flows).
     */
    static async generatePresignedPutUrl(params: {
        bucket?: string
        key: string
        contentType: string
        expiresInSeconds?: number
    }) {
        const bucket = params.bucket || ASSET_S3_BUCKET_NAME
        const expiresIn = params.expiresInSeconds ?? 60 * 30
        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: params.key,
            ContentType: params.contentType,
            ServerSideEncryption: 'AES256',
        })

        return await timeAsync(
            'S3',
            'presign PutObject',
            { bucket, key: params.key, contentType: params.contentType, expiresIn },
            () => getSignedUrl(s3Client, command, { expiresIn })
        )
    }

    /**
     * Delete a file from S3
     */
    static async deleteFile(key: string, bucket: string = ASSET_S3_BUCKET_NAME): Promise<void> {
        const command = new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
        })

        log('S3', 'info', 'deleteObject', { bucket, key })
        await timeAsync('S3', 'deleteObject result', { bucket, key }, () => s3Client.send(command).then(() => undefined))
    }
}
