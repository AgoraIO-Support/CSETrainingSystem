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
        uploadPrefix: requireEnv('AWS_S3_ASSET_PREFIX'),
        legacyLessonFolder: process.env.LEGACY_LESSON_FOLDER || 'lesson-assets',
        enableLegacySweepOnLessonDelete: (process.env.ENABLE_LEGACY_SWEEP_ON_LESSON_DELETE || 'false') === 'true',
    },
    // Optional (only required if you use CloudFront-signed cookies/URLs via the backend routes)
    cloudfront: (() => {
        const domain = (optionalEnv('CLOUDFRONT_DOMAIN') || '').trim()
        const keyPairIdRaw = optionalEnv('CLOUDFRONT_KEY_PAIR_ID')
        const privateKeyRaw = optionalEnv('CLOUDFRONT_PRIVATE_KEY')

        const keyPairId = keyPairIdRaw ? stripWrappingQuotes(keyPairIdRaw) : ''
        const privateKey = privateKeyRaw ? normalizeMultilineEnv(privateKeyRaw) : ''

        const hasAny = Boolean(domain || keyPairIdRaw || privateKeyRaw)
        const hasAll = Boolean(domain && keyPairId && privateKey)

        if (hasAny && !hasAll) {
            throw new Error(
                'Incomplete CloudFront config: set CLOUDFRONT_DOMAIN, CLOUDFRONT_KEY_PAIR_ID, and CLOUDFRONT_PRIVATE_KEY (or set none to disable CloudFront features).'
            )
        }

        return {
            enabled: hasAll,
            domain,
            keyPairId,
            privateKey,
            cookieTtlHours: parseInt(process.env.CLOUDFRONT_SIGNED_COOKIE_TTL_HOURS || '12', 10),
        }
    })(),
    auth: {
        jwtPublicKey: optionalEnv('JWT_PUBLIC_KEY') ? normalizeMultilineEnv(optionalEnv('JWT_PUBLIC_KEY')!) : undefined,
        jwtSecret: optionalEnv('JWT_SECRET') ? stripWrappingQuotes(optionalEnv('JWT_SECRET')!) : undefined,
    },
}

if (!appConfig.auth.jwtPublicKey && !appConfig.auth.jwtSecret) {
    throw new Error('Missing JWT configuration: provide JWT_PUBLIC_KEY (RS256) or JWT_SECRET (HS256)')
}
