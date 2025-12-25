import { config } from 'dotenv'
config()

function requireEnv(name: string): string {
    const value = process.env[name]
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`)
    }
    return value
}

function optionalEnv(name: string): string | undefined {
    return process.env[name]
}

function stripWrappingQuotes(value: string): string {
    const trimmed = value.trim()
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1)
    }
    return trimmed
}

function normalizeMultilineEnv(value: string): string {
    return stripWrappingQuotes(value).replace(/\\n/g, '\n')
}

export const appConfig = {
    port: parseInt(process.env.PORT || '8080', 10),
    databaseUrl: requireEnv('DATABASE_URL'),
    s3: {
        bucket: process.env.S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || (() => { throw new Error('Missing S3 bucket (set S3_BUCKET or AWS_S3_BUCKET_NAME)') })(),
        region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1',
        uploadPrefix: process.env.UPLOAD_PREFIX || process.env.AWS_S3_ASSET_PREFIX || 'materials',
        legacyLessonFolder: process.env.LEGACY_LESSON_FOLDER || 'lesson-assets',
        enableLegacySweepOnLessonDelete: (process.env.ENABLE_LEGACY_SWEEP_ON_LESSON_DELETE || 'false') === 'true',
    },
    cloudfront: {
        domain: requireEnv('CLOUDFRONT_DOMAIN'),
        keyPairId: stripWrappingQuotes(requireEnv('CLOUDFRONT_KEY_PAIR_ID')),
        privateKey: normalizeMultilineEnv(requireEnv('CLOUDFRONT_PRIVATE_KEY')),
        cookieTtlHours: parseInt(process.env.CLOUDFRONT_SIGNED_COOKIE_TTL_HOURS || '12', 10),
    },
    auth: {
        jwtPublicKey: optionalEnv('JWT_PUBLIC_KEY') ? normalizeMultilineEnv(optionalEnv('JWT_PUBLIC_KEY')!) : undefined,
        jwtSecret: optionalEnv('JWT_SECRET') ? stripWrappingQuotes(optionalEnv('JWT_SECRET')!) : undefined,
    },
}

if (!appConfig.auth.jwtPublicKey && !appConfig.auth.jwtSecret) {
    throw new Error('Missing JWT configuration: provide JWT_PUBLIC_KEY (RS256) or JWT_SECRET (HS256)')
}
