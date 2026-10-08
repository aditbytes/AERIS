"""
ingest/common/storage.py
------------------------
Storage interface for AERIS outputs. Callers use only:

    write_json(key, obj)   -> where it was written
    read_json(key)         -> the stored object

Two backends, chosen by the ``AERIS_STORAGE`` env var:

* ``local`` (default): files under ``data/live/`` (override with ``AERIS_DATA_DIR``)
* ``s3``: objects in ``AERIS_S3_BUCKET`` under ``AERIS_S3_PREFIX`` (default ``gold/``)

``key`` is a filename stem such as ``"fires"``. Pass ``geojson=True`` for
``.geojson`` objects. A key containing ``/`` is used verbatim as the S3 path
(e.g. ``"bronze/fires"``); locally it becomes a sub-directory.

Rules: a missing key raises ``FileNotFoundError`` (never a default payload),
and every dict written must carry a ``generated_at`` fetch time.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_DATA_DIR = "data/live"
_DEFAULT_S3_PREFIX = "gold/"


class StorageError(RuntimeError):
    """Storage is misconfigured or the object being written is invalid."""


def _ext(geojson: bool) -> str:
    return ".geojson" if geojson else ".json"


def _validate(key: str, obj: Any) -> None:
    if not key or key.startswith("/") or ".." in key.split("/"):
        raise StorageError(f"Invalid storage key: {key!r}")
    if isinstance(obj, dict):
        if not obj.get("generated_at"):
            raise StorageError(
                f"Refusing to write {key!r}: object has no 'generated_at' fetch time."
            )
        if not (obj.get("source") or obj.get("attribution")):
            logger.warning("%s has no top-level 'source'/'attribution' field", key)


class LocalBackend:
    def __init__(self, root: Path | None = None) -> None:
        if root is None:
            root = Path(os.environ.get("AERIS_DATA_DIR", _DEFAULT_DATA_DIR))
            if not root.is_absolute():
                root = _REPO_ROOT / root
        self.root = root

    def _path(self, key: str, geojson: bool) -> Path:
        return self.root / f"{key}{_ext(geojson)}"

    def write(self, key: str, body: str, geojson: bool) -> str:
        path = self._path(key, geojson)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")
        logger.info("Wrote %s (%d bytes)", path, len(body))
        return str(path)

    def read(self, key: str, geojson: bool) -> str:
        path = self._path(key, geojson)
        if not path.exists():
            raise FileNotFoundError(
                f"No snapshot at {path}. Run the fetcher first to generate live data."
            )
        return path.read_text(encoding="utf-8")


class S3Backend:
    def __init__(self, bucket: str, prefix: str = _DEFAULT_S3_PREFIX, client: Any = None) -> None:
        if not bucket:
            raise StorageError("AERIS_STORAGE=s3 requires AERIS_S3_BUCKET to be set.")
        if client is None:
            import boto3  # lazy: local backend must work without boto3 installed

            client = boto3.client("s3", region_name=os.environ.get("AWS_REGION"))
        self.bucket = bucket
        self.prefix = prefix
        self.client = client

    def _key(self, key: str, geojson: bool) -> str:
        base = key if "/" in key else f"{self.prefix}{key}"
        return f"{base}{_ext(geojson)}"

    def write(self, key: str, body: str, geojson: bool) -> str:
        s3_key = self._key(key, geojson)
        self.client.put_object(
            Bucket=self.bucket,
            Key=s3_key,
            Body=body.encode("utf-8"),
            ContentType="application/geo+json" if geojson else "application/json",
        )
        logger.info("Wrote s3://%s/%s (%d bytes)", self.bucket, s3_key, len(body))
        return f"s3://{self.bucket}/{s3_key}"

    def read(self, key: str, geojson: bool) -> str:
        s3_key = self._key(key, geojson)
        try:
            resp = self.client.get_object(Bucket=self.bucket, Key=s3_key)
        except self.client.exceptions.NoSuchKey as exc:
            raise FileNotFoundError(f"No object at s3://{self.bucket}/{s3_key}") from exc
        return resp["Body"].read().decode("utf-8")


def get_backend() -> LocalBackend | S3Backend:
    mode = os.environ.get("AERIS_STORAGE", "local").strip().lower()
    if mode == "local":
        return LocalBackend()
    if mode == "s3":
        return S3Backend(
            os.environ.get("AERIS_S3_BUCKET", ""),
            os.environ.get("AERIS_S3_PREFIX", _DEFAULT_S3_PREFIX),
        )
    raise StorageError(f"Unknown AERIS_STORAGE={mode!r}; expected 'local' or 's3'.")


def write_json(key: str, obj: Any, *, geojson: bool = False) -> str:
    """Serialise ``obj`` and store it under ``key``. Returns the location written."""
    _validate(key, obj)
    body = json.dumps(obj, indent=2, ensure_ascii=False)
    return get_backend().write(key, body, geojson)


def write_bronze(source: str, obj: Any, *, geojson: bool = False) -> str:
    """
    Store a raw fetch under ``bronze/<source>/<UTC stamp>`` and refresh
    ``bronze/<source>/latest``. Returns the timestamped location.
    """
    return _write_stamped("bronze", source, obj, geojson)


def write_reference(source: str, obj: Any, *, geojson: bool = False) -> str:
    """
    Like :func:`write_bronze` but under ``reference/``, which never expires.
    For one-time datasets (sites, population) that the pipeline reads forever.
    """
    return _write_stamped("reference", source, obj, geojson)


def _write_stamped(prefix: str, source: str, obj: Any, geojson: bool) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    loc = write_json(f"{prefix}/{source}/{stamp}", obj, geojson=geojson)
    write_json(f"{prefix}/{source}/latest", obj, geojson=geojson)
    return loc


def read_json(key: str, *, geojson: bool = False) -> Any:
    """Return the object stored under ``key``; raises ``FileNotFoundError`` if absent."""
    return json.loads(get_backend().read(key, geojson))
