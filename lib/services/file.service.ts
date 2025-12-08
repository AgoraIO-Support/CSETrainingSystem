import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import s3Client, { S3_BUCKET_NAME, CLOUDFRONT_DOMAIN, S3_ASSET_BASE_PREFIX, ASSET_PUBLIC_BASE_URL } from '@/lib/aws-s3'
import { v4 as uuidv4 } from 'uuid'

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
            ACL: 'public-read',
        })

        // Generate presigned URL (valid for 1 hour)
        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })

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
            ACL: 'public-read',
        })

        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })

        return {
            uploadUrl,
            key,
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
    }) {
        const folder = params.assetType || 'documents'
        const prefix = joinPathSegments(S3_ASSET_BASE_PREFIX, folder)
        const key = joinPathSegments(prefix, `${uuidv4()}-${params.filename}`)

        const command = new PutObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: key,
            ContentType: params.contentType,
            ACL: 'public-read',
        })

        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })

        return {
            uploadUrl,
            key,
            url: this.getAssetPublicUrl(key),
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

        return await getSignedUrl(s3Client, command, { expiresIn: 3600 })
    }

    /**
     * Delete a file from S3
     */
    static async deleteFile(key: string): Promise<void> {
        const command = new DeleteObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: key,
        })

        await s3Client.send(command)
    }
}
