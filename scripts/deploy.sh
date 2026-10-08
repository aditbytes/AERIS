#!/usr/bin/env bash
# Build and deploy the AERIS stack. Usage: ALERT_EMAIL=you@example.com scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

STACK="${AERIS_STACK:-aeris-foundation}"
REGION="${AWS_REGION:-ap-south-1}"
: "${ALERT_EMAIL:?Set ALERT_EMAIL to receive budget alerts}"

# Stage ingest/ (without tests) next to the Lambda Makefile; SAM builds from there.
rm -rf infra/lambda/ingest
rsync -a --exclude tests --exclude __pycache__ ingest infra/lambda/

sam validate --region "$REGION" --template-file infra/template.yaml >/dev/null
sam build --template-file infra/template.yaml --build-dir .aws-sam/build
sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --region "$REGION" \
  --stack-name "$STACK" \
  --capabilities CAPABILITY_IAM \
  --resolve-s3 \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides "AlertEmail=$ALERT_EMAIL" "MonthlyBudgetUsd=${MONTHLY_BUDGET_USD:-50}"

aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query 'Stacks[0].Outputs' --output table
