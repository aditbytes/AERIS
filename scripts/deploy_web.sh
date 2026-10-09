#!/usr/bin/env bash
# Build web/ against the deployed API and publish it behind CloudFront.
# Usage: scripts/deploy_web.sh   (run after scripts/deploy.sh)
set -euo pipefail
cd "$(dirname "$0")/.."

STACK="${AERIS_STACK:-aeris-foundation}"
REGION="${AWS_REGION:-ap-south-1}"

output() {
  aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

API_URL=$(output ApiUrl)
WEB_BUCKET=$(output WebBucketName)
DIST_ID=$(output WebDistributionId)
WEB_URL=$(output WebUrl)
for v in API_URL WEB_BUCKET DIST_ID; do
  [[ -n "${!v}" && "${!v}" != "None" ]] || { echo "Stack output for $v missing; run scripts/deploy.sh first" >&2; exit 1; }
done

(cd web && npm ci --silent && VITE_API_BASE_URL="$API_URL" npm run build)

# Hashed assets cache for a year; index.html must revalidate so new deploys show up.
aws s3 sync web/dist "s3://$WEB_BUCKET" --region "$REGION" --delete \
  --exclude index.html --exclude "data/*" --cache-control "public,max-age=31536000,immutable"
# public/data/ files (map boundary) are not content-hashed
aws s3 sync web/dist/data "s3://$WEB_BUCKET/data" --region "$REGION" --delete \
  --cache-control "public,max-age=300"
aws s3 cp web/dist/index.html "s3://$WEB_BUCKET/index.html" --region "$REGION" \
  --cache-control "no-cache" --content-type "text/html"

aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" \
  --query 'Invalidation.Id' --output text

echo "Web: $WEB_URL  (API: $API_URL)"
