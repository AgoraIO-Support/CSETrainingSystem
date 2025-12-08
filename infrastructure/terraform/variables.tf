variable "region" {
  type    = string
  default = "us-east-1"
}

variable "bucket_name" {
  type = string
}

variable "project" {
  type    = string
  default = "training"
}

variable "cors_origins" {
  type    = list(string)
  default = ["https://admin.example.com", "https://app.example.com", "http://localhost:3000"]
}

variable "log_bucket_domain" {
  type = string
}

variable "cloudfront_public_key_path" {
  type = string
}
