#!/usr/bin/env bash
# Build and deploy the AERIS stack. Usage: ALERT_EMAIL=you@example.com scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

STACK="${AERIS_STACK:-aeris-foundation}"
REGION="${AWS_REGION:-ap-south-1}"
: "${ALERT_EMAIL:?Set ALERT_EMAIL to receive budget alerts}"

# Stage the Python packages (without tests) next to the Lambda Makefile; SAM builds from there.
PACKAGES=(ingest models agent pipeline api)
for pkg in "${PACKAGES[@]}"; do
  rm -rf "infra/lambda/$pkg"
  rsync -a --exclude tests --exclude __pycache__ --exclude notebooks "$pkg" infra/lambda/
done

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
  --parameter-overrides "AlertEmail=$ALERT_EMAIL" "MonthlyBudgetUsd=${MONTHLY_BUDGET_USD:-50}" \
    ${AGENT_MODEL_ID:+"AgentModelId=$AGENT_MODEL_ID"} \
    ${AGENT_FALLBACK_MODEL_IDS:+"AgentFallbackModelIds=$AGENT_FALLBACK_MODEL_IDS"}

aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query 'Stacks[0].Outputs' --output table
