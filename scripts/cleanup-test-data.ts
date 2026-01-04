/**
 * Cleanup script: delete manually-created test data (courses/exams/etc) and related S3 objects,
 * while preserving DB tables and seeded user accounts.
 *
 * Safety:
 * - Dry-run by default (no deletions).
 * - Refuses to run against non-local DATABASE_URL unless `--allow-remote` is provided.
 * - Requires `--apply` + `--confirm=<token>` for destructive actions.
 *
 * Typical usage (local dev):
 *   npx tsx scripts/cleanup-test-data.ts --scope=all
 *   npx tsx scripts/cleanup-test-data.ts --scope=all --apply --confirm=WIPE_LOCAL_TEST_DATA
 *
 * Scope options:
 *   --scope=all                      Delete all courses/exams/certificates and dependents (keeps users).
 *   --scope=since --since=<ISO>      Delete courses/exams created after the timestamp.
 *   --scope=prefix --prefix=TEST_    Delete courses/exams whose title/slug starts with prefix.
 *
 * S3 cleanup:
 * - Enabled by default when `--apply` is set (can disable with `--s3=false`).
 * - For `scope=all`, deletes objects under:
 *   - main bucket: videos/, subtitles/
 *   - asset bucket: <AWS_S3_ASSET_PREFIX>/ and legacy lesson-assets/ (optional)
 * - For other scopes, deletes only keys referenced by the records being deleted.
 */

import { PrismaClient } from '@prisma/client'
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'

type Scope = 'all' | 'since' | 'prefix'

type Args = {
  scope: Scope
  since?: Date
  prefix?: string
  apply: boolean
  s3: boolean
  allowRemote: boolean
  confirm?: string
  includeLegacy: boolean
  region: string
  mainBucket: string
  assetBucket: string
  assetPrefix: string
  legacyPrefix: string
  videoPrefix: string
  subtitlePrefix: string
}

const prisma = new PrismaClient()

const stripWrappingQuotes = (value: string): string => {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

const sanitizePath = (value?: string | null) => {
  if (!value) return ''
  return value.replace(/^\/+|\/+$/g, '')
}

function isLocalDatabaseUrl(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl)
    const host = url.hostname
    return host === 'localhost' || host === '::1' || host === '127.0.0.1' || host.startsWith('127.')
  } catch {
    return false
  }
}

