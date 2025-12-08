import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSignedCookies } from 'aws-cloudfront-sign'
import { addHours } from 'date-fns'
import { requireEnrollment } from '../../middleware/auth.js'
import { appConfig } from '../../config/env.js'

const paramsSchema = z.object({ courseId: z.string().uuid() })

export async function cloudfrontCookieRoutes(fastify: FastifyInstance) {
    fastify.get('/:courseId/cf-cookie', { preHandler: [requireEnrollment] }, async (request, reply) => {
        const { courseId } = paramsSchema.parse(request.params)
        const expiresAt = addHours(new Date(), appConfig.cloudfront.cookieTtlHours)
        const epochExpires = Math.floor(expiresAt.getTime() / 1000)
        const policy = JSON.stringify({
            Statement: [
                {
                    Resource: `https://${appConfig.cloudfront.domain}/materials/${courseId}/*`,
                    Condition: { DateLessThan: { 'AWS:EpochTime': epochExpires } },
                },
            ],
        })
        const cookies = getSignedCookies({
            resource: `https://${appConfig.cloudfront.domain}/materials/${courseId}/*`,
            keypairId: appConfig.cloudfront.keyPairId,
            privateKeyString: appConfig.cloudfront.privateKey,
            policy,
        })

        const policyCookie = cookies['CloudFront-Policy']
        const signatureCookie = cookies['CloudFront-Signature']
        const keyPairCookie = cookies['CloudFront-Key-Pair-Id']

        if (!signatureCookie || !keyPairCookie) {
            throw new Error('Failed to generate CloudFront signed cookies')
        }

        reply
            .setCookie('CloudFront-Policy', policyCookie || '', cookieOptions)
            .setCookie('CloudFront-Signature', signatureCookie, cookieOptions)
            .setCookie('CloudFront-Key-Pair-Id', keyPairCookie, cookieOptions)
            .code(204)
            .send()
    })
}

const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 12,
    domain: (process.env.COOKIE_DOMAIN || undefined) as string | undefined,
}
