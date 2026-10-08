# 1.4 Storage Interface

> ⚠️ **No demo data.** AERIS uses only real data from live sources. Never create mock, sample, placeholder or fabricated data — not in code, UI, tests or as a fallback. If a live source is down, return an error and show an error state. Only real snapshots captured into `data/live/` (stamped with source and fetch time) are allowed offline.

Source: members doc section 3 (last item). Unblocks Meenal and Pritam.

## Design
`ingest/common/storage.py` exposes one interface:
- `read_json(key)`
- `write_json(key, obj)`

Two backends:
- **Local files** (default; what teammates use)
- **S3** (selected with `AERIS_STORAGE=s3`)

Teammates only call the interface, never boto3 directly.

## Rules
- Local backend writes under `data/live/` and only ever holds real fetched data
- Missing key raises a clear error — no default or invented payload
- Every written object carries source and fetch time

## Done when
Merged to `main`; same call works locally and against S3 with only the env var changed; announce to teammates.
