# Temporary Windows self-hosted runner diagnostic

The workflow at `.github/workflows/self-hosted-windows-diagnostic.yml` tests
whether GitHub can schedule a manually requested job on a Windows x64 machine.
It prints the runner OS, architecture, installed Python version, and a success
message. It checks out no repository code, installs nothing, requests no token
permissions, and has no pull-request or push trigger. It is restricted to
`sinhaaditya5/AERIS` on `feature/python312-lambda-verification`.

The existing `.github/workflows/python312.yml` remains unchanged, including its
Python 3.12 tests, dependency consistency check, compilation, SAM build, and
function-plus-layer size gate. This diagnostic does not replace those checks.
GitHub describes self-hosted runner usage as free, but that does not establish
that this account's billing restriction permits scheduling a self-hosted job.
Only an actual dispatched run can establish that.

## Publish the manual workflow first

GitHub requires a `workflow_dispatch` workflow to exist on the repository's
default branch before it can be triggered, including with `gh --ref`. The
default branch for this repository is `main`.

The owner must review and manually publish this diagnostic on both the feature
branch and `main`. A separate change containing only this diagnostic can make
it available on `main`; the existing PR does not need to be merged to activate
the probe. This local implementation does not stage, commit, push, merge, or
change branches. Keep the branch guard: selecting `main` for a run will skip
the diagnostic job.

