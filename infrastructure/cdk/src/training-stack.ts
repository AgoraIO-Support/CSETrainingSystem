import { Stack, StackProps, Duration, aws_s3 as s3, aws_cloudfront as cloudfront, aws_cloudfront_origins as origins, aws_iam as iam, aws_logs as logs } from 'aws-cdk-lib'
import { Construct } from 'constructs'

export class TrainingStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const bucket = new s3.Bucket(this, 'TrainingAssets', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      cors: [{
        allowedOrigins: ['https://admin.example.com', 'https://app.example.com', 'http://localhost:3000'],
        allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.POST, s3.HttpMethods.GET],
        allowedHeaders: ['*'],
      }],
    })

    const oac = new cloudfront.OriginAccessControl(this, 'OAC', {
      originAccessControlConfig: {
        name: 'training-oac',
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
      },
    })

    const logBucket = new s3.Bucket(this, 'CfLogs', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    })

    const cfPublicKey = new cloudfront.PublicKey(this, 'CfPubKey', {
      encodedKey: process.env.CF_PUBLIC_KEY!,
    })

    const keyGroup = new cloudfront.KeyGroup(this, 'KeyGroup', {
      items: [cfPublicKey],
    })

    const distribution = new cloudfront.Distribution(this, 'TrainingDist', {
      defaultBehavior: {
        origin: new origins.S3Origin(bucket, { originAccessControl: oac }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        trustedKeyGroups: [keyGroup],
      },
      additionalBehaviors: {
        '/videos/*': {
          origin: new origins.S3Origin(bucket, { originAccessControl: oac }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          trustedKeyGroups: [keyGroup],
        },
      },
      enableLogging: true,
      logBucket,
      logFilePrefix: 'cloudfront/training',
    })

    bucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowCloudFrontOAC',
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      actions: ['s3:GetObject'],
      resources: [`${bucket.bucketArn}/*`],
      conditions: {
        StringEquals: {
          'AWS:SourceArn': distribution.distributionArn,
        },
      },
    }))
  }
}
