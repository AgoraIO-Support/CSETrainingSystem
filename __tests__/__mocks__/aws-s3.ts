/**
 * Global mock for `@/lib/aws-s3`.
 *
 * This prevents any test from trying to use real AWS credentials from `.env`.
 * The underlying `send()` delegates to the mocked AWS SDK client.
 */

import { mockS3Send } from './aws-sdk-client-s3';

const s3Client = { send: mockS3Send };

export const S3_BUCKET_NAME = 'test-bucket';
export const CLOUDFRONT_DOMAIN = 'https://test.cloudfront.net';
export const S3_ASSET_BASE_PREFIX = 'test-assets';

export default s3Client;