function redactDatabaseUrl(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl)
    if (url.password) url.password = '***'
    if (url.username) url.username = '***'
    return url.toString()
  } catch {
    return '<invalid DATABASE_URL>'
  }
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (name: string) => {
    const found = argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`))
    if (!found) return undefined
    const eq = found.indexOf('=')
    return eq === -1 ? 'true' : found.slice(eq + 1)
  }

  const scope = ((get('scope') as Scope) || 'all') as Scope
  const apply = get('apply') === 'true'
  const allowRemote = get('allow-remote') === 'true'
  const confirm = get('confirm')
  const includeLegacy = get('include-legacy') ? get('include-legacy') === 'true' : true

  const s3 = get('s3') ? get('s3') === 'true' : true

  const sinceRaw = get('since')
  const prefixRaw = get('prefix')

  const since = sinceRaw ? new Date(sinceRaw) : undefined
  const prefix = prefixRaw ? String(prefixRaw) : undefined

  if (scope === 'since') {
    if (!sinceRaw) throw new Error('Missing --since for --scope=since (expected ISO date)')
    if (!since || Number.isNaN(since.getTime())) throw new Error(`Invalid --since value: ${sinceRaw}`)
  }

  if (scope === 'prefix') {
    if (!prefix) throw new Error('Missing --prefix for --scope=prefix')
  }

  const region =
    stripWrappingQuotes(process.env.AWS_REGION || '') ||
    stripWrappingQuotes(process.env.AWS_DEFAULT_REGION || '') ||
    'us-east-1'

  const mainBucket = stripWrappingQuotes(process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET || '')
  const assetBucket = stripWrappingQuotes(process.env.AWS_S3_ASSET_BUCKET_NAME || '') || mainBucket
  if (!mainBucket && apply && s3) {
    throw new Error('Missing AWS_S3_BUCKET_NAME (required for --s3 deletions)')
  }

  const assetPrefix = sanitizePath(process.env.AWS_S3_ASSET_PREFIX || process.env.UPLOAD_PREFIX || 'course-assets')
  const legacyPrefix = sanitizePath(process.env.LEGACY_LESSON_FOLDER || 'lesson-assets')

  const videoPrefix = sanitizePath(get('video-prefix') || 'videos')
  const subtitlePrefix = sanitizePath(get('subtitle-prefix') || 'subtitles')

  return {
    scope,
    since,
    prefix,
    apply,
    s3,
    allowRemote,
    confirm,
    includeLegacy,
    region,
    mainBucket,
    assetBucket,
    assetPrefix,
    legacyPrefix,
    videoPrefix,
    subtitlePrefix,
  }
}

async function listAllKeys(s3: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = []
  let token: string | undefined
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      })
    )
    for (const obj of res.Contents || []) {
      if (obj.Key) keys.push(obj.Key)
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return keys
}

async function deleteKeysBatch(s3: S3Client, bucket: string, keys: string[]) {
  const normalized = [...new Set(keys.map(k => String(k).replace(/^\/+/, '')).filter(Boolean))]
  const batchSize = 1000
  let deleted = 0
  for (let i = 0; i < normalized.length; i += batchSize) {
    const chunk = normalized.slice(i, i + batchSize)
    if (chunk.length === 0) continue
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: chunk.map(Key => ({ Key })),
          Quiet: true,
        },
      })
    )
    deleted += chunk.length
  }
  return deleted
}

function requireConfirm(args: Args) {
  if (!args.apply) return
  const expected =
    args.scope === 'all'
      ? 'WIPE_LOCAL_TEST_DATA'
      : args.scope === 'since'
        ? 'DELETE_TEST_DATA_SINCE'
        : 'DELETE_TEST_DATA_PREFIX'

  if (args.confirm !== expected) {
    throw new Error(
      `Refusing to apply without explicit confirmation. Re-run with --confirm=${expected}`
    )
  }
}

async function main() {
  const args = parseArgs()

  const databaseUrl = (process.env.DATABASE_URL || '').trim()
  if (!databaseUrl) throw new Error('Missing DATABASE_URL')
  if (!args.allowRemote && !isLocalDatabaseUrl(databaseUrl)) {
    throw new Error('Refusing to run against a non-local DATABASE_URL (use --allow-remote to override)')
  }

  requireConfirm(args)

  console.log('[cleanup-test-data] DATABASE_URL=%s', redactDatabaseUrl(databaseUrl))

  const certificateColumnsRows = await prisma.$queryRaw<Array<{ column_name: string }>>`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'certificates'
  `
  const certificateColumns = new Set(certificateColumnsRows.map(r => r.column_name))
  const hasCertificateTitle = certificateColumns.has('certificateTitle')
  const hasCertificateBadgeS3Key = certificateColumns.has('badgeS3Key')
  const hasCertificatePdfS3Key = certificateColumns.has('pdfS3Key')

  const whereCourse =
    args.scope === 'all'
      ? {}
      : args.scope === 'since'
        ? { createdAt: { gte: args.since! } }
        : {
            OR: [
              { title: { startsWith: args.prefix!, mode: 'insensitive' as const } },
              { slug: { startsWith: args.prefix!, mode: 'insensitive' as const } },
            ],
          }

  const whereExamBase =
    args.scope === 'all'
      ? {}
      : args.scope === 'since'
        ? { createdAt: { gte: args.since! } }
        : { title: { startsWith: args.prefix!, mode: 'insensitive' as const } }

  const courses = await prisma.course.findMany({
    where: whereCourse as any,
    select: { id: true, title: true, slug: true, createdAt: true },
  })

  const courseIds = courses.map(c => c.id)

  const examsDirect = await prisma.exam.findMany({
    where: whereExamBase as any,
    select: { id: true, title: true, courseId: true, createdAt: true },
  })

  const examsFromCourses = courseIds.length
    ? await prisma.exam.findMany({
        where: { courseId: { in: courseIds } },
        select: { id: true, title: true, courseId: true, createdAt: true },
      })
    : []

  const examMap = new Map<string, { id: string; title: string; courseId: string | null; createdAt: Date }>()
  for (const e of [...examsDirect, ...examsFromCourses]) {
    examMap.set(e.id, e)
  }
  const exams = [...examMap.values()]
  const examIds = exams.map(e => e.id)

  // Certificates can become "orphaned" (examId/courseId set null) after manual deletes because
  // Certificate.examId uses onDelete:SetNull. So for non-all scopes we also match by issueDate/title.
  const whereCertificate =
    args.scope === 'all'
      ? {}
      : args.scope === 'since'
        ? {
            OR: [
              { issueDate: { gte: args.since! } },
              ...(examIds.length ? [{ examId: { in: examIds } }] : []),
              ...(courseIds.length ? [{ courseId: { in: courseIds } }] : []),
            ],
          }
        : {
            OR: [
              { examTitle: { startsWith: args.prefix!, mode: 'insensitive' as const } },
              ...(hasCertificateTitle
                ? [{ certificateTitle: { startsWith: args.prefix!, mode: 'insensitive' as const } }]
                : []),
              ...(examIds.length ? [{ examId: { in: examIds } }] : []),
              ...(courseIds.length ? [{ courseId: { in: courseIds } }] : []),
            ],
          }

  console.log('[cleanup-test-data] scope=%s apply=%s s3=%s allowRemote=%s', args.scope, args.apply, args.s3, args.allowRemote)
  if (args.scope === 'since') console.log('[cleanup-test-data] since=%s', args.since!.toISOString())
  if (args.scope === 'prefix') console.log('[cleanup-test-data] prefix=%s', args.prefix)

  console.log('[cleanup-test-data] courses matched: %d', courses.length)
  console.log('[cleanup-test-data] exams matched: %d', exams.length)

  const certificateSelect: any = {
    id: true,
    certificateNumber: true,
    examTitle: true,
    issueDate: true,
  }
  if (hasCertificateTitle) {
    certificateSelect.certificateTitle = true
  }

  const matchedCertificates = await prisma.certificate.findMany({
    where: whereCertificate as any,
    select: certificateSelect,
    orderBy: { issueDate: 'desc' },
  }) as unknown as Array<{
    id: string
    certificateNumber: string
    examTitle: string | null
    issueDate: Date
    certificateTitle?: string | null
  }>
  console.log('[cleanup-test-data] certificates matched: %d', matchedCertificates.length)

  if (courses.length > 0) {
    console.log('[cleanup-test-data] sample courses (first 10):')
    courses.slice(0, 10).forEach(c => console.log('  -', c.slug, '|', c.title))
  }
  if (exams.length > 0) {
    console.log('[cleanup-test-data] sample exams (first 10):')
    exams.slice(0, 10).forEach(e => console.log('  -', e.id, '|', e.title))
  }
  if (matchedCertificates.length > 0) {
    console.log('[cleanup-test-data] sample certificates (first 10):')
    matchedCertificates.slice(0, 10).forEach(c =>
      console.log('  -', c.certificateNumber, '|', c.certificateTitle || c.examTitle || '-', '|', c.issueDate.toISOString())
    )
  }

  // Gather S3 keys to delete (non-all scopes delete only referenced keys; all-scope deletes by prefix).
  const mainBucketKeys: string[] = []
  const assetBucketKeys: string[] = []

  if (args.scope !== 'all') {
    if (courseIds.length) {
      const lessons = await prisma.lesson.findMany({
        where: { chapter: { courseId: { in: courseIds } } },
        select: { videoKey: true, subtitleKey: true },
      })
      for (const row of lessons) {
        if (row.videoKey) mainBucketKeys.push(row.videoKey)
        if (row.subtitleKey) mainBucketKeys.push(row.subtitleKey)
      }

      const courseAssets = await prisma.courseAsset.findMany({
        where: { courseId: { in: courseIds } },
        select: { s3Key: true },
      })
      assetBucketKeys.push(...courseAssets.map(a => a.s3Key).filter(Boolean))

      const transcripts = await prisma.transcriptAsset.findMany({
        where: { lesson: { chapter: { courseId: { in: courseIds } } } },
        select: { s3Key: true },
      })
      assetBucketKeys.push(...transcripts.map(t => t.s3Key).filter(Boolean))

      const contexts = await prisma.knowledgeContext.findMany({
        where: { lesson: { chapter: { courseId: { in: courseIds } } } },
        select: { s3Key: true },
      })
      assetBucketKeys.push(...contexts.map(k => k.s3Key).filter(Boolean))
    }

    if (examIds.length) {
      const materials = await prisma.examMaterial.findMany({
        where: {
          OR: [
            { examId: { in: examIds } },
            ...(courseIds.length ? [{ courseId: { in: courseIds } }] : []),
          ],
        },
        select: { s3Key: true },
      })
      assetBucketKeys.push(...materials.map(m => m.s3Key).filter(Boolean))

      const answers = await prisma.examAnswer.findMany({
        where: { attempt: { examId: { in: examIds } } },
        select: { recordingS3Key: true },
      })
      assetBucketKeys.push(...answers.map(a => a.recordingS3Key).filter((k): k is string => Boolean(k)))

      const templates = await prisma.examCertificateTemplate.findMany({
        where: { examId: { in: examIds } },
        select: { badgeS3Key: true },
      })
      assetBucketKeys.push(...templates.map(t => t.badgeS3Key).filter((k): k is string => Boolean(k)))

      const certificateKeysSelect: any = {}
      if (hasCertificateBadgeS3Key) certificateKeysSelect.badgeS3Key = true
      if (hasCertificatePdfS3Key) certificateKeysSelect.pdfS3Key = true

      if (Object.keys(certificateKeysSelect).length > 0) {
        const certificates = await prisma.certificate.findMany({
          where: whereCertificate as any,
          select: certificateKeysSelect,
        }) as unknown as Array<{ badgeS3Key?: string | null; pdfS3Key?: string | null }>

        for (const c of certificates) {
          if (hasCertificateBadgeS3Key && c.badgeS3Key) assetBucketKeys.push(c.badgeS3Key)
          if (hasCertificatePdfS3Key && c.pdfS3Key) {
            // Historical PDF keys were stored in the primary bucket under `certificates/...`.
            mainBucketKeys.push(c.pdfS3Key)
          }
        }
      }
    }
  }

  const uniqueMain = [...new Set(mainBucketKeys.filter(Boolean))]
  const uniqueAsset = [...new Set(assetBucketKeys.filter(Boolean))]

  console.log('[cleanup-test-data] S3 keys (non-all scope): mainBucket=%d assetBucket=%d', uniqueMain.length, uniqueAsset.length)
  if (args.scope !== 'all' && (uniqueMain.length || uniqueAsset.length)) {
    console.log('[cleanup-test-data] sample S3 keys (first 20):')
    ;[...uniqueMain.slice(0, 10).map(k => `main:${k}`), ...uniqueAsset.slice(0, 10).map(k => `asset:${k}`)].forEach(s =>
      console.log('  -', s)
    )
  }

  if (!args.apply) {
    console.log('[cleanup-test-data] Dry-run. No DB/S3 deletions performed.')
    return
  }

  const countsBefore = await Promise.all([
    prisma.course.count(),
    prisma.exam.count(),
    prisma.certificate.count(),
  ])
  console.log('[cleanup-test-data] DB counts before: courses=%d exams=%d certificates=%d', countsBefore[0], countsBefore[1], countsBefore[2])

  // ==== DB deletions ====
  // Certificates must be deleted explicitly because their exam/course relations are onDelete:SetNull.
  const deletedCerts = await prisma.certificate.deleteMany({ where: whereCertificate as any })
  console.log('[cleanup-test-data] deleted certificates:', deletedCerts.count)

  // Enrollments are sometimes safer to delete before course deletes.
  if (args.scope === 'all') {
    const deletedEnroll = await prisma.enrollment.deleteMany({})
    console.log('[cleanup-test-data] deleted enrollments:', deletedEnroll.count)
  } else if (courseIds.length) {
    const deletedEnroll = await prisma.enrollment.deleteMany({ where: { courseId: { in: courseIds } } })
    console.log('[cleanup-test-data] deleted enrollments:', deletedEnroll.count)
  }

  if (args.scope === 'all') {
    const deletedCourses = await prisma.course.deleteMany({})
    console.log('[cleanup-test-data] deleted courses:', deletedCourses.count)
    const deletedExams = await prisma.exam.deleteMany({})
    console.log('[cleanup-test-data] deleted exams:', deletedExams.count)
  } else {
    if (courseIds.length) {
      const deletedCourses = await prisma.course.deleteMany({ where: { id: { in: courseIds } } })
      console.log('[cleanup-test-data] deleted courses:', deletedCourses.count)
    }
    if (examIds.length) {
      // If a matched exam belonged to a deleted course, it may already be gone via FK cascade.
      const deletedExams = await prisma.exam.deleteMany({ where: { id: { in: examIds } } })
      console.log('[cleanup-test-data] deleted exams:', deletedExams.count)
    }
  }

  // Verify DB cleanup before touching S3 to avoid inconsistencies.
  const countsAfter = await Promise.all([
    prisma.course.count(),
    prisma.exam.count(),
    prisma.certificate.count(),
  ])
  console.log('[cleanup-test-data] DB counts after: courses=%d exams=%d certificates=%d', countsAfter[0], countsAfter[1], countsAfter[2])

  if (args.scope === 'all') {
    if (countsAfter[0] > 0 || countsAfter[1] > 0 || countsAfter[2] > 0) {
      throw new Error(
        [
          'DB_CLEANUP_INCOMPLETE: Refusing to delete S3 objects because DB records remain.',
          'Most likely cause: this script is pointing at a different DATABASE_URL than your web container uses.',
          'Run it inside the same Podman network/env as the app (see scripts/podman/cleanup-test-data.sh).',
        ].join(' ')
      )
    }
  }

  // ==== S3 deletions ====
  if (!args.s3) {
    console.log('[cleanup-test-data] S3 deletion disabled (--s3=false).')
    return
  }

  const s3 = new S3Client({ region: args.region })

  if (args.scope === 'all') {
    const prefixesMain = [`${args.videoPrefix}/`, `${args.subtitlePrefix}/`]
    const prefixesAsset = [`${args.assetPrefix}/`, ...(args.includeLegacy ? [`${args.legacyPrefix}/`] : [])]

    const allMainKeys: string[] = []
    for (const p of prefixesMain) {
      if (!args.mainBucket) continue
      const keys = await listAllKeys(s3, args.mainBucket, p)
      allMainKeys.push(...keys)
    }

    const allAssetKeys: string[] = []
    for (const p of prefixesAsset) {
      if (!args.assetBucket) continue
      const keys = await listAllKeys(s3, args.assetBucket, p)
      allAssetKeys.push(...keys)
    }

    const deletedMain = args.mainBucket ? await deleteKeysBatch(s3, args.mainBucket, allMainKeys) : 0
    const deletedAsset = args.assetBucket ? await deleteKeysBatch(s3, args.assetBucket, allAssetKeys) : 0

    console.log('[cleanup-test-data] deleted S3 objects: mainBucket=%d assetBucket=%d', deletedMain, deletedAsset)
  } else {
    const deletedMain = args.mainBucket ? await deleteKeysBatch(s3, args.mainBucket, uniqueMain) : 0
    const deletedAsset = args.assetBucket ? await deleteKeysBatch(s3, args.assetBucket, uniqueAsset) : 0
    console.log('[cleanup-test-data] deleted S3 objects: mainBucket=%d assetBucket=%d', deletedMain, deletedAsset)
  }
}

main()
  .catch((e) => {
    console.error('[cleanup-test-data] Failed:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
