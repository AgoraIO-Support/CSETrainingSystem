import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import prisma from '@/lib/prisma'
import s3Client, { ASSET_S3_BUCKET_NAME } from '@/lib/aws-s3'

type RouteContext = { params: Promise<{ assetId: string; path: string[] }> }

const normalizeRelativePath = (segments: string[]) => {
  const decoded = segments.map(segment => decodeURIComponent(segment))
  if (decoded.length === 0 || decoded.some(segment => !segment || segment === '.' || segment === '..' || segment.includes('/'))) {
    return null
  }
  return decoded.join('/')
}

const dirname = (key: string) => {
  const normalized = key.replace(/^\/+/, '')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(0, idx) : ''
}

const fallbackContentType = (path: string) => {
  const lower = path.toLowerCase()
  if (lower.endsWith('.html')) return 'text/html; charset=utf-8'
  if (lower.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8'
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.vtt')) return 'text/vtt; charset=utf-8'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { assetId, path } = await context.params
  const relativePath = normalizeRelativePath(path)

  if (!relativePath) {
    return NextResponse.json({ success: false, error: { code: 'INVALID_PATH', message: 'Invalid web package path' } }, { status: 400 })
  }

  const asset = await prisma.courseAsset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      type: true,
      s3Key: true,
    },
  })

  if (!asset || asset.type !== 'WEB_PACKAGE') {
    return NextResponse.json({ success: false, error: { code: 'ASSET_NOT_FOUND', message: 'Web package not found' } }, { status: 404 })
  }

  const key = `${dirname(asset.s3Key)}/${relativePath}`.replace(/^\/+/, '')
  const range = req.headers.get('range') || undefined

  try {
    const object = await s3Client.send(new GetObjectCommand({
      Bucket: ASSET_S3_BUCKET_NAME,
      Key: key,
      Range: range,
    }))

    const headers = new Headers()
    headers.set('Content-Type', object.ContentType || fallbackContentType(relativePath))
    headers.set('Cache-Control', 'private, max-age=300')
    headers.set('X-Robots-Tag', 'noindex')
    headers.set('Accept-Ranges', 'bytes')

    if (object.ContentLength !== undefined) headers.set('Content-Length', String(object.ContentLength))
    if (object.ContentRange) headers.set('Content-Range', object.ContentRange)
    if (object.ETag) headers.set('ETag', object.ETag)

    const body = object.Body && 'transformToWebStream' in object.Body
      ? object.Body.transformToWebStream()
      : (object.Body as unknown as BodyInit | null)

    return new NextResponse(body, {
      status: range ? 206 : 200,
      headers,
    })
  } catch (error) {
    console.error('Serve web package asset error:', { assetId, relativePath, key, error })
    return NextResponse.json({ success: false, error: { code: 'ASSET_OBJECT_NOT_FOUND', message: 'Web package file not found' } }, { status: 404 })
  }
}
