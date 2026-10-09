# Free hosted verification with CircleCI

## Why this alternative exists

On 2026-10-09, GitHub rejected both jobs for PR #19 before starting any steps.
The latest [pull-request run](https://github.com/sinhaaditya5/AERIS/actions/runs/37917735348)
and [push run](https://github.com/sinhaaditya5/AERIS/actions/runs/37917730872)
both report: "The job was not started because your account is locked due to a billing issue."

The repository is public, active and owned by a personal account. Its workflow
uses standard hosted runners and valid action tags. Public job metadata and
annotations were accessible; repository Actions settings returned HTTP 401.
GitHub CLI and an authenticated browser session were unavailable. GitHub's
public status reported Actions operational. The underlying reason for the
account lock is not exposed by these APIs; an unpaid balance or declined card
has not been established. No evidence supports changing YAML to clear this lock.

The GitHub workflow remains intact. CircleCI provides independent verification;
its results do not turn failed GitHub Actions checks into passing checks or
change any GitHub branch-protection requirements.

## Free plan and execution

CircleCI's [Free plan](https://circleci.com/pricing/) requires no credit card and
includes the `arm.medium` Docker resource class. Its [credit documentation](https://circleci.com/docs/guides/plans-pricing/credits/)
lists 30,000 monthly credits for personal usage and up to 400,000 credits for
public Linux open-source builds on the Free plan. This is a limited free
allowance, not unlimited compute. Keep the organization on Free; no paid plan,
payment method, trial upgrade or purchased credits are needed for this setup.

The configuration at [`.circleci/config.yml`](../.circleci/config.yml) uses
native [ARM64 Linux Docker workers](https://circleci.com/docs/guides/execution-managed/using-docker/)
and the official `python:3.12-bookworm` image, whose published platforms include
Linux ARM64. Each job checks the actual OS, architecture and Python version.
The full Debian image supplies GNU Make; no Docker daemon or AWS credentials
are needed for the existing SAM makefile build.

Both jobs run for every configured push, including PR branches:

| CircleCI check | Required verification |
|---|---|
| `python312-tests` | Root dependency installation, `pip check`, complete `pytest -ra` suite and compilation of owned modules |
| `lambda-package-verification` | Root dependency installation, `pip check`, isolated SAM CLI installation, runtime staging, real SAM build and the existing package-size guard |

The jobs share dependency-installation configuration, not generated packages.
Existing manifests, Makefile, stager, pruner and verifier remain the source of
deployment behavior. SAM tooling is installed in `/tmp/aeris-sam-cli`, separate
from the application's Python environment. Native ARM64 also makes pip's OS
and architecture dependency markers match the Lambda target.

The size job builds `.aws-sam/build/<FunctionLogicalId>` with the existing SAM
template, then measures all regular files plus each applicable layer using
`scripts/verify_lambda_dependencies.py`. The limit remains **262,144,000 bytes
per function including layers**. It retains the small JSON size report as a
CircleCI artifact rather than uploading every deployment package. Pytest
results are stored separately as JUnit XML. No deployment or AWS invocation is
part of this workflow.

## Activate it

The repository owner performs the following steps after manually publishing
these files on `feature/python312-lambda-verification`:

1. Sign in or sign up at [CircleCI](https://app.circleci.com/) and use a **Free**
   organization. Do not select a paid plan or add a payment method.
2. Create a project connected to `sinhaaditya5/AERIS`. If installing the CircleCI
   GitHub App, select only this repository for access.
3. Select the existing configuration at **`.circleci/config.yml`** from
   **`feature/python312-lambda-verification`**. Use this repository for both
   configuration and checkout. Choose **Use Existing Config / Finish setup**;
   do not ask CircleCI to generate or commit a replacement configuration.
4. Configure the GitHub App push trigger for **all pushes**. Keep pushes to
   branches with open PRs included. If configuring branch selection, use the
   triggering branch for configuration and checkout; for the initial manual
   run, select `feature/python312-lambda-verification` for both. `main` does not
   contain this new configuration until the owner merges it.
5. Trigger the first pipeline for that branch. Require **both** jobs to pass,
   inspect test failures and the `lambda-package-sizes.json` artifact, and
   confirm the checked-out commit matches PR #19's current head.

CircleCI documents [project creation](https://circleci.com/docs/guides/getting-started/create-project/)
and [trigger configuration](https://circleci.com/docs/guides/orchestrate/triggers-overview/).
Future push events should publish CircleCI results for the associated PR commit.
Existing required GitHub checks are preserved; if branch protection requires
those names, CircleCI does not automatically satisfy them. This change does not
edit branch protection, remove failed checks or make verification advisory.

## Verification boundaries

After adding this configuration on 2026-10-09, the official **CircleCI CLI
1.4.0** accepted it through `circleci config validate .circleci/config.yml
--json` (`valid: true`, exit 0), without account authentication or a hosted job.
Local checks confirmed both mandatory jobs, command ordering, the unchanged
byte limit and rejection of a non-Linux/non-ARM64 execution environment.

The isolated Windows AMD64 **Python 3.12.10** interpreter was
`C:\Users\LENOVO\AppData\Local\Temp\aeris-python312-8e172eae72cf4fad9d3e562798179a40\python.exe`.
It ran these checks, with test reports and caches kept in OS temporary paths:

| Local check | Result |
|---|---|
| `python -m pytest scripts/tests -q` | 38 passed |
| `python -m pytest -ra --junitxml=<temporary XML path>` | 570 passed, 2 warnings; JUnit confirms zero failures, errors or skips |
| `python -m pip check` | No broken requirements |
| `python scripts/verify_lambda_dependencies.py --config-only` | All 10 function configurations passed; wheels not checked |
| `python -m compileall -q ingest models agent pipeline api scripts infra/lambda/prune.py` | Passed |

The full suite used `-X utf8=0`, exercising Windows' default `cp1252` decoding.
The two warnings are existing pytest deprecations for class-scoped fixtures
defined as instance methods. SAM, GNU Make, Docker and WSL were unavailable
locally, so Linux dependency installation, SAM execution and actual deployment
package sizes were not reverified. No CircleCI project was created or activated.

Local Windows test results and configuration validation do not establish a
successful Linux SAM build. CircleCI must actually execute both jobs before
claiming hosted CI or deployment-package verification passed. Artifact JSON
deliberately makes no independent claim of SAM provenance: the successful SAM
step for the same pipeline establishes where the measured files came from.
Native Lambda import/invocation and an AWS deployment remain separate checks.
