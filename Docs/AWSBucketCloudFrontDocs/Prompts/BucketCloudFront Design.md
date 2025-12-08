上传（Upload）：使用 S3 Presigned URL
访问（View/Play）：使用 CloudFront URL（永不过期）


You are a senior AWS cloud architect + full-stack engineer.
Your task is to design and generate production-grade code for a training web application with secure S3/CloudFront access control.

Please design architecture and code according to the following:

1. Upload Training Assets

Admin uploads files (PDF/MP4/VTT/Images and any other file types) through Backend API.

Backend generates S3 Presigned URL → Admin uploads directly to S3.

Admin SDK requests should not expose permanent credentials.

Presigned URLs should have short expiration (e.g., 30 minutes).

2. Users View Materials (never expire URL)

Frontend should always load files using CloudFront public URL, not S3 URL.

CloudFront URLs must be permanent, meaning:

S3 objects are accessed only by CloudFront, not by the public.

Users do not need presigned URLs to view.

3. Training Materials/Files Requires Login

View training materials/files must require user login.

You must use CloudFront Signed Cookies to gate video playback.

The backend should issue signed cookies valid for X hours (e.g., 12h).

The Video Player must use CloudFront domain to load video chunks.

4. Architecture Stack

Use:

AWS S3

AWS CloudFront

Origin Access Control (OAC)

CloudFront Signed Cookies

Terraform or CDK (include both)

Backend (Node.js / Python — choose best)

Frontend (Next.js or React)

Terraform or CDK (include both)



