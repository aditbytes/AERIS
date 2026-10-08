"""
End-to-end smoke test for the deployed AERIS stack. Live responses only.

1. POST /run and wait for the pipeline to finish (skip with --no-run)
2. GET every read route and check it against docs/data-contracts.md
3. Check the CORS header for the CloudFront origin
Exits 1 and lists every problem on any contract mismatch or failed run.
Stale data is reported as a warning: the API is meant to serve it, flagged.

Usage:
  python3 scripts/smoke_test.py                 # reads ApiUrl/WebUrl from the stack
  python3 scripts/smoke_test.py --api https://abc.execute-api.ap-south-1.amazonaws.com --no-run
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline.contracts import CHECKS, check_actions  # noqa: E402

ROUTES = {
    "/sources": "sources",
    "/corridor": "corridor",
    "/sites": "sites",
    "/ranked-sites": "ranked_sites",
    "/actions": "actions",
    "/stations": "aqi",
}
TIMEOUT = 30


def stack_outputs(stack: str, region: str) -> dict[str, str]:
    import boto3

    resp = boto3.client("cloudformation", region_name=region).describe_stacks(StackName=stack)
    return {o["OutputKey"]: o["OutputValue"] for o in resp["Stacks"][0].get("Outputs", [])}


def run_pipeline(api: str, wait_s: int) -> list[str]:
    r = requests.post(f"{api}/run", timeout=TIMEOUT)
    if r.status_code == 409:
        run_id = r.json()["message"].split()[1]
        print(f"run already in progress: {run_id}; waiting for it")
    elif r.status_code == 200:
        run_id = r.json()["run_id"]
        print(f"started run {run_id}")
    else:
        return [f"POST /run -> HTTP {r.status_code}: {r.text[:200]}"]

    deadline = time.time() + wait_s
    while time.time() < deadline:
        status = requests.get(f"{api}/run/{run_id}", timeout=TIMEOUT).json().get("status")
        if status == "succeeded":
            print(f"run {run_id} succeeded")
            return []
        if status != "running":
            return [f"run {run_id} ended with status {status!r}"]
        time.sleep(10)
    return [f"run {run_id} still running after {wait_s}s"]


def check_routes(api: str) -> tuple[list[str], list[str]]:
    problems, warnings, bodies = [], [], {}
    for route, name in ROUTES.items():
        r = requests.get(f"{api}{route}", timeout=TIMEOUT)
        if r.status_code != 200:
            problems.append(f"GET {route} -> HTTP {r.status_code}: {r.text[:200]}")
            continue
        if "max-age" not in r.headers.get("Cache-Control", ""):
            problems.append(f"GET {route}: no Cache-Control max-age")
        body = bodies[name] = r.json()
        problems += [f"GET {route}: {p}" for p in CHECKS[name](body)]
        if body.get("stale"):
            warnings.append(f"GET {route}: stale (age {body.get('age_seconds')} s)")
        print(f"GET {route}: ok")

    if "actions" in bodies and "ranked_sites" in bodies:
        ranked_ids = {s["site_id"] for s in bodies["ranked_sites"]["sites"]}
        problems += [f"actions vs ranked: {p}" for p in check_actions(bodies["actions"], ranked_ids) if "ranked site" in p]
        print(f"agent generator: {bodies['actions'].get('generator')}")

    for route in ("/summary", "/health"):
        r = requests.get(f"{api}{route}", timeout=TIMEOUT)
        if r.status_code != 200 or not r.json().get("generated_at"):
            problems.append(f"GET {route} -> HTTP {r.status_code}: {r.text[:200]}")
        else:
            print(f"GET {route}: ok")
    r = requests.get(f"{api}/ranked-sites", params={"type": "hospital", "limit": 3}, timeout=TIMEOUT)
    if r.status_code != 200 or any(s["type"] != "hospital" for s in r.json()["sites"]) or len(r.json()["sites"]) > 3:
        problems.append("GET /ranked-sites?type=hospital&limit=3 did not filter")
    return problems, warnings


def check_cors(api: str, origin: str) -> list[str]:
    r = requests.get(f"{api}/health", headers={"Origin": origin}, timeout=TIMEOUT)
    allowed = r.headers.get("Access-Control-Allow-Origin")
    return [] if allowed == origin else [f"CORS: {origin} not allowed (got {allowed!r})"]


def main() -> None:
    parser = argparse.ArgumentParser(description="AERIS end-to-end smoke test")
    parser.add_argument("--api", default=os.environ.get("API_BASE_URL"))
    parser.add_argument("--web", help="CloudFront URL for the CORS and page checks")
    parser.add_argument("--no-run", action="store_true", help="skip POST /run")
    parser.add_argument("--wait", type=int, default=900, help="seconds to wait for the run")
    parser.add_argument("--stack", default=os.environ.get("AERIS_STACK", "aeris-foundation"))
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", "ap-south-1"))
    args = parser.parse_args()

    if not args.api or not args.web:
        outs = stack_outputs(args.stack, args.region)
        args.api = args.api or outs["ApiUrl"]
        args.web = args.web or outs.get("WebUrl")
    api = args.api.rstrip("/")
    print(f"API {api}")

    problems = [] if args.no_run else run_pipeline(api, args.wait)
    route_problems, warnings = check_routes(api)
    problems += route_problems
    if args.web:
        problems += check_cors(api, args.web.rstrip("/"))
        try:
            page = requests.get(args.web, timeout=TIMEOUT)
        except requests.RequestException as exc:
            problems.append(f"GET {args.web}: {type(exc).__name__}")
        else:
            if page.status_code != 200 or "<div id=\"root\"" not in page.text:
                problems.append(f"GET {args.web} -> HTTP {page.status_code}, no app root")
            else:
                print(f"GET {args.web}: ok")

    for w in warnings:
        print(f"WARN  {w}")
    if problems:
        for p in problems:
            print(f"FAIL  {p}")
        sys.exit(1)
    print("SMOKE TEST PASSED")


if __name__ == "__main__":
    main()
