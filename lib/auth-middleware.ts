import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import prisma from '@/lib/prisma'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-do-not-use-in-production'
const IS_LOCAL_AUTH =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder') ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http://localhost')

export interface AuthUser {
    id: string
    email: string
    role: 'USER' | 'ADMIN'
    supabaseId?: string
}

/**
 * Authentication middleware for API routes
 * Verifies JWT token and attaches user to request
 */
export function withAuth(
    handler: (req: NextRequest, user: AuthUser, context: any) => Promise<NextResponse>,
    options?: {
        requiredRole?: 'USER' | 'ADMIN'
    }
) {
    return async (req: NextRequest, context: any) => {
        // ... existing auth logic ...
        // (I need to be careful not to overwrite the whole function body if I don't have it all)
        // Actually, I should just replace the signature and the return call.
        // But replace_file_content works on blocks.
        // Let's see the file content first to be safe.
        try {
            // Extract token from Authorization header
            const authHeader = req.headers.get('authorization')
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'AUTH_001',
                            message: 'No authentication token provided',
                        },
                    },
                    { status: 401 }
                )
            }

            const token = authHeader.substring(7)
            let dbUser = null

            // 1. Try verifying as Supabase token
            if (!IS_LOCAL_AUTH) {
                try {
                    const {
                        data: { user: supabaseUser },
                        error,
                    } = await supabaseAdmin.auth.getUser(token)

                    if (supabaseUser && !error) {
                        dbUser = await prisma.user.findUnique({
                            where: { supabaseId: supabaseUser.id },
                        })
                    }
                } catch (e) {
                    // Ignore Supabase error, try local
                }
            }

            // 2. If not Supabase, try verifying as Local JWT
            if (!dbUser) {
                try {
                    const decoded = jwt.verify(token, JWT_SECRET) as any
                    if (decoded && decoded.userId) {
                        dbUser = await prisma.user.findUnique({
                            where: { id: decoded.userId },
                        })
                    }
                } catch (e) {
                    // Both failed
                }
            }

            if (!dbUser || dbUser.status !== 'ACTIVE') {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'AUTH_002',
                            message: 'Invalid or expired token, or user account not found or inactive',
                        },
                    },
                    { status: 401 }
                )
            }

            // Check role requirement
            if (options?.requiredRole && dbUser.role !== options.requiredRole) {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: 'AUTH_003',
                            message: 'Insufficient permissions',
                        },
                    },
                    { status: 403 }
                )
            }

            // Create auth user object
            const authUser: AuthUser = {
                id: dbUser.id,
                email: dbUser.email,
                role: dbUser.role,
                supabaseId: dbUser.supabaseId || undefined,
            }

            // Call handler with authenticated user AND context
            return await handler(req, authUser, context)
        } catch (error) {
            console.error('Auth middleware error:', error)
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'SYSTEM_001',
                        message: 'Internal server error',
                    },
                },
                { status: 500 }
            )
        }
    }
}

/**
 * Helper to require admin role
 */
export function withAdminAuth(
    handler: (req: NextRequest, user: AuthUser, context: any) => Promise<NextResponse>
) {
    return withAuth(handler, { requiredRole: 'ADMIN' })
}
