#!/bin/bash
# check-cloudfront-oac.sh
# Usage: ./check-cloudfront-oac.sh DISTRIBUTION_ID S3_BUCKET FILE_PATH

set -euo pipefail

DISTRIBUTION_ID=$1
S3_BUCKET=$2
FILE_PATH=$3

if [ -z "$DISTRIBUTION_ID" ] || [ -z "$S3_BUCKET" ] || [ -z "$FILE_PATH" ]; then
    echo "Usage: $0 DISTRIBUTION_ID S3_BUCKET FILE_PATH"
    exit 1
fi

echo "==> 1. Checking CloudFront distribution info..."
aws cloudfront get-distribution --id "$DISTRIBUTION_ID" --output json

echo ""
echo "==> 2. Checking distribution config (Origins, OAC)..."
# Avoid jq dependency by using --query where possible
ORIGIN_SUMMARY=$(aws cloudfront get-distribution-config --id "$DISTRIBUTION_ID" --query 'DistributionConfig.Origins.Items[0].{Id:Id,DomainName:DomainName,OriginAccessControlId:OriginAccessControlId,OriginPath:OriginPath}' --output table || true)
echo "$ORIGIN_SUMMARY"
ORIGIN_PATH=$(aws cloudfront get-distribution-config --id "$DISTRIBUTION_ID" --query 'DistributionConfig.Origins.Items[0].OriginPath' --output text 2>/dev/null || echo "")
OAC_ID=$(aws cloudfront get-distribution-config --id "$DISTRIBUTION_ID" --query 'DistributionConfig.Origins.Items[0].OriginAccessControlId' --output text 2>/dev/null || echo "")
echo "OriginPath: ${ORIGIN_PATH}"

echo ""
echo "==> 3. Checking OAC details..."
if [ -n "${OAC_ID:-}" ] && [ "${OAC_ID}" != "None" ] && [ "${OAC_ID}" != "null" ]; then
    aws cloudfront get-origin-access-control --id "$OAC_ID"
else
    echo "No OAC configured for this origin."
fi

echo ""
echo "==> 4. Checking S3 bucket policy..."
aws s3api get-bucket-policy --bucket "$S3_BUCKET" 2>/dev/null || echo "No bucket policy or cannot access."

echo ""
echo "==> 5. Checking S3 object ACL..."
aws s3api get-object-acl --bucket "$S3_BUCKET" --key "$FILE_PATH" || echo "Cannot fetch object ACL (object may not exist or access denied)."

echo ""
echo "==> 6. Checking CloudFront URL access..."
CF_DOMAIN=$(aws cloudfront get-distribution --id "$DISTRIBUTION_ID" --query "Distribution.DomainName" --output text)
# Normalize and adjust requested path against OriginPath so we don't double-prefix
OP_CLEAN=${ORIGIN_PATH#/}
OP_CLEAN=${OP_CLEAN%/}
FP_CLEAN=${FILE_PATH#/}
CF_PATH="$FP_CLEAN"
if [ -n "$OP_CLEAN" ] && [[ "$FP_CLEAN" == "$OP_CLEAN/"* ]]; then
  CF_PATH="${FP_CLEAN#${OP_CLEAN}/}"
fi

echo "CloudFront domain: $CF_DOMAIN"
echo "OriginPath (from distribution): '${ORIGIN_PATH}'"
echo "Requested FILE_PATH: '$FILE_PATH'"
echo "Adjusted path used for CloudFront request: '$CF_PATH'"
echo "Trying CloudFront URL: https://$CF_DOMAIN/$CF_PATH"
curl -I "https://$CF_DOMAIN/$CF_PATH"

echo ""
echo "==> 7. Checking direct S3 URL access..."
REGION=$(aws s3api get-bucket-location --bucket "$S3_BUCKET" --query "LocationConstraint" --output text)
if [ "$REGION" == "None" ]; then REGION="us-east-1"; fi
S3_URL="https://$S3_BUCKET.s3.$REGION.amazonaws.com/$FILE_PATH"
echo "Trying S3 URL: $S3_URL"
curl -I "$S3_URL" || echo "Direct S3 HEAD failed (this is expected if bucket blocks public access)."

echo ""
echo "==> 8. Checking bucket public access block..."
aws s3api get-public-access-block --bucket "$S3_BUCKET"
