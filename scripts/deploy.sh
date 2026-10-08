#!/usr/bin/env bash
# Deploy the AERIS foundation stack. Usage: ALERT_EMAIL=you@example.com scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

STACK="${AERIS_STACK:-aeris-foundation}"
REGION="${AWS_REGION:-ap-south-1}"
: "${ALERT_EMAIL:?Set ALERT_EMAIL to receive budget alerts}"

aws cloudformation validate-template --region "$REGION" --template-body file://infra/template.yaml >/dev/null
aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK" \
  --template-file infra/template.yaml \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides "AlertEmail=$ALERT_EMAIL" "MonthlyBudgetUsd=${MONTHLY_BUDGET_USD:-50}"

aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query 'Stacks[0].Outputs' --output table
