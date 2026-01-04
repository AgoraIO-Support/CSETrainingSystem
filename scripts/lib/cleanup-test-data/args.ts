export type Scope = 'all' | 'since' | 'prefix'

export type CleanupArgs = {
  scope: Scope
  since?: Date
  prefix?: string
  apply: boolean
  s3: boolean
  allowRemote: boolean
  allowContainerHost: boolean
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

export type CleanupArgsSources = {
  assetPrefix: 'cli' | 'env' | 'unset'
  region: 'cli' | 'env' | 'default'
  mainBucket: 'cli' | 'env' | 'unset'
  assetBucket: 'cli' | 'env' | 'derived-mainBucket'
}

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

export function parseCleanupArgs(input: {
  argv: string[]
  env: Record<string, string | undefined>
}): { args: CleanupArgs; sources: CleanupArgsSources } {
  const argv = input.argv
  const env = input.env

  const get = (name: string) => {
    const found = argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`))
    if (!found) return undefined
    const eq = found.indexOf('=')
    return eq === -1 ? 'true' : found.slice(eq + 1)
  }

  const scope = ((get('scope') as Scope) || 'all') as Scope
  const apply = get('apply') === 'true'
  const allowRemote = get('allow-remote') === 'true'
  const allowContainerHost = get('allow-container-host') === 'true'
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

  const regionCli = stripWrappingQuotes((get('region') as string) || '')
  const regionEnv =
    stripWrappingQuotes(env.AWS_REGION || '') || stripWrappingQuotes(env.AWS_DEFAULT_REGION || '')
  const region = regionCli || regionEnv || 'us-east-1'

  const regionSource: CleanupArgsSources['region'] = regionCli ? 'cli' : regionEnv ? 'env' : 'default'

  const mainBucketCli = stripWrappingQuotes((get('bucket') as string) || '')
  const mainBucketEnv = stripWrappingQuotes(env.AWS_S3_BUCKET_NAME || env.S3_BUCKET || '')
  const mainBucket = mainBucketCli || mainBucketEnv

  const mainBucketSource: CleanupArgsSources['mainBucket'] = mainBucketCli
    ? 'cli'
    : mainBucketEnv
      ? 'env'
      : 'unset'

  const assetBucketCli = stripWrappingQuotes((get('asset-bucket') as string) || '')
  const assetBucketEnv = stripWrappingQuotes(env.AWS_S3_ASSET_BUCKET_NAME || '')
  const assetBucket = (assetBucketCli || assetBucketEnv || mainBucket) as string

  const assetBucketSource: CleanupArgsSources['assetBucket'] = assetBucketCli
    ? 'cli'
    : assetBucketEnv
      ? 'env'
      : 'derived-mainBucket'

  const assetPrefixCli = sanitizePath((get('asset-prefix') as string) || '')
  const assetPrefixEnv = sanitizePath(env.AWS_S3_ASSET_PREFIX || '')
  const assetPrefix = assetPrefixCli || assetPrefixEnv

  const assetPrefixSource: CleanupArgsSources['assetPrefix'] = assetPrefixCli
    ? 'cli'
    : assetPrefixEnv
      ? 'env'
      : 'unset'

  const legacyPrefix = sanitizePath((get('legacy-prefix') as string) || env.LEGACY_LESSON_FOLDER || 'lesson-assets')

  const videoPrefix = sanitizePath(get('video-prefix') || 'videos')
  const subtitlePrefix = sanitizePath(get('subtitle-prefix') || 'subtitles')

  if (apply && s3 && !mainBucket) {
    throw new Error('Missing AWS_S3_BUCKET_NAME (required for --s3 deletions)')
  }

  // For `--scope=all`, S3 deletions are prefix-based, so we must know which prefix to delete.
  // This is intentionally strict to avoid accidentally deleting the wrong environment's folder.
  if (apply && s3 && scope === 'all' && !assetPrefix) {
    throw new Error(
      'Missing AWS_S3_ASSET_PREFIX (or --asset-prefix). Refusing to run prefix-based S3 cleanup for --scope=all.'
    )
  }

  return {
    args: {
      scope,
      since,
      prefix,
      apply,
      s3,
      allowRemote,
      allowContainerHost,
      confirm,
      includeLegacy,
      region,
      mainBucket,
      assetBucket,
      assetPrefix,
      legacyPrefix,
      videoPrefix,
      subtitlePrefix,
    },
    sources: {
      assetPrefix: assetPrefixSource,
      region: regionSource,
      mainBucket: mainBucketSource,
      assetBucket: assetBucketSource,
    },
  }
}
