import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import { buildServices } from './services/index.js'
import { appConfig } from './config/env.js'
import { presignUploadRoutes } from './routes/admin/uploads.js'
import { materialRoutes } from './routes/admin/materials.js'
import { cloudfrontCookieRoutes } from './routes/materials/cloudfront.js'

async function buildServer() {
    const server = Fastify({ logger: true })
    await server.register(sensible)
    await server.register(cors, {
        origin: [/\.example\.com$/, 'http://localhost:3000'],
        credentials: true,
    })
    await server.register(cookie)

    server.addHook('onRequest', async (request, _reply) => {
        request.services = buildServices()
    })

    server.register(presignUploadRoutes, { prefix: '/api/admin/uploads' })
    server.register(materialRoutes, { prefix: '/api/admin/materials' })
    server.register(cloudfrontCookieRoutes, { prefix: '/api/materials' })

    return server
}

buildServer()
    .then(server => server.listen({ port: appConfig.port, host: '0.0.0.0' }))
    .catch(err => {
        console.error(err)
        process.exit(1)
    })
