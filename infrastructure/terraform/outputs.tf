output "distribution_domain" {
  value = aws_cloudfront_distribution.training.domain_name
}

output "bucket_name" {
  value = aws_s3_bucket.training.bucket
}
