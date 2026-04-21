/**
 * Real AWS S3 E2E verification (local dev)
 *
 * Why this exists:
 * - Production will require CloudFront signed URLs for `/assets/*`.
 * - Local development should remain easy by switching to S3 presigned GET URLs.
 * - This script validates the entire chain end-to-end against:
 *   - a running Next.js server
 *   - a real PostgreSQL DB
 *   - a real AWS S3 bucket (no mocks)
 *
 * What it tests:
 * 1) Finds an existing VIDEO asset for a lesson (source object in S3).
 * 2) Calls the admin upload endpoint to prepare a NEW asset upload session using the NEW key scheme:
 *      <AWS_S3_ASSET_PREFIX>/<courseId>/<lessonId>/<assetId>.mp4
 * 3) Copies the source S3 object to the new key (server-side copy, no local MP4 needed).
 * 4) Confirms the prepared upload session so the asset is attached to the lesson.
 * 5) Calls the learner course API and verifies the returned asset URL is fetchable (Range GET).
 * 6) Cleans up by deleting the created asset via the admin delete endpoint.
 *
 * Usage:
 *   # In one terminal:
 *   CSE_ASSET_DELIVERY_MODE=s3_presigned npm run dev
 *
 *   # In another terminal:
 *   E2E_BASE_URL=http://localhost:3000 \
 *   E2E_ADMIN_EMAIL=admin@agora.io \
 *   E2E_ADMIN_PASSWORD=password123 \
 *   E2E_COURSE_ID=<courseId> \
 *   E2E_LESSON_ID=<lessonId> \
 *   npx tsx scripts/e2e/real-s3-asset-delivery.ts
 */

import 'dotenv/config'

import { PrismaClient } from '@prisma/client'
import { CopyObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'

type Env = {
  baseUrl: string
  adminEmail: string
  adminPassword: string
  courseId: string
  lessonId: string
}

const readEnv = (): Env => {
  const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000'
  const adminEmail = process.env.E2E_ADMIN_EMAIL || 'admin@agora.io'
  const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'password123'
  const courseId =
    process.env.E2E_COURSE_ID || '2ec86632-aa0a-46b7-8920-35d345481500'
  const lessonId =
    process.env.E2E_LESSON_ID || '39a42884-c3d5-4817-a581-4cc0b4cddedd'
  return { baseUrl, adminEmail, adminPassword, courseId, lessonId }
}

const expectTruthy = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}

const jsonFetch = async <T>(
  url: string,
  opts: RequestInit & { expectedStatus?: number } = {}
): Promise<T> => {
  const res = await fetch(url, opts)
  const expected = opts.expectedStatus
  if (expected && res.status !== expected) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} (expected ${expected}): ${text}`)
  }
  const data = (await res.json()) as T
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`)
  }
  return data
}

const buildS3Client = () => {
  const region = process.env.AWS_REGION || 'ap-southeast-1'
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  const credentials =
    accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined

  return new S3Client({ region, credentials })
}

const waitForHead = async (s3: S3Client, bucket: string, key: string) => {
  const max = 20
  for (let i = 0; i < max; i++) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
      return
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw new Error(`S3 object not visible after retry: s3://${bucket}/${key}`)
}