See [GitHub's manual workflow instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

## Register a Windows x64 runner without sharing its token

Because AERIS is a public repository, prefer a disposable Windows VM on your
own PC, using a dedicated standard-user account with no personal credentials or
AWS secrets. A runner on your everyday desktop exposes that desktop to any job
it accepts. Manual-only triggers protect this diagnostic, but other workflows
in a public repository can be changed to target a self-hosted runner. Custom
labels and ephemeral registration are not security boundaries. Do not approve
or run untrusted pull-request jobs on this runner.

Use a foreground runner only for this reviewed experiment. Keep it offline
except while accepting the intended job, and verify the selected workflow,
branch, event, and matching queued jobs before starting it. If you cannot keep
other jobs from targeting the runner, use a disposable isolated VM rather than
your normal Windows session. See [GitHub's self-hosted runner security guidance](https://docs.github.com/en/actions/reference/security/secure-use#hardening-for-self-hosted-runners).

1. Sign in as the repository owner. Open
   [AERIS runner settings](https://github.com/sinhaaditya5/AERIS/settings/actions/runners),
   then **New self-hosted runner**. Select **Windows** and **x64**.
2. Use a runner directory outside `D:\AERIS`, for example
   `C:\actions-runner-aeris`. In Windows PowerShell, create it if it does not
   already exist and enter it:

   ```powershell
   New-Item -ItemType Directory -Path C:\actions-runner-aeris
   Set-Location C:\actions-runner-aeris
   ```

3. Execute the current download, checksum verification, and extraction commands
   shown by GitHub for Windows x64. Use the release URL and checksum from that
   page rather than a version copied from this document. Do not copy the
   token-bearing configuration command into a terminal or a file.
4. Confirm that `python --version` succeeds in this same PowerShell session.
   The probe reports the installed version; it does not require Python 3.12.
   Use the same standard-user session to configure and run the runner. Do not
   install it as a Windows service for this experiment; answer **N** if prompted.
5. Run this token-free command from the extracted runner directory:

   ```powershell
   .\config.cmd --url https://github.com/sinhaaditya5/AERIS `
     --name aeris-windows-diagnostic `
     --labels aeris-windows-diagnostic `
     --ephemeral --work _work
   ```

   When the runner asks for the registration token, paste the token from the
   GitHub settings page into that masked interactive prompt only. Do not put it
   in shell arguments, shell history, environment variables, screenshots,
   workflow YAML, documentation, chat, commits, or logs. The registration token
   expires after one hour; request a new one from the settings page if needed.
   The runner's generated credential files must also stay outside the repository.
6. Confirm the runner has all four labels: `self-hosted`, `Windows`, `X64`, and
   `aeris-windows-diagnostic`. Queue the reviewed manual run as described below,
   inspect matching jobs, then start the runner in the foreground:

   ```powershell
   .\run.cmd
   ```

   Ephemeral registration deregisters the runner after one job. It does not
   erase files or isolate execution. Stop an idle runner with **Ctrl+C** if the
   diagnostic cannot start; remove its registration in Settings if it remains
   registered. Keep the runner directory and any logs private.

See [GitHub's registration instructions](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)
and [runner label matching](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow).

## Dispatch and inspect the result

After publishing the workflow on `main` and the feature branch:

1. Open the repository's **Actions** tab.
2. Choose **Self-hosted Windows diagnostic (temporary)**.
3. Choose **Run workflow**, select
   **feature/python312-lambda-verification**, and confirm **Run workflow**.
4. Verify this is a `workflow_dispatch` run of the reviewed diagnostic, then
   allow the foreground runner to accept it.
5. Open **Windows x64 runner scheduling probe** and inspect its step log.

If you already have an authenticated GitHub CLI, the equivalent dispatch is:

```powershell
gh workflow run self-hosted-windows-diagnostic.yml --repo sinhaaditya5/AERIS --ref feature/python312-lambda-verification
gh run list --repo sinhaaditya5/AERIS --workflow self-hosted-windows-diagnostic.yml --limit 5
```

Use the actual run ID from the list to inspect logs:

```powershell
gh run view RUN_ID --repo sinhaaditya5/AERIS --log
```

Expected output includes:

```text
Runner OS: Windows
Runner architecture: X64
Python <installed version>
AERIS self-hosted runner diagnostic succeeded.
```

A successful run proves scheduling and these commands worked on the selected
runner. It does not prove AERIS tests passed, that Lambda artifacts were built,
or that GitHub-hosted jobs or the account's billing restriction were fixed.
If GitHub rejects this run before steps with the same billing error, this
experiment did not bypass that restriction. A queued or skipped job is not a
successful diagnostic. Cancel a queued run when finished investigating; the
five-minute job timeout does not limit how long it can wait for a runner.

## Conditional next step after a successful diagnostic

Propose a separate, manual-only Windows Python 3.12 test job for reviewed,
trusted commits. Run it on an isolated disposable runner, with an explicit
Python 3.12 interpreter and clean virtual environment. If it checks out code,
pin the reviewed commit and disable persisted checkout credentials. Retain
installation from `requirements.txt`, `pip check`, the complete `pytest -ra`
suite, and compilation. Never target this personal runner from public PR
events or use fork/PR refs as test inputs.

Keep the existing Linux Lambda packaging checks. The template specifies Python
3.12 and ARM64, and its Makefile uses GNU Make and POSIX commands to assemble
artifacts with CPython 3.12 `manylinux2014_aarch64` wheels. The current
`ubuntu-latest` job assembles those ARM64 artifacts on a Linux x64 host; it does
not prove native ARM64 execution. Native Windows tests cannot establish that
those Linux native dependencies import or that the SAM build succeeds. A
Windows x64 runner alone is insufficient.

A future packaging runner needs a Linux build environment, Python 3.12, the SAM
CLI, GNU Make/POSIX utilities, and the target ARM64 wheels. Prefer a separate
native Linux ARM64 runner for both building and runtime import verification.
Using your Windows PC instead requires a suitable Linux VM or WSL2 environment;
an ARM64 container build additionally requires Docker Linux containers, a
compatible Python 3.12 ARM64 SAM build image, `sam build --use-container`, and
verified ARM64 execution/emulation on the x64 host. WSL2 alone provides Linux
x64 on this PC, not ARM64 execution. The plain `sam build` command below is the
existing non-container build; installing Docker does not change that. These
requirements need to be checked before any workflow migration.
Cross-platform wheel downloads alone do not verify ARM64 execution or Linux
environment-marker resolution.

Reuse the existing sequence without dropping the size gate:

```sh
python scripts/stage_lambda_sources.py
sam build --template-file infra/template.yaml --build-dir .aws-sam/build
python scripts/verify_lambda_dependencies.py --artifacts-dir .aws-sam/build --report .aws-sam/build/package-sizes.json
```

Measure real SAM artifacts plus each function's applicable layers against
262,144,000 bytes, using the existing verifier. See
[SAM build documentation](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/using-sam-cli-build.html).
This is a proposal only; no packaging jobs have been moved or disabled. Linux
SAM build and remote CI results remain unverified until they actually run.

## Local validation status

Validation on Windows used Python **3.12.10** at
`C:\Users\LENOVO\AppData\Local\Temp\aeris-python312-8e172eae72cf4fad9d3e562798179a40\python.exe`.

- `actionlint` **1.7.12** passed both workflow files. Its official Windows
  release archive was checked against the release SHA-256 checksum. A temporary
  configuration declared `aeris-windows-diagnostic` as a custom runner label;
  no lint rules were suppressed and no repository lint configuration was added.
- PyYAML **6.0.3** parsed the new workflow; structural checks confirmed the
  manual-only trigger, empty permissions, labels, branch/repository guard,
  timeout, and static script with no checkout or external actions.
- The actual inline script passed the Windows PowerShell syntax parser and
  local execution with Python 3.12.10. Runner environment variables were
  supplied locally; this was not a GitHub run. Both Linux/X64 and Windows/ARM64
  contexts were rejected before the success message.
- `python scripts/verify_lambda_dependencies.py --config-only` passed all four
  deployment groups. Wheel availability was **not checked** by this mode.
- `python -m pytest -ra`: **570 passed, 3 warnings in 17.47 seconds**. Two
  warnings concern the existing class-scoped fixture deprecation; one reports
  Windows access denied while writing pytest's cache. No tests failed.
- Both new files passed strict UTF-8 decoding, final-newline, trailing-whitespace,
  and conflict-marker checks.
- `git diff --check` passed. SHA-256 comparison confirmed all 268 existing
  tracked files, including the original workflow and snapshots, stayed
  byte-for-byte unchanged. The Git index, HEAD, and branch also stayed unchanged;
  only the diagnostic workflow and this document were added as untracked files.

GitHub CLI, SAM CLI, Docker, GNU Make, and PowerShell 7 were unavailable on the
local PATH; the workflow uses installed Windows PowerShell instead. No Linux
SAM build, ARM64 runtime import check, deployment, or remote workflow run was
performed. No runner has been registered and no registration token was accessed.
The account's billing restriction remains unresolved. Remove the temporary
workflow and runner after the experiment when they are no longer needed.
