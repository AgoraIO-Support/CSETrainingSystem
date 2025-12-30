import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, _Object, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3'
import { appConfig } from '../config/env.js'
import { s3Client } from './aws.js'
import { log, timeAsync } from '../logger.js'

type DeleteOpts = { bestEffort?: boolean }

export async function deletePrefix(prefix: string, client: S3Client = s3Client, opts: DeleteOpts = { bestEffort: true }): Promise<void> {
  let continuationToken: string | undefined = undefined
  try {
    do {
      const listRes: ListObjectsV2CommandOutput = await timeAsync(
        'S3',
        'listObjectsV2',
        { bucket: appConfig.s3.bucket, prefix, continuationToken: continuationToken ?? null },
        () => client.send(new ListObjectsV2Command({
          Bucket: appConfig.s3.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }))
      )

      const contents = (listRes.Contents || []) as _Object[]
      if (contents.length > 0) {
        const toDelete = contents.map(o => ({ Key: o.Key! }))
        // batch delete up to 1000 per request
        while (toDelete.length) {
          const chunk = toDelete.splice(0, 1000)
          await timeAsync(
            'S3',
            'deleteObjects batch',
            { bucket: appConfig.s3.bucket, prefix, keysCount: chunk.length },
            () => client.send(new DeleteObjectsCommand({
              Bucket: appConfig.s3.bucket,
              Delete: { Objects: chunk, Quiet: true },
            })).then(() => undefined)
          )
        }
      }

      continuationToken = listRes.IsTruncated ? listRes.NextContinuationToken : undefined
    } while (continuationToken)
  } catch (err) {
    log('S3', 'error', 'deletePrefix error', { prefix, error: err instanceof Error ? err.message : String(err) })
    if (!opts.bestEffort) throw err
  }
}

export async function deleteKeys(keys: string[], client: S3Client = s3Client, opts: DeleteOpts = { bestEffort: false }): Promise<void> {
  if (!keys || keys.length === 0) return
  try {
    const toDelete = keys.map(k => ({ Key: k }))
    while (toDelete.length) {
      const chunk = toDelete.splice(0, 1000)
      await timeAsync(
        'S3',
        'deleteObjects batch',
        { bucket: appConfig.s3.bucket, keysCount: chunk.length },
        () => client.send(new DeleteObjectsCommand({
          Bucket: appConfig.s3.bucket,
          Delete: { Objects: chunk, Quiet: true },
        })).then(() => undefined)
        )
    }
  } catch (err) {
    log('S3', 'error', 'deleteKeys error', { keysCount: keys.length, error: err instanceof Error ? err.message : String(err) })
    if (!opts.bestEffort) throw err
  }
}
