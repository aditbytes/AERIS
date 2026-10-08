#!/usr/bin/env bash
# Delete the AERIS stack and empty its buckets first. Usage: scripts/teardown.sh
set -euo pipefail

STACK="${AERIS_STACK:-aeris-foundation}"
REGION="${AWS_REGION:-ap-south-1}"

for out in DataBucketName WebBucketName; do
  bucket=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$out'].OutputValue" --output text 2>/dev/null || true)
  if [ -n "$bucket" ] && [ "$bucket" != "None" ]; then
    echo "Emptying s3://$bucket"
    aws s3 rm "s3://$bucket" --recursive --region "$REGION" || true
  fi
done

aws cloudformation delete-stack --region "$REGION" --stack-name "$STACK"
aws cloudformation wait stack-delete-complete --region "$REGION" --stack-name "$STACK"
echo "Stack $STACK deleted."

# Lambda auto-created these before logs moved to /aeris/<stack>/ (never expire, not stack-owned)
for group in $(aws logs describe-log-groups --region "$REGION" \
    --log-group-name-prefix "/aws/lambda/$STACK-" --query 'logGroups[].logGroupName' --output text); do
  echo "Deleting log group $group"
  aws logs delete-log-group --region "$REGION" --log-group-name "$group"
done