const main = async () => {
  const env = readEnv()
  const prisma = new PrismaClient()
  const s3 = buildS3Client()

  const assetBucket =
    process.env.AWS_S3_ASSET_BUCKET_NAME ||
    process.env.AWS_S3_BUCKET_NAME ||
    ''
  expectTruthy(assetBucket, 'Missing AWS_S3_BUCKET_NAME (or AWS_S3_ASSET_BUCKET_NAME)')

  // 1) Find an existing video asset for this lesson (source object).
  const sourceBinding = await prisma.lessonAsset.findFirst({
    where: {
      lessonId: env.lessonId,
      courseAsset: { type: 'VIDEO' },
    },
    include: { courseAsset: true, lesson: { include: { chapter: true } } },
    orderBy: { createdAt: 'asc' },
  })
  expectTruthy(sourceBinding?.courseAsset, 'No VIDEO lesson asset found; cannot locate source MP4 in S3')

  const sourceKey = sourceBinding!.courseAsset.s3Key
  expectTruthy(sourceKey, 'Source video asset missing s3Key')

  // 2) Login as admin to call upload/delete APIs.
  const login = await jsonFetch<any>(`${env.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.adminEmail, password: env.adminPassword }),
  })
  const token = login?.data?.session?.accessToken
  expectTruthy(typeof token === 'string' && token.length > 10, 'Failed to obtain access token')

  const authHeaders = { Authorization: `Bearer ${token}` }

  // 3) Fetch course to locate chapterId containing lessonId.
  const course = await jsonFetch<any>(`${env.baseUrl}/api/courses/${env.courseId}`, {
    headers: { ...authHeaders },
  })
  const chapters = course?.data?.chapters || []
  let chapterId: string | null = null
  for (const ch of chapters) {
    const lessons = ch.lessons || []
    if (lessons.some((l: any) => l.id === env.lessonId)) {
      chapterId = ch.id
      break
    }
  }
  expectTruthy(chapterId, 'Unable to locate chapterId for the provided lessonId')

  // 4) Create a new VIDEO asset via the upload endpoint (new key scheme).
  const upload = await jsonFetch<any>(
    `${env.baseUrl}/api/admin/courses/${env.courseId}/chapters/${chapterId}/lessons/${env.lessonId}/assets/upload`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        filename: 'e2e-smoke.mp4',
        contentType: 'video/mp4',
        type: 'VIDEO',
      }),
    }
  )

  const uploadSessionId = upload?.data?.uploadSessionId
  const createdAssetId = upload?.data?.courseAssetId
  const destKey = upload?.data?.key
  expectTruthy(typeof uploadSessionId === 'string', 'Upload endpoint did not return uploadSessionId')
  expectTruthy(typeof createdAssetId === 'string', 'Upload endpoint did not return courseAssetId')
  expectTruthy(typeof destKey === 'string', 'Upload endpoint did not return key')

  // Key should follow: <AWS_S3_ASSET_PREFIX>/<courseId>/<lessonId>/<assetId>.mp4
  const prefix = (process.env.AWS_S3_ASSET_PREFIX || 'course-assets').replace(/^\/+|\/+$/g, '')
  const expectedPrefix = `${prefix}/${env.courseId}/${env.lessonId}/`
  expectTruthy(
    String(destKey).startsWith(expectedPrefix) && String(destKey).includes(`${createdAssetId}.mp4`),
    `Unexpected destKey format. Got: ${destKey} Expected prefix: ${expectedPrefix} and suffix: ${createdAssetId}.mp4`
  )

  // 5) Copy the existing MP4 object to the new key (server-side copy).
  await s3.send(
    new CopyObjectCommand({
      Bucket: assetBucket,
      Key: destKey,
      CopySource: `${assetBucket}/${encodeURIComponent(sourceKey)}`,
      MetadataDirective: 'COPY',
      ContentType: 'video/mp4',
    })
  )

  await waitForHead(s3, assetBucket, destKey)

  await jsonFetch<any>(
    `${env.baseUrl}/api/admin/courses/${env.courseId}/chapters/${chapterId}/lessons/${env.lessonId}/assets/confirm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ uploadSessionId }),
    }
  )

  // 6) Fetch course again and verify the created asset has a fetchable URL.
  const courseAfter = await jsonFetch<any>(`${env.baseUrl}/api/courses/${env.courseId}`, {
    headers: { ...authHeaders },
  })

  const lesson = courseAfter?.data?.chapters
    ?.flatMap((c: any) => c.lessons || [])
    ?.find((l: any) => l.id === env.lessonId)
  expectTruthy(lesson, 'Lesson not found in course payload after upload')

  const created = (lesson.assets || []).find((a: any) => a.id === createdAssetId)
  expectTruthy(created, 'Created asset not present in lesson.assets payload')

  const accessUrl = created.url
  expectTruthy(typeof accessUrl === 'string', 'Created asset url missing from payload')
  expectTruthy(
    accessUrl.includes('X-Amz-Signature') || accessUrl.includes('Signature='),
    `Access URL does not look signed (expected S3 presigned GET). url=${accessUrl}`
  )

  // Range request: MP4 seeking depends on this working.
  const res = await fetch(accessUrl, {
    headers: { Range: 'bytes=0-1023' },
  })
  expectTruthy(res.status === 206 || res.status === 200, `Unexpected status for Range GET: ${res.status}`)

  const contentType = res.headers.get('content-type') || ''
  expectTruthy(contentType.includes('video') || contentType.includes('application/octet-stream'), `Unexpected content-type: ${contentType}`)

  // 7) Cleanup: delete the created asset via admin endpoint (also deletes the S3 object).
  await jsonFetch<any>(`${env.baseUrl}/api/admin/courses/assets/${createdAssetId}`, {
    method: 'DELETE',
    headers: { ...authHeaders },
    expectedStatus: 200,
  })

  // eslint-disable-next-line no-console
  console.log('[real-s3-asset-delivery] PASS', {
    courseId: env.courseId,
    lessonId: env.lessonId,
    sourceKey,
    destKey,
    createdAssetId,
  })

  await prisma.$disconnect()
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[real-s3-asset-delivery] FAIL:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