Architecture Overview

  - Frontend: Next.js (App Router) served from Vercel/EC2. Auth via JWT (NextAuth/Auth0). All API calls go to backend.
  - Backend: Node.js (Fastify/Express) running in ECS Fargate with AWS WAF + ALB. Provides admin- and user-facing APIs, signs CloudFront cookies, and enforces RBAC (Admin vs Learner).
  - Storage: training-assets S3 bucket (private). Two prefixes: uploads/admin/{adminId}/raw/... for temporary assets, materials/{courseId}/... for published files.
  - CDN: CloudFront distribution dXXXX.cloudfront.net with:
      - Origin Access Control (OAC) so only CloudFront can read S3.
      - Two cache behaviors: /videos/* (streaming) and /materials/* (documents, slides, etc.). Both require signed cookies.
      - Custom headers for viewer-country if needed.
  - Security:
      - Uploads use S3 PUT presigned URLs valid for 30m; no permanent keys in the browser.
      - Viewing uses CloudFront Signed Cookies (12h). Backend enforces login then issues cookies (CloudFront-Key-Pair-Id, CloudFront-Policy, CloudFront-Signature). Videos and documents are only
        accessible via CloudFront. No direct S3 links are ever exposed.
  - Infrastructure: Managed via both Terraform and AWS CDK (TypeScript). Terraform handles networking + IAM baseline; CDK stacks manage app-specific distributions, lambdas, etc., or vice versa. Example
    snippets for both provided below.

  ———

  ### 1. Upload Training Assets (Admin)

  Flow

  1. Admin UI (Next.js dashboard) calls POST /api/admin/uploads/presign with file metadata (filename, contentType, courseId, assetType).
  2. Backend validates admin JWT, slugifies filename, determines destination key (materials/{courseId}/{uuid}-{filename}), and calls S3.getSignedUrl('putObject', { Bucket, Key, ContentType, Expires:
     1800 }).
  3. Backend responds with { uploadUrl, key, cloudfrontUrl }.
  4. UI uses the presigned uploadUrl for a direct PUT to S3 (with ACL omitted—bucket is private).
  5. After S3 confirms 200, UI calls POST /api/admin/materials with metadata (title, type, key, size). Backend stores record in Postgres + triggers async virus scan/transcoding if needed.

  Backend endpoint example (Fastify + AWS SDK v3)

  import { s3Client } from '../aws/s3Client';
  import { PutObjectCommand } from '@aws-sdk/client-s3';
  import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
  import { randomUUID } from 'crypto';
  import { z } from 'zod';

  const presignSchema = z.object({
    filename: z.string().min(1),
    contentType: z.string().min(1),
    courseId: z.string().uuid(),
    assetType: z.enum(['VIDEO', 'DOCUMENT', 'AUDIO', 'IMAGE', 'OTHER']).optional(),
  });

  fastify.post('/api/admin/uploads/presign', { preHandler: [requireAdmin] }, async (req, reply) => {
    const { filename, contentType, courseId, assetType } = presignSchema.parse(req.body);

    const extensionSafe = filename.replace(/[^\w.-]/g, '_');
    const key = `materials/${courseId}/${randomUUID()}-${extensionSafe}`;
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 * 30 }); // 30 minutes

    return reply.send({
      uploadUrl,
      key,
      cloudfrontUrl: `https://${process.env.CLOUDFRONT_DOMAIN}/${key}`,
      expiresInSeconds: 1800,
    });
  });

  ———

  ### 2. Users View Materials (Permanent CloudFront URLs)

  - Every stored asset uses canonical URL https://<cloudfront-domain>/<key>.
  - S3 bucket denies GetObject except from CloudFront OAC (no direct S3 access).
  - Mongo/Postgres stores cloudfrontUrl string per asset. Frontend always uses this URL; no signed query strings needed once CloudFront cookie is set.
  - Cache-control headers applied by S3 metadata (e.g., Cache-Control: public, max-age=31536000, immutable) for static documents; streaming video chunk origin uses application/octet-stream.

  ———

  ### 3. Require Login & CloudFront Signed Cookies

  Flow for viewing course material

  1. User logs into app (NextAuth/Auth0). JWT stored in HttpOnly cookie.
  2. When user navigates to /courses/:courseId/materials, frontend calls GET /api/materials/:id/cf-cookie.
  3. Backend verifies enrollment, builds CloudFront custom policy (resource pattern https://dXXXX.cloudfront.net/materials/${courseId}/*, expiry now+12h, IP whitelist optional).
  4. Backend signs policy using CloudFront key pair (private key in AWS Secrets Manager). Response sets cookies:
      - CloudFront-Policy
      - CloudFront-Signature
      - CloudFront-Key-Pair-Id

     Each with Domain=.yourapp.com, Path=/, Secure, HttpOnly, SameSite=Lax, Max-Age=43200.
  5. Browser automatically includes cookies when requesting any resource under CloudFront domain. Because S3 only trusts CloudFront (OAC) and CloudFront requires signed cookies, users must be logged in.

  Sample CloudFront cookie issuance

  import { getSignedCookies } from 'aws-cloudfront-sign';
  import { addHours } from 'date-fns';

  const CF_DOMAIN = process.env.CLOUDFRONT_DOMAIN!;
  const KEY_PAIR_ID = process.env.CF_KEY_PAIR_ID!;
  const PRIVATE_KEY = process.env.CF_PRIVATE_KEY!.replace(/\\n/g, '\n');

  fastify.get('/api/materials/:courseId/cf-cookie', { preHandler: [requireUser] }, async (req, reply) => {
    const { courseId } = req.params;
    assertUserHasAccess(req.user.id, courseId);

    const expires = addHours(new Date(), 12).getTime();
    const cookies = getSignedCookies(
      `https://${CF_DOMAIN}/materials/${courseId}/*`,
      { keypairId: KEY_PAIR_ID, privateKeyString: PRIVATE_KEY, expireTime: expires },
    );

    reply
      .setCookie('CloudFront-Policy', cookies['CloudFront-Policy'], {
        httpOnly: true, secure: true, sameSite: 'lax', domain: process.env.COOKIE_DOMAIN, maxAge: 12 * 3600,
      })
      .setCookie('CloudFront-Signature', cookies['CloudFront-Signature'], { ... })
      .setCookie('CloudFront-Key-Pair-Id', cookies['CloudFront-Key-Pair-Id'], { ... })
      .status(204)
      .send();
  });

  Video player (Next.js component) uses <video> or HLS/SHaka pointing to https://<cf-domain>/videos/<courseId>/<manifest>.m3u8. Because cookies are HttpOnly, fetch/HLS requests automatically include
  them.

  ———

  ### 4. Infrastructure as Code

  #### Terraform (S3 + CloudFront + OAC)

  variable "domain" {}
  variable "cf_price_class" { default = "PriceClass_100" }

  resource "aws_s3_bucket" "training" {
    bucket = "training-assets-${var.domain}"
    force_destroy = false

    cors_rule {
      allowed_methods = ["PUT", "POST", "GET"]
      allowed_origins = ["https://${var.domain}", "https://admin.${var.domain}"]
      allowed_headers = ["*"]
    }

    lifecycle_rule {
      id      = "tmp-uploads"
      enabled = true
      prefix  = "uploads/admin/"
      expiration { days = 7 }
    }
  }

  resource "aws_cloudfront_origin_access_control" "oac" {
    name                              = "training-oac"
    origin_access_control_origin_type = "s3"
    signing_behavior                  = "always"
    signing_protocol                  = "sigv4"
  }

  resource "aws_cloudfront_distribution" "training" {
    enabled             = true
    price_class         = var.cf_price_class
    default_root_object = ""

    origin {
      domain_name              = aws_s3_bucket.training.bucket_regional_domain_name
      origin_id                = "s3-training"
      origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
    }

    default_cache_behavior {
      target_origin_id       = "s3-training"
      viewer_protocol_policy = "https-only"
      allowed_methods        = ["GET", "HEAD"]
      cached_methods         = ["GET", "HEAD"]
      compress               = true
      forwarded_values {
        query_string = false
        cookies { forward = "none" }
      }
    }

    ordered_cache_behavior {
      path_pattern           = "/videos/*"
      target_origin_id       = "s3-training"
      viewer_protocol_policy = "https-only"
      allowed_methods        = ["GET", "HEAD"]
      cached_methods         = ["GET", "HEAD"]
      compress               = true
      trusted_key_groups     = []
      lambda_function_association {}
    }

    restrictions { geo_restriction { restriction_type = "none" } }
    viewer_certificate { cloudfront_default_certificate = true }
  }

  resource "aws_s3_bucket_policy" "allow_cf" {
    bucket = aws_s3_bucket.training.id
    policy = jsonencode({
      Version = "2012-10-17",
      Statement = [
        {
          Sid       = "AllowCloudFrontOAC",
          Effect    = "Allow",
          Principal = { Service = "cloudfront.amazonaws.com" },
          Action    = "s3:GetObject",
          Resource  = "${aws_s3_bucket.training.arn}/*",
          Condition = {
            StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.training.arn }
          }
        }
      ]
    })
  }

  #### AWS CDK (TypeScript) Equivalent

  import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
  import * as s3 from 'aws-cdk-lib/aws-s3';
  import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
  import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
  import { Construct } from 'constructs';

  export class TrainingInfraStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
      super(scope, id, props);

      const bucket = new s3.Bucket(this, 'TrainingAssets', {
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
        cors: [{
          allowedHeaders: ['*'],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: ['https://admin.example.com', 'https://app.example.com'],
        }],
      });

      const oac = new cloudfront.OriginAccessControl(this, 'OAC', {
        originAccessControlConfig: {
          name: 'training-oac',
          originAccessControlOriginType: 's3',
          signingBehavior: 'always',
          signingProtocol: 'sigv4',
        },
      });

      const dist = new cloudfront.Distribution(this, 'TrainingDist', {
        defaultBehavior: {
          origin: new origins.S3Origin(bucket, { originAccessControl: oac }),
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        additionalBehaviors: {
          '/videos/*': {
            origin: new origins.S3Origin(bucket, { originAccessControl: oac }),
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            trustedKeyGroups: [new cloudfront.KeyGroup(this, 'VideoKeyGroup', {
              items: [process.env.CF_PUBLIC_KEY_ID!],
            })],
          },
        },
      });

      bucket.addToResourcePolicy(new iam.PolicyStatement({
        sid: 'AllowCloudFrontAccess',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [`${bucket.bucketArn}/*`],
        conditions: {
          StringEquals: { 'AWS:SourceArn': dist.distributionArn },
        },
      }));

      new CfnOutput(this, 'CloudFrontDomain', { value: dist.distributionDomainName });
    }
  }

  ———

  ### 5. Frontend Integration

  - Admin dashboard uses React Query to call POST /api/admin/uploads/presign, handles multiple file uploads concurrently, displays progress bars. After upload, call POST /api/admin/materials with
    metadata (title, type, durations, cloudfrontUrl).
  - Public course page fetches materials via GET /api/materials?courseId=.... When user clicks download or player loads, ensure GET /api/materials/:courseId/cf-cookie has been called in the last 12h;
    fallback to re-request if CloudFront returns 403.
  - Video player uses HLS (e.g., @mux/mux-player or hls.js). Source URL: https://<cf-domain>/videos/<courseId>/<manifest>.m3u8.

  ———

  ### 6. Operations & Security Notes

  - Key Management: CloudFront RSA private key stored in AWS Secrets Manager; backend loads at boot (cache in memory). Rotate key pair quarterly.
  - Monitoring: CloudFront access logs to S3, Athena queries for auditing. S3 CloudTrail data events enabled on bucket.
  - Virus scanning: Optional Lambda triggered on s3:ObjectCreated:* for materials/*. Quarantine if necessary.
  - Lifecycle: raw uploads deleted after 7 days; published materials versioned.
  - Testing: Integration tests stub getSignedUrl with localstack; e2e tests confirm CloudFront cookie issuance + actual HLS playback via Cypress.

  ———

  Outcome

  - Admins never see AWS secrets; uploads expire in 30 min.
  - Learners only ever hit CloudFront; no direct S3 URIs leak.
  - Access requires login; CloudFront signed cookies expire after 12 h, forcing periodic re-auth.
  - Infrastructure codified in Terraform/CDK, ready for CI/CD pipelines (GitHub Actions → Terraform Cloud → CDK deploy).
