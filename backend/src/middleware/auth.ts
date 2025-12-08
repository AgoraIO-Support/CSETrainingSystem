import { FastifyReply, FastifyRequest } from 'fastify'
import jwt from 'jsonwebtoken'
import { appConfig } from '../config/env.js'
import { AuthUser } from '../types/auth'

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ success: false, error: 'Missing token' })
    }

    const token = authHeader.slice('Bearer '.length)
    try {
        const decoded = verifyJwt(token)
        request.user = {
            id: decoded.sub || decoded.id,
            email: decoded.email,
            role: decoded.role,
        }
    } catch (error) {
        request.log.error({ error }, 'JWT verification failed')
        return reply.status(401).send({ success: false, error: 'Invalid token' })
    }
}

function verifyJwt(token: string) {
    const { jwtPublicKey, jwtSecret } = appConfig.auth
    let decoded: any

    // Prefer HS256 when secret is provided (used by the Next.js app locally)
    if (jwtSecret) {
        try {
            decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] })
            return decoded
        } catch (err) {
            // fall through to RS256
        }
    }

    if (jwtPublicKey) {
        decoded = jwt.verify(token, jwtPublicKey, { algorithms: ['RS256'] })
        return decoded
    }

    throw new Error('JWT verifier misconfigured')
}

export function requireRole(role: 'ADMIN' | 'USER') {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        await requireAuth(request, reply)
        if (!request.user) return
        if (role === 'ADMIN' && request.user.role !== 'ADMIN') {
            return reply.status(403).send({ success: false, error: 'Forbidden' })
        }
    }
}

export async function requireEnrollment(request: FastifyRequest, reply: FastifyReply) {
    await requireAuth(request, reply)
    if (!request.user) {
        return reply.status(401).send({ success: false, error: 'Missing token' })
    }
    const courseId = (request.params as { courseId: string }).courseId
    const enrolled = await request.services.enrollmentService.isUserEnrolled(request.user.id, courseId)
    if (!enrolled) {
        return reply.status(403).send({ success: false, error: 'Not enrolled in course' })
    }
}
