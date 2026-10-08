"""
ingest/common/secrets.py
------------------------
API-key lookup. Locally keys come from environment variables (``.env``).
In Lambda (or with ``AERIS_SECRETS=aws``) they come from AWS Secrets Manager
under ``aeris/<NAME>`` and are cached in module scope, so a rotated secret is
picked up on the next cold start with no code change or redeploy.

Secret values are never logged.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache

logger = logging.getLogger(__name__)

SECRET_PREFIX = "aeris/"


class SecretError(RuntimeError):
    """A required secret could not be read from Secrets Manager."""


def _use_secrets_manager() -> bool:
    return bool(os.environ.get("AWS_LAMBDA_FUNCTION_NAME")) or os.environ.get("AERIS_SECRETS") == "aws"


@lru_cache(maxsize=None)
def get_secret(name: str) -> str:
    """Return secret ``name`` (e.g. ``"FIRMS_MAP_KEY"``); ``""`` if unset locally."""
    if not _use_secrets_manager():
        return os.environ.get(name, "")

    import boto3  # lazy: not needed for local runs

    secret_id = f"{SECRET_PREFIX}{name}"
    try:
        resp = boto3.client("secretsmanager").get_secret_value(SecretId=secret_id)
    except Exception as exc:  # noqa: BLE001 - surface any AWS failure uniformly
        raise SecretError(f"Could not read secret {secret_id}: {type(exc).__name__}") from exc
    logger.info("Loaded secret %s", secret_id)
    return resp["SecretString"].strip()
