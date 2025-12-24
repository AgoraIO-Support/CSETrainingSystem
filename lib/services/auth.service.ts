import prisma from '@/lib/prisma'
import { supabaseAdmin } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-do-not-use-in-production'
const IS_LOCAL_AUTH =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder') ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http://localhost')

export class AuthService {
    /**
     * Register a new user
     */
    static async register(data: {
        email: string
        password: string
        name: string
        department?: string
    }) {
        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: data.email },
        })

        if (existingUser) {
            throw new Error('EMAIL_EXISTS')
        }

        let supabaseId = null
        let session = null

        // Try Supabase Auth if configured
        if (!IS_LOCAL_AUTH) {
            try {
                const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
                    email: data.email,
                    password: data.password,
                    email_confirm: true,
                })

                if (!authError && authData.user) {
                    supabaseId = authData.user.id
                    session = {
                        access_token: 'supabase-token-placeholder', // Admin create doesn't return session
                        refresh_token: 'supabase-refresh-placeholder',
                        expires_in: 3600,
                    }
                }
            } catch (e) {
                console.warn('Supabase registration failed, falling back to local auth', e)
            }
        }

        // Hash password for local auth
        const hashedPassword = await bcrypt.hash(data.password, 10)

        // Create user in database
        const user = await prisma.user.create({
            data: {
                email: data.email,
                name: data.name,
                department: data.department,
                password: hashedPassword,
                supabaseId: supabaseId, // Can be null for local-only users
                role: 'USER',
                status: 'ACTIVE',
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                avatar: true,
            },
        })

        // Generate local JWT if no Supabase session
        if (!session) {
            const token = jwt.sign(
                { userId: user.id, email: user.email, role: user.role },
                JWT_SECRET,
                { expiresIn: '24h' }
            )

            session = {
                access_token: token,
                refresh_token: 'local-refresh-token',
                expires_in: 86400,
            }
        }

        return {
            user,
            session,
        }
    }

    /**
     * Login user
     */
    static async login(email: string, password: string) {
        // 1. Try Local Auth first (since we have password hash now)
        const user = await prisma.user.findUnique({
            where: { email },
        })

        if (!user || user.status !== 'ACTIVE') {
            throw new Error('USER_INACTIVE')
        }

        // Verify password if it exists
        if (user.password) {
            const isValid = await bcrypt.compare(password, user.password)
            if (isValid) {
                // Generate local JWT
                const token = jwt.sign(
                    { userId: user.id, email: user.email, role: user.role },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                )

                // Update last login
                await prisma.user.update({
                    where: { id: user.id },
                    data: { lastLoginAt: new Date() },
                })

                return {
                    user: {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        role: user.role,
                        avatar: user.avatar,
                        status: user.status,
                    },
                    session: {
                        access_token: token,
                        refresh_token: 'local-refresh-token',
                        expires_in: 86400,
                    },
                }
            }
        }

        // 2. Fallback to Supabase Auth if local auth failed/not available
        if (!IS_LOCAL_AUTH) {
            const { data: authData, error: authError } =
                await supabaseAdmin.auth.signInWithPassword({
                    email,
                    password,
                })

            if (!authError && authData.session) {
                // Update last login
                await prisma.user.update({
                    where: { id: user.id },
                    data: { lastLoginAt: new Date() },
                })

                return {
                    user: {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        role: user.role,
                        avatar: user.avatar,
                        status: user.status,
                    },
                    session: authData.session,
                }
            }
        }

        throw new Error('INVALID_CREDENTIALS')
    }

    /**
     * Get current user by ID (Local) or Supabase ID
     */
    static async getCurrentUser(identifier: string, isLocal: boolean = false) {
        const where = isLocal ? { id: identifier } : { supabaseId: identifier }

        return await prisma.user.findUnique({
            where,
            select: {
                id: true,
                email: true,
                name: true,
                avatar: true,
                role: true,
                department: true,
                bio: true,
                title: true,
                createdAt: true,
            },
        })
    }

    /**
     * Refresh access token
     */
    static async refreshToken(refreshToken: string) {
        if (refreshToken === 'local-refresh-token') {
            // For local auth, we just return a new token if the old one is valid?
            // Simplified: just return error for now, client should re-login
            throw new Error('REFRESH_NOT_SUPPORTED_LOCAL')
        }

        const { data, error } = await supabaseAdmin.auth.refreshSession({
            refresh_token: refreshToken,
        })

        if (error || !data.session) {
            throw new Error('INVALID_REFRESH_TOKEN')
        }

        return data.session
    }
}
