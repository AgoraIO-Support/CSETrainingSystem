import { S3Client } from '@aws-sdk/client-s3'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { appConfig } from '../config/env.js'

export const s3Client = new S3Client({
    region: appConfig.s3.region,
})

export const cloudFrontClient = new CloudFrontClient({
    region: 'us-east-1',
})
