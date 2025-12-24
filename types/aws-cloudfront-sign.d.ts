declare module 'aws-cloudfront-sign' {
  export function getSignedUrl(
    url: string,
    options: {
      keypairId: string
      privateKeyString: string
      expireTime?: number
      expire?: number
      policy?: string
    }
  ): string

  export function getSignedCookies(
    options: {
      policy?: string
      keypairId: string
      privateKeyString: string
      expireTime?: number
      expire?: number
      policyExpiresAt?: number
      resource?: string
    }
  ): {
    'CloudFront-Policy'?: string
    'CloudFront-Signature': string
    'CloudFront-Key-Pair-Id': string
  }
}

