import jwt from 'jsonwebtoken'
import type { AuthUser } from '@/lib/auth-middleware'

export const getBackendInternalBaseUrl = () => {
    const raw = (process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || '').trim()
    return raw.replace(/\/$/, '')
}

export const getBackendInternalBearerToken = (user: Pick<AuthUser, 'id' | 'email' | 'role'>) => {
    const secret = process.env.JWT_SECRET
    if (!secret) {
        throw new Error('JWT_SECRET is not configured')
    }

    // Short-lived internal token for server-to-server calls to the Fastify backend.
    // This avoids coupling the backend to the browser token format (e.g. Supabase JWT vs local JWT).
    const token = jwt.sign(
        { sub: user.id, id: user.id, email: user.email, role: user.role },
        secret,
        { algorithm: 'HS256', expiresIn: '5m' }
    )

    return `Bearer ${token}`
}

