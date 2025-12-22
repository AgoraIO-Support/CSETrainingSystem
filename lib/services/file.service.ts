import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import s3Client, {
    S3_BUCKET_NAME,
    CLOUDFRONT_DOMAIN,
    S3_ASSET_BASE_PREFIX,
    ASSET_PUBLIC_BASE_URL,
    ASSET_S3_BUCKET_NAME,
} from '@/lib/aws-s3'
import { v4 as uuidv4 } from 'uuid'
import { log, timeAsync } from '@/lib/logger'

const joinPathSegments = (...segments: (string | undefined | null)[]) => {
    return segments
        .filter(Boolean)
        .map(segment => segment!.replace(/^\/+|\/+$/g, ''))
        .filter(segment => segment.length > 0)
        .join('/')
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
    }) {
        const lessonPrefix = `lesson-assets/${params.lessonId}`
        const prefix = joinPathSegments(S3_ASSET_BASE_PREFIX, lessonPrefix, 'transcripts')
        const key = joinPathSegments(prefix, `${uuidv4()}-${params.filename}`)

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
            bucket: ASSET_S3_BUCKET_NAME,
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
    }) {
        const folder = params.assetType || 'documents'
        const lessonPrefix = params.lessonId ? `lesson-assets/${params.lessonId}` : undefined
        const prefix = joinPathSegments(S3_ASSET_BASE_PREFIX, lessonPrefix, folder)
        const key = joinPathSegments(prefix, `${uuidv4()}-${params.filename}`)

        const command = new PutObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: key,
            ContentType: params.contentType,
            ServerSideEncryption: 'AES256',
        })

        const uploadUrl = await timeAsync(
            'S3',
            'presign PutObject',
            { bucket: S3_BUCKET_NAME, key, contentType: params.contentType, expiresIn: 3600 },
            () => getSignedUrl(s3Client, command, { expiresIn: 3600 })
        )

        return {
            uploadUrl,
            key,
            bucket: ASSET_S3_BUCKET_NAME,
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
     * Generate temporary signed URL for video access (1 hour validity)
     */
    static async generateVideoAccessUrl(key: string): Promise<string> {
        // If using CloudFront, you might want to use CloudFront signed URLs
        // For now, using S3 presigned URLs
        const command = new PutObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: key,
        })

        return await timeAsync(
            'S3',
            'presign PutObject',
            { bucket: S3_BUCKET_NAME, key, expiresIn: 3600 },
            () => getSignedUrl(s3Client, command, { expiresIn: 3600 })
        )
    }

    /**
     * Delete a file from S3
     */
    static async deleteFile(key: string): Promise<void> {
        const command = new DeleteObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: key,
        })

        log('S3', 'info', 'deleteObject', { bucket: S3_BUCKET_NAME, key })
        await timeAsync('S3', 'deleteObject result', { bucket: S3_BUCKET_NAME, key }, () => s3Client.send(command).then(() => undefined))
    }
}
