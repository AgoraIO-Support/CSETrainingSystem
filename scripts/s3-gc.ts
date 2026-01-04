/*
 S3 GC (orphan cleanup) script
 - Compares DB courseAsset.s3Key (authoritative) with S3 objects under configured prefixes
 - Deletes objects that are NOT referenced in DB (O - K)
 - Supports dry-run (default) and confirm delete via --apply

 Usage:
   npx tsx scripts/s3-gc.ts --apply                # actually delete
   npx tsx scripts/s3-gc.ts --dry-run              # list only (default)
   Flags (optional):
     --bucket=<name>          (default: process.env.S3_BUCKET || AWS_S3_BUCKET_NAME)
     --region=<region>        (default: process.env.S3_REGION || AWS_REGION || 'us-east-1')
     --prefix=<materials>     (default: process.env.AWS_S3_ASSET_PREFIX || 'materials')
     --legacy=<lesson-assets> (default: process.env.LEGACY_LESSON_FOLDER || 'lesson-assets')
     --include-legacy=false   (default: true)
*/

import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type Args = {
  apply: boolean
  bucket: string
  region: string
  prefix: string
  legacy: string
  includeLegacy: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const getFlag = (name: string) => {
    const found = argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`))
    if (!found) return undefined
    const eq = found.indexOf('=')
    return eq === -1 ? 'true' : found.slice(eq + 1)
  }
  const apply = getFlag('apply') === 'true'
  const bucket = (getFlag('bucket') as string) || process.env.S3_BUCKET || process.env.AWS_S3_BUCKET_NAME
  const region = (getFlag('region') as string) || process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1'
  const prefix = (getFlag('prefix') as string) || process.env.AWS_S3_ASSET_PREFIX || 'materials'
  const legacy = (getFlag('legacy') as string) || process.env.LEGACY_LESSON_FOLDER || 'lesson-assets'
  const includeLegacy = getFlag('include-legacy') ? getFlag('include-legacy') === 'true' : true

  if (!bucket) throw new Error('Missing S3 bucket (set --bucket or S3_BUCKET/AWS_S3_BUCKET_NAME)')
  if (apply && !getFlag('prefix') && !process.env.AWS_S3_ASSET_PREFIX) {
    throw new Error('Missing AWS_S3_ASSET_PREFIX (or pass --prefix)')
  }

  return { apply, bucket, region, prefix, legacy, includeLegacy }
}

async function listAllKeys(s3: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = []
  let token: string | undefined
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }))
    for (const obj of res.Contents || []) {
      if (obj.Key) keys.push(obj.Key)
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return keys
}

async function deleteKeysBatch(s3: S3Client, bucket: string, keys: string[]) {
  const batchSize = 1000
  let deleted = 0
  for (let i = 0; i < keys.length; i += batchSize) {
    const chunk = keys.slice(i, i + batchSize).map(Key => ({ Key }))
    if (chunk.length === 0) continue
    await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk, Quiet: true } }))
    deleted += chunk.length
  }
  return deleted
}

async function main() {
  const args = parseArgs()
  const s3 = new S3Client({ region: args.region })

  console.log('[GC] Using bucket=%s region=%s prefix=%s legacy=%s includeLegacy=%s apply=%s', args.bucket, args.region, args.prefix, args.legacy, args.includeLegacy, args.apply)

  // 1) Load authoritative keys from DB
  const rows = await prisma.courseAsset.findMany({ select: { s3Key: true } })
  const dbKeys = new Set(rows.map(r => r.s3Key).filter((k): k is string => !!k))
  console.log('[GC] DB authoritative keys:', dbKeys.size)

  // 2) List S3 under new prefix and legacy prefix (optional)
  const s3KeysNew = await listAllKeys(s3, args.bucket, `${args.prefix}/`)
  const s3KeysLegacy = args.includeLegacy ? await listAllKeys(s3, args.bucket, `${args.legacy}/`) : []
  const allS3 = [...s3KeysNew, ...s3KeysLegacy]
  console.log('[GC] S3 objects found: new=%d legacy=%d total=%d', s3KeysNew.length, s3KeysLegacy.length, allS3.length)

  // 3) Compute orphan set: O - K
  const orphan = allS3.filter(k => !dbKeys.has(k))
  console.log('[GC] Orphan objects to delete:', orphan.length)

  if (!args.apply) {
    console.log('[GC] Dry-run mode. No deletion performed.')
    if (orphan.length > 0) {
      console.log('[GC] Sample (first 50):')
      orphan.slice(0, 50).forEach(k => console.log('  -', k))
    }
  } else {
    const deleted = await deleteKeysBatch(s3, args.bucket, orphan)
    console.log('[GC] Deleted objects:', deleted)
  }

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error('[GC] Error:', err)
  await prisma.$disconnect()
  process.exit(1)
})
