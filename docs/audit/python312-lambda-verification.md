# Python 3.12 CI and Lambda verification

Verified locally on **2026-10-09**, on `feature/python312-lambda-verification`, starting from `e738143`. No commit, push, branch change, AWS invocation or deployment was performed.

## CI

`.github/workflows/python312.yml` runs on pull requests targeting `main`, pushes to `main` and `feature/**`, and manual dispatch. It uses official checkout/setup-python actions, explicit Python 3.12, pip caching and `contents: read` permissions.

One job installs `requirements.txt`, checks dependency consistency, runs the complete repository suite, and compiles the owned Python modules. A separate Linux Python 3.12 job uses the official AWS SAM setup action, stages runtime sources, runs `sam build`, then enforces the size limit on the actual output directories. Neither job deploys or requires AWS credentials.

**GitHub jobs remain unverified.** Runs on 2026-10-09 were rejected before any steps started because GitHub reported an account billing lock. Local results below are not remote CI results.

## Local runtime tests

The pre-existing interpreter is Windows AMD64 **Python 3.14.3**. Python 3.12 was initially absent. An isolated [official Python 3.12.10 embeddable runtime](https://www.python.org/downloads/release/python-31210/) and dependencies were placed in OS temporary directories; the existing `.venv` and system installation were not changed.

| Suite | Python 3.14.3 | Python 3.12.10 |
|---|---:|---:|
| `models/source_detection` | 90 passed | 90 passed |
| `models/plume` | 116 passed | 116 passed |
| `models/training` | 73 passed | 73 passed |
| Complete repository, final size-gate files | **570 passed, 0 failed** | **570 passed, 0 failed** |

The full suite includes **38 verifier, byte-accounting, pruning and staging tests**, all passing. Python 3.14 reports one existing Requests dependency warning. Python 3.12 reports two existing class-scoped fixture deprecation warnings from `models/tests/test_rank_sites.py` under pytest 9.1.1. No tests were skipped or weakened. The staged physics pipeline also replays copied real snapshots while rejecting Pydantic, offline ML and dependency test-suite imports.

Commands used `python -m pytest <suite> -q -p no:cacheprovider --basetemp=<unique OS temporary directory>` and the same command without `<suite>` for the full repository. Bytecode/cache output was kept outside the repository. All **90 owned Python files**, including the new packaging helpers, compiled under Python 3.12 and Python 3.14.

All ten configured handler callables imported successfully on both runtimes, without invoking their handlers. Critical scientific packages and optional inference imported on Python 3.12. A separate isolated agent environment imported actual Strands `Agent`, `ModelRetryStrategy`, `BedrockModel`, and `botocore.config.Config`.

Both clean Python 3.12 environments passed `pip check`: the root manifest installed 40 distributions and the agent manifest 49, excluding the temporary pip tool. The existing Python 3.14 environment's `pip check` reports unrelated missing dependencies of inherited `airos-chemistry` and `kaggle-environments`; that environment was left untouched.

## Lambda configuration and direct dependencies

Every configured function inherits **`python3.12` / `arm64`** from `Globals.Function`. No per-function override exists. The verifier reads defaults and overrides independently and checks each Makefile target against its effective configuration.

| Functions | Dependency manifest | Direct declarations |
|---|---|---|
| Firms, AQI, Weather, Sites | `infra/lambda/requirements.txt` | Requests |
| Publish, Detect, Corridor, Rank | `infra/lambda/requirements-pipeline.txt` | Shapely, PyProj, NumPy, scikit-learn, threadpoolctl |
| Agent | `infra/lambda/requirements-agent.txt` | Strands Agents, boto3, botocore, Pydantic |
| API | No additional dependency manifest | Runtime-provided boto3 |

`threadpoolctl` is explicitly declared for scikit-learn's production clustering path; root training/inference also imports it directly. `botocore.config.Config` is directly imported by the Bedrock agent and is explicitly declared there. Root requirements declare PyYAML for the SAM verifier. The pipeline manifest's unused Pydantic requirement was removed after auditing runtime imports; it remains in the agent and root manifests. Scientific dependency version requirements were unchanged.

SciPy and joblib are transitive scikit-learn dependencies. Rasterio remains a root dependency for one-time population preparation; no population Lambda is configured, so it was not added to production manifests. Agent and API source staging deliberately omit model packages: `pipeline.steps` loads each handler's implementation lazily. The production corridor remains the physics baseline.

## Target wheel compatibility

Target: **CPython 3.12, `cp312`, Linux ARM64, `manylinux2014_aarch64`, binary wheels only**.

| Manifest | Resolved/downloaded packages | Uncompressed wheel contents | Result |
|---|---:|---:|---|
| Ingestion | 5 | 2,194,804 bytes (2.1 MiB) | Passed |
| Pipeline | 14 | 258,124,217 bytes (246.2 MiB) | Passed |
| Agent | 48 | 61,888,554 bytes (59.0 MiB) | Passed with Linux-target marker resolution |

Ingestion and pipeline used pip target flags, including `--only-binary=:all: --platform manylinux2014_aarch64 --python-version 3.12 --implementation cp --abi cp312`. Pipeline downloads and temporary installation were also verified using actual Python 3.12.

The first agent pip download failed on Windows: MCP's Windows-only `pywin32` requirement was activated by the host OS despite the Linux target flags. This is a [documented pip environment-marker limitation](https://github.com/pypa/pip/issues/4304), not evidence of an incompatible Lambda dependency.

A temporary **uv 0.12.24** resolver used `uv pip compile infra/lambda/requirements-agent.txt --python <temporary Python 3.12 executable> --python-platform aarch64-manylinux_2_17 --python-version 3.12 --only-binary=:all: --no-cache --no-python-downloads --output-file <temporary pins file>`. This resolves [the target platform's markers](https://docs.astral.sh/uv/reference/cli/#uv-pip-compile). Pip then downloaded all 48 exact temporary pins with the ARM64 flags above and `--no-deps`. `pywin32` was absent, and every required wheel was available. No dependency substitutions, production pins or source builds were introduced. uv was used only in temporary local tooling; GitHub CI uses pip on Linux Python 3.12.

No unresolved target-wheel dependencies remain in these checks. Compatible wheel availability does not establish native ARM64 execution or a working deployment.

## Initial packaging-size check

Using actual Python 3.12 pip, the same 14 pipeline wheels were installed into separate temporary targets with and without compilation. Each included `ingest`, `models` and `pipeline` source staging, excluding `tests`, `__pycache__` and `notebooks`, matching the deployment script.

| Temporary cross-platform assembly | Files | Uncompressed bytes | Against 250 MiB (262,144,000 bytes) |
|---|---:|---:|---|
| Default compilation | 6,179 | 315,004,731 (300.4 MiB) | Exceeds limit |
| `--no-compile` | 3,849 | 258,837,171 (246.8 MiB) | Fits; 3,306,829 bytes remaining |

Default compilation created 2,330 `.pyc` files totaling 56,021,177 bytes. The Makefile now specifies **`--no-compile`**, explicit CPython implementation and `cp312` ABI. This fixes the demonstrated bytecode overhead without changing model code or dependency version requirements. The verifier rejects install recipes that omit these flags.

These were **temporary cross-platform package assemblies**, not SAM builds. The 246.8 MiB measurement included installed dependencies/metadata and the original staged source files, not only wheel sizes. Runtime-provided libraries were correctly excluded and there were no attached layers. It did not measure all other package layouts, did not represent Linux SAM output, and the original verifier only warned about wheel sizes. The final gate below supersedes its size/headroom estimate.

## Final package-size gate

All ten functions have `CodeUri: lambda/`, resolved relative to `infra/template.yaml` as `infra/lambda/`, with `BuildMethod: makefile`. SAM deploys each target's `ARTIFACTS_DIR`, not every file in this shared source directory. The Makefile defines four distinct layouts. `Globals.Function` and all function properties contain **no attached layers**; there are no layer resources or custom runtime packages in this template.

Exact **local cross-platform assembly** measurements after cleanup:

Machine-readable sizes, selected dependency versions, input hashes and verification provenance are recorded in [`lambda-package-sizes.json`](lambda-package-sizes.json).

| Functions | Copied source packages | Installed distributions | Files | Package + layers bytes | Headroom bytes |
|---|---|---:|---:|---:|---:|
| Firms, AQI, Weather, Sites | `ingest` | 5 | 141 | **2,279,580** | 259,864,420 |
| Publish, Detect, Corridor, Rank | `ingest`, `models`, `pipeline` | 9 | 2,067 | **223,089,714** | 39,054,286 |
| Agent | `ingest`, `agent`, `pipeline` | 48 | 4,051 | **62,024,556** | 200,119,444 |
| API | `ingest`, `api` | 0 | 23 | **92,372** | 262,051,628 |

Layer bytes are **zero for every function**. The limit is **262,144,000 bytes (250 MiB)** for a ZIP-based function including its layers/custom runtime. [AWS documents this aggregate limit and its use of binary MB units](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html). Sizes are per deployment package; shared CodeUri files or other functions' identical packages are not added together.

The local check used actual Python 3.12 pip installation of the verified Linux ARM64 wheels in fresh temporary directories, the exact source-package lists read from each Makefile target, the shared source stager, and the same artifact pruner called by the Makefile. The pipeline kept its previously resolved scientific versions. Agent installation used the previously verified 48 Linux-target pins to avoid Windows pip markers. Every regular file remaining in the artifact directory is counted, including `.so` libraries, assets, licenses and `.dist-info` metadata. Disk allocation, compressed wheel/ZIP sizes and runtime-provided boto3 do not count. Wheel bytes are not added again after installation. Local counts can differ slightly from Linux SAM output because pip-generated platform scripts/installation metadata and future dependency resolution can differ; **CI measures the real SAM directories instead of these estimates**.

`scripts/stage_lambda_sources.py` is now shared by deployment and CI. It omits source tests, notebooks, caches, bytecode, documentation and `models/training` from Lambda staging, while preserving runtime assets such as `agent/prompts/system.md` and any `models/plume/params.json`. Original repository source files remain intact. The optional ML surrogate is not a Lambda runtime dependency.

`infra/lambda/prune.py` removes reviewed `tests` directories from NumPy, SciPy, scikit-learn, Shapely and Certifi; bytecode/caches; and unused console entry points in `bin/`. It preserves NumPy's `testing` API, private testing helpers/native modules, all production libraries, SDK assets, licenses and metadata. The old pipeline assembly contained 28,240,372 bytes of bundled dependency test suites. SciPy, joblib and threadpoolctl remain because scikit-learn needs them for production detection, not just offline training. No scientific versions, algorithms or equations were changed.

The new `--artifacts-dir` mode sums all files in each built function directory and each attached layer. Global SAM layer lists are combined with function lists; repeated references are charged once per function. A shared layer is charged to every function that attaches it, not to unrelated functions. Distinct layer archives remain separate even when their runtime paths overlap. Layer directory/ZIP sizes are cached only to avoid repeated measurement, not to skip their applicable quota charges. Missing local layer artifacts or unresolved external/parameter layers fail closed; external layer bytes require `--layer-artifact KEY=PATH` and are never guessed or fetched from AWS. Unsupported links are rejected. Tests cover aggregate overflow caused by a layer and failure for missing artifacts.

CI now performs `sam build` followed by this guard. Deployment also runs the guard between `sam build` and `sam deploy`. It exits nonzero above the aggregate byte limit and reports each function's package bytes, layer bytes, total and remaining headroom. The CI report is written to `.aws-sam/build/package-sizes.json`, outside every deployed function directory. **This configuration has not yet run remotely; no local SAM build was possible.**

## Reusable verification

To check wheel resolution only on Linux Python 3.12:

```bash
python scripts/verify_lambda_dependencies.py
```

For offline configuration/manifest checks on either local runtime:

```bash
python scripts/verify_lambda_dependencies.py --config-only
```

To enforce actual package sizes after a local Linux SAM build (these commands do not deploy):

```bash
python scripts/stage_lambda_sources.py
sam build --template-file infra/template.yaml --build-dir .aws-sam/build
python scripts/verify_lambda_dependencies.py --artifacts-dir .aws-sam/build --report .aws-sam/build/package-sizes.json
```

Wheel/configuration-only modes explicitly do not enforce a final deployment-size limit. The artifact mode measures the actual build output without redownloading dependencies. The verifier never deploys, invokes AWS, or writes captured data.

## Unverified boundaries and integrity

SAM CLI and Docker are unavailable; WSL is not installed. **No actual SAM build, Lambda native ARM64 import/invocation, or deployment was performed.** Remote GitHub CI remains pending. Wheel metadata, Windows runtime tests and temporary package assembly do not replace those checks.

Source detection, plume equations, calibration, optional ML behavior and all real snapshots were unchanged. Historical observational calibration remains blocked by insufficient real history. No generated model binaries, wheels, environment directories or build outputs are repository changes. The Git index and starting commit remain unchanged; all task changes are unstaged for manual Git management.

All local size checks passed. Actual Linux SAM/CI output and native ARM64 execution remain pending verification.
