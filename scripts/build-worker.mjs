/**
 * Build script for the transcript worker using esbuild.
 *
 * This bundles the worker into a single file with most dependencies inlined,
 * drastically reducing the container image size by avoiding a full node_modules copy.
 *
 * Only native/binary modules that can't be bundled are marked as external.
 */
import { build } from 'esbuild'

// Only externalize modules that CANNOT be bundled:
// - Native/binary modules (Prisma has platform-specific binaries)
// - Modules with special runtime requirements
const external = [
    // Prisma client has native bindings that must be external
    '@prisma/client',
    '.prisma/client',
    // AWS SDK v3 is large but tree-shakeable; keeping external reduces bundle complexity
    // and avoids potential issues with dynamic imports
    '@aws-sdk/*',
    '@smithy/*',
    // OpenAI SDK
    'openai',
    // Node built-ins
    'node:*',
]

await build({
    entryPoints: ['scripts/transcript-worker.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outdir: 'dist-worker',
    outbase: '.',
    external,
    // Resolve @/* path aliases
    alias: {
        '@': '.',
    },
    // Generate source maps for debugging
    sourcemap: true,
    // Minify for smaller output
    minify: true,
    // Tree-shake unused exports
    treeShaking: true,
    // Log build info
    logLevel: 'info',
})

console.log('Worker build complete: dist-worker/scripts/transcript-worker.js')
