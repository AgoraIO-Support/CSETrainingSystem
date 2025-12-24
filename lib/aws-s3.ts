import { S3Client } from '@aws-sdk/client-s3'

const explicitCredentials =
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined

// In AWS (ECS/EC2/Lambda), prefer the default credential provider chain (task role/instance role).
// Locally, you can still use env vars (above) or AWS_PROFILE via the default chain.
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: explicitCredentials,
})

const sanitizePath = (value?: string | null) => {
    if (!value) return ''
    return value.replace(/^\/+|\/+$/g, '')
}

export const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'agora-cse-training-videos'
export const CLOUDFRONT_DOMAIN = (process.env.AWS_CLOUDFRONT_DOMAIN || '').replace(/\/$/, '')
export const S3_ASSET_BASE_PREFIX = sanitizePath(process.env.AWS_S3_ASSET_PREFIX || 'course-assets')
export const ASSET_PUBLIC_BASE_URL = (process.env.AWS_ASSET_PUBLIC_BASE_URL || '').replace(/\/$/, '')
export const ASSET_S3_BUCKET_NAME = process.env.AWS_S3_ASSET_BUCKET_NAME || S3_BUCKET_NAME

export default s3Client
