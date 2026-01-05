import { parseCleanupArgs } from '@/scripts/lib/cleanup-test-data/args'

describe('cleanup-test-data args', () => {
  test('requires asset prefix for scope=all when applying S3 cleanup', () => {
    expect(() =>
      parseCleanupArgs({
        argv: ['--scope=all', '--apply', '--confirm=WIPE_LOCAL_TEST_DATA'],
        env: { AWS_S3_BUCKET_NAME: 'cse-training-bucket' },
      })
    ).toThrow(/AWS_S3_ASSET_PREFIX/i)
  })

  test('allows missing asset prefix when not applying', () => {
    const { args, sources } = parseCleanupArgs({
      argv: ['--scope=all'],
      env: { AWS_S3_BUCKET_NAME: 'cse-training-bucket' },
    })

    expect(args.assetPrefix).toBe('')
    expect(sources.assetPrefix).toBe('unset')
  })

  test('cli --asset-prefix overrides env', () => {
    const { args, sources } = parseCleanupArgs({
      argv: ['--scope=all', '--asset-prefix=CSETraining_Dev'],
      env: {
        AWS_S3_BUCKET_NAME: 'cse-training-bucket',
        AWS_S3_ASSET_PREFIX: 'CSETraining',
      },
    })

    expect(args.assetPrefix).toBe('CSETraining_Dev')
    expect(sources.assetPrefix).toBe('cli')
  })

  test('parses allow-container-host flag', () => {
    const { args } = parseCleanupArgs({
      argv: ['--scope=all', '--allow-container-host=true'],
      env: { AWS_S3_BUCKET_NAME: 'cse-training-bucket', AWS_S3_ASSET_PREFIX: 'CSETraining_Dev' },
    })

    expect(args.allowContainerHost).toBe(true)
  })

  test('parses s3-best-effort flag', () => {
    const { args } = parseCleanupArgs({
      argv: ['--scope=all', '--s3-best-effort=true'],
      env: { AWS_S3_BUCKET_NAME: 'cse-training-bucket', AWS_S3_ASSET_PREFIX: 'CSETraining_Dev' },
    })

    expect(args.s3BestEffort).toBe(true)
  })
})
