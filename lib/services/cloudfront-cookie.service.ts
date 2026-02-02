import { getSignedCookies } from 'aws-cloudfront-sign'
import { addHours } from 'date-fns'
import prisma from '@/lib/prisma'
import { CLOUDFRONT_DOMAIN } from '@/lib/aws-s3'

const stripWrappingQuotes = (value: string): string => {
    const trimmed = value.trim()
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1)
    }
    return trimmed
}

// CloudFront configuration
const getCloudFrontConfig = () => {
    const domain = (CLOUDFRONT_DOMAIN || '').trim().replace(/^https?:\/\//, '')
    const keyPairId = stripWrappingQuotes(process.env.CLOUDFRONT_KEY_PAIR_ID || '')
    const privateKey = stripWrappingQuotes(process.env.CLOUDFRONT_PRIVATE_KEY || '')
        .replace(/\\n/g, '\n')
        .trim()
    const cookieTtlHours = parseInt(process.env.CLOUDFRONT_SIGNED_COOKIE_TTL_HOURS || '12', 10)

    const enabled = Boolean(domain && keyPairId && privateKey)

    return {
        enabled,
        domain,
        keyPairId,
        privateKey,
        cookieTtlHours: Number.isFinite(cookieTtlHours) ? cookieTtlHours : 12,
    }
}

export interface SignedCookieOptions {
    httpOnly: boolean
    secure: boolean
    sameSite: 'lax' | 'strict' | 'none'
    path: string
    maxAge: number
    domain?: string
}

export interface SignedCookies {
    'CloudFront-Policy': string
    'CloudFront-Signature': string
    'CloudFront-Key-Pair-Id': string
}

export class CloudFrontCookieService {
    /**
     * Check if CloudFront signed cookies are configured.
     */
    static isConfigured(): boolean {
        return getCloudFrontConfig().enabled
    }

    /**
     * Check if a user is enrolled in a course.
     */
    static async isUserEnrolled(userId: string, courseId: string): Promise<boolean> {
        const enrollment = await prisma.enrollment.findUnique({
            where: {
                userId_courseId: {
                    userId,
                    courseId,
                },
            },
        })
        return Boolean(enrollment)
    }

    /**
     * Generate signed cookies for a course.
     *
     * @param courseId - The course ID to grant access to
     * @returns Object containing the three CloudFront cookies
     * @throws Error if CloudFront is not configured or cookie generation fails
     */
    static generateSignedCookies(courseId: string): SignedCookies {
        const config = getCloudFrontConfig()

        if (!config.enabled) {
            throw new Error('CLOUDFRONT_NOT_CONFIGURED')
        }

        const expiresAt = addHours(new Date(), config.cookieTtlHours)
        const epochExpires = Math.floor(expiresAt.getTime() / 1000)

        const policy = JSON.stringify({
            Statement: [
                {
                    Resource: `https://${config.domain}/materials/${courseId}/*`,
                    Condition: { DateLessThan: { 'AWS:EpochTime': epochExpires } },
                },
            ],
        })

        const cookies = getSignedCookies({
            resource: `https://${config.domain}/materials/${courseId}/*`,
            keypairId: config.keyPairId,
            privateKeyString: config.privateKey,
            policy,
        })

        const signatureCookie = cookies['CloudFront-Signature']
        const keyPairCookie = cookies['CloudFront-Key-Pair-Id']

        if (!signatureCookie || !keyPairCookie) {
            throw new Error('CLOUDFRONT_COOKIE_GENERATION_FAILED')
        }

        return {
            'CloudFront-Policy': cookies['CloudFront-Policy'] || '',
            'CloudFront-Signature': signatureCookie,
            'CloudFront-Key-Pair-Id': keyPairCookie,
        }
    }

    /**
     * Get cookie options for setting CloudFront cookies.
     */
    static getCookieOptions(): SignedCookieOptions {
        const config = getCloudFrontConfig()

        return {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            path: '/',
            maxAge: config.cookieTtlHours * 60 * 60, // Convert hours to seconds
            domain: process.env.COOKIE_DOMAIN || undefined,
        }
    }
}
