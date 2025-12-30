import { S3Client } from '@aws-sdk/client-s3'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { appConfig } from '../config/env.js'

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

const explicitCredentials =
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
              accessKeyId: stripWrappingQuotes(process.env.AWS_ACCESS_KEY_ID),
              secretAccessKey: stripWrappingQuotes(process.env.AWS_SECRET_ACCESS_KEY),
              sessionToken: process.env.AWS_SESSION_TOKEN
                  ? stripWrappingQuotes(process.env.AWS_SESSION_TOKEN)
                  : undefined,
          }
        : undefined

export const s3Client = new S3Client({
    region: appConfig.s3.region,
    // In local dev, it's common for env-file values to be accidentally wrapped in quotes.
    // If we rely on the default provider chain, those quotes become part of the credential and AWS rejects it.
    // Providing explicit credentials here allows us to normalize/strip quotes safely.
    credentials: explicitCredentials,
})

export const cloudFrontClient = new CloudFrontClient({
    region: 'us-east-1',
})
