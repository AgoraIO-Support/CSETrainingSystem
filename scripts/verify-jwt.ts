import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-do-not-use-in-production'

async function main() {
    console.log('🔍 Testing Auth Logic...')
    console.log('JWT_SECRET:', JWT_SECRET)

    const email = 'user@agora.io'
    const password = 'password123'

    // 1. Test Login Logic
    console.log('\n1. Testing Login...')
    const user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
        console.error('❌ User not found')
        return
    }
    console.log('✅ User found:', user.email)

    if (!user.password) {
        console.error('❌ User has no password')
        return
    }

    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) {
        console.error('❌ Password mismatch')
        return
    }
    console.log('✅ Password verified')

    // 2. Generate Token
    console.log('\n2. Generating Token...')
    const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
    )
    console.log('✅ Token generated:', token.substring(0, 20) + '...')

    // 3. Verify Token
    console.log('\n3. Verifying Token...')
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any
        console.log('✅ Token verified. Decoded:', decoded)

        if (decoded.userId === user.id) {
            console.log('✅ User ID matches')
        } else {
            console.error('❌ User ID mismatch')
        }
    } catch (e) {
        console.error('❌ Token verification failed:', e)
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
