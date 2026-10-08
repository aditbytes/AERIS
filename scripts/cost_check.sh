#!/usr/bin/env bash
# Read-only check for things that bill while idle, plus month-to-date spend.
# Usage: scripts/cost_check.sh      (exit 1 if anything idle-billable is found)
set -uo pipefail

REGION="${AWS_REGION:-ap-south-1}"
found=0

check() {
  local label="$1"; shift
  local out
  out=$("$@" 2>&1)
  if [[ -n "$out" && "$out" != "None" ]]; then
    echo "!! $label:"; echo "$out" | sed 's/^/   /'; found=1
  else
    echo "ok $label: none"
  fi
}

check "SageMaker endpoints" aws sagemaker list-endpoints --region "$REGION" --query 'Endpoints[].EndpointName' --output text
check "NAT gateways" aws ec2 describe-nat-gateways --region "$REGION" --filter Name=state,Values=available,pending --query 'NatGateways[].NatGatewayId' --output text
check "Running EC2 instances" aws ec2 describe-instances --region "$REGION" --filters Name=instance-state-name,Values=running,pending --query 'Reservations[].Instances[].InstanceId' --output text
check "Unattached Elastic IPs" aws ec2 describe-addresses --region "$REGION" --query 'Addresses[?AssociationId==null].PublicIp' --output text

start=$(date -u +%Y-%m-01)
end=$(date -u -v+1d +%Y-%m-%d 2>/dev/null || date -u -d tomorrow +%Y-%m-%d)
echo "Month-to-date cost by service ($start to $end):"
aws ce get-cost-and-usage --region us-east-1 --time-period "Start=$start,End=$end" \
  --granularity MONTHLY --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE \
  --query 'ResultsByTime[0].Groups[?Metrics.UnblendedCost.Amount>`0.005`].[Keys[0],Metrics.UnblendedCost.Amount]' \
  --output text | sort -k2 -rn | sed 's/^/   /'

exit $found
