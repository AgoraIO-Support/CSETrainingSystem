import 'fastify'
import { AuthUser } from './auth'
import { Services } from '../services'

declare module 'fastify' {
    interface FastifyRequest {
        user?: AuthUser
        services: Services
    }
}
