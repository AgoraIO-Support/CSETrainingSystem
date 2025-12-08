terraform {
  required_version = "~> 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

provider "aws" {
  region = var.region
}

resource "aws_s3_bucket" "training" {
  bucket = var.bucket_name
  force_destroy = false

  lifecycle_rule {
    id      = "tmp-uploads"
    enabled = true
    prefix  = "uploads/admin/"

    expiration {
      days = 3
    }
  }

  cors_rule {
    allowed_methods = ["PUT", "POST", "GET"]
    allowed_origins = var.cors_origins
    allowed_headers = ["*"]
  }

  versioning {
    enabled = true
  }

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
}

resource "aws_cloudfront_origin_access_control" "oac" {
  name                              = "${var.project}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "training" {
  enabled             = true
  comment             = "${var.project} training materials"
  price_class         = "PriceClass_100"
  default_root_object = ""
  is_ipv6_enabled     = true

  origin {
    domain_name              = aws_s3_bucket.training.bucket_regional_domain_name
    origin_id                = "s3-${var.bucket_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-${var.bucket_name}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.materials.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    trusted_key_groups         = [aws_cloudfront_key_group.materials.id]
  }

  ordered_cache_behavior {
    path_pattern               = "/videos/*"
    target_origin_id           = "s3-${var.bucket_name}"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = aws_cloudfront_cache_policy.streaming.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    trusted_key_groups         = [aws_cloudfront_key_group.materials.id]
  }

  logging_config {
    include_cookies = false
    bucket          = var.log_bucket_domain
    prefix          = "cloudfront/${var.project}/"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_cloudfront_cache_policy" "materials" {
  name        = "${var.project}-materials-policy"
  default_ttl = 3600
  max_ttl     = 86400
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config { cookie_behavior = "none" }
    headers_config { header_behavior = "none" }
    query_strings_config { query_string_behavior = "none" }
  }
}

resource "aws_cloudfront_cache_policy" "streaming" {
  name        = "${var.project}-videos-policy"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config { cookie_behavior = "none" }
    headers_config { header_behavior = "none" }
    query_strings_config { query_string_behavior = "none" }
  }
}

resource "aws_cloudfront_response_headers_policy" "security" {
  name = "${var.project}-security"
  security_headers_config {
    content_security_policy {
      content_security_policy = "default-src 'self'"
      override                = false
    }
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
  }
}

resource "aws_cloudfront_public_key" "materials" {
  name       = "${var.project}-cf-public-key"
  encoded_key = file(var.cloudfront_public_key_path)
}

resource "aws_cloudfront_key_group" "materials" {
  name  = "${var.project}-key-group"
  items = [aws_cloudfront_public_key.materials.id]
}

resource "aws_s3_bucket_policy" "cloudfront" {
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
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.training.arn
          }
        }
      }
    ]
  })
}
