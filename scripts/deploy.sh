#!/usr/bin/env bash
# Build and deploy the AERIS stack. Usage: ALERT_EMAIL=you@example.com scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

STACK="${AERIS_STACK:-aeris-foundation}"
REGION="${AWS_REGION:-ap-south-1}"
: "${ALERT_EMAIL:?Set ALERT_EMAIL to receive budget alerts}"

# Always pass the agent models. On an existing stack, sam deploy keeps a parameter's
# previous value when it is not passed, so template defaults alone never update it.
AGENT_MODEL_ID="${AGENT_MODEL_ID:-global.anthropic.claude-sonnet-4-6}"
AGENT_FALLBACK_MODEL_IDS="${AGENT_FALLBACK_MODEL_IDS:-apac.amazon.nova-pro-v1:0,apac.amazon.nova-lite-v1:0,apac.amazon.nova-micro-v1:0}"

# Use the same runtime-only source staging as the package-size CI gate.
python3 scripts/stage_lambda_sources.py

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
    "AgentModelId=$AGENT_MODEL_ID" "AgentFallbackModelIds=$AGENT_FALLBACK_MODEL_IDS"

aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query 'Stacks[0].Outputs' --output table
