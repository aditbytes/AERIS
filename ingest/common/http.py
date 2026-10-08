"""
ingest/common/http.py
---------------------
Shared HTTP helper with retry logic, timeouts, and secret-safe logging.

Rules:
- Never log full URLs that contain API keys.
- Never log response bodies that may contain credentials.
- Always use timeouts.
- Retry on transient server errors (5xx, connection errors).
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any

import requests
from requests import Response
from requests.exceptions import ConnectionError, ReadTimeout, Timeout

logger = logging.getLogger(__name__)

# Default request settings
DEFAULT_TIMEOUT_S: int = 30
DEFAULT_MAX_RETRIES: int = 3
DEFAULT_BACKOFF_S: float = 2.0


class UpstreamError(RuntimeError):
    """Raised when an upstream API returns a non-recoverable error."""

    def __init__(self, source: str, status_code: int | None, message: str) -> None:
        self.source = source
        self.status_code = status_code
        super().__init__(f"[{source}] HTTP {status_code}: {message}")


_QUERY_SECRET = re.compile(r"(?i)((?:api[_-]?key|key|token|secret)=)[^&\s'\")]+")
_LONG_TOKEN = re.compile(r"[A-Za-z0-9]{32,}")


def scrub(text: object) -> str:
    """Redact API keys from text (query-string secrets and long tokens, e.g. FIRMS' path key)."""
    return _LONG_TOKEN.sub("***", _QUERY_SECRET.sub(r"\1***", str(text)))


def _safe_url(url: str) -> str:
    """Return a URL stripped of any query-string parameters for safe logging."""
    return url.split("?")[0]


def get(
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    source_name: str = "upstream",
    timeout: int = DEFAULT_TIMEOUT_S,
    max_retries: int = DEFAULT_MAX_RETRIES,
    backoff: float = DEFAULT_BACKOFF_S,
    stream: bool = False,
) -> Response:
    """
    Perform a GET request with retry/backoff.

    The URL base (without query-string) is logged; full URLs with embedded keys
    are never logged.

    Raises:
        UpstreamError: on HTTP 4xx/5xx after all retries are exhausted.
        UpstreamError: on persistent connection / timeout errors.
    """
    safe = _safe_url(url)
    attempt = 0

    while True:
        attempt += 1
        try:
            logger.debug("[%s] GET %s (attempt %d)", source_name, safe, attempt)
            resp = requests.get(
                url,
                params=params,
                headers=headers,
                timeout=timeout,
                stream=stream,
            )
        except (ConnectionError, Timeout, ReadTimeout) as exc:
            if attempt >= max_retries:
                raise UpstreamError(
                    source_name, None, f"Connection error after {attempt} attempts: {scrub(exc)}"
                ) from exc
            wait = backoff * (2 ** (attempt - 1))
            logger.warning(
                "[%s] Connection error on attempt %d, retrying in %.1fs: %s",
                source_name,
                attempt,
                wait,
                scrub(exc),
            )
            time.sleep(wait)
            continue

        if resp.status_code == 200:
            logger.debug("[%s] 200 OK — %d bytes", source_name, len(resp.content))
            return resp

        if resp.status_code in (429, 503) and attempt < max_retries:
            # Rate-limited or service unavailable — back off and retry
            retry_after = int(resp.headers.get("Retry-After", backoff * (2 ** (attempt - 1))))
            logger.warning(
                "[%s] HTTP %d on attempt %d, retrying in %ds",
                source_name,
                resp.status_code,
                attempt,
                retry_after,
            )
            time.sleep(retry_after)
            continue

        if resp.status_code >= 500 and attempt < max_retries:
            wait = backoff * (2 ** (attempt - 1))
            logger.warning(
                "[%s] HTTP %d on attempt %d, retrying in %.1fs",
                source_name,
                resp.status_code,
                attempt,
                wait,
            )
            time.sleep(wait)
            continue

        # Non-retriable error
        raise UpstreamError(source_name, resp.status_code, scrub(resp.text[:200]))


def post(
    url: str,
    *,
    data: str | bytes | dict | None = None,
    json: Any = None,
    headers: dict[str, str] | None = None,
    source_name: str = "upstream",
    timeout: int = DEFAULT_TIMEOUT_S,
    max_retries: int = DEFAULT_MAX_RETRIES,
    backoff: float = DEFAULT_BACKOFF_S,
) -> Response:
    """
    Perform a POST request with retry/backoff.
    """
    safe = _safe_url(url)
    attempt = 0

    while True:
        attempt += 1
        try:
            logger.debug("[%s] POST %s (attempt %d)", source_name, safe, attempt)
            resp = requests.post(
                url,
                data=data,
                json=json,
                headers=headers,
                timeout=timeout,
            )
        except (ConnectionError, Timeout, ReadTimeout) as exc:
            if attempt >= max_retries:
                raise UpstreamError(
                    source_name, None, f"Connection error after {attempt} attempts: {scrub(exc)}"
                ) from exc
            wait = backoff * (2 ** (attempt - 1))
            logger.warning(
                "[%s] Connection error on attempt %d, retrying in %.1fs: %s",
                source_name,
                attempt,
                wait,
                scrub(exc),
            )
            time.sleep(wait)
            continue

        if resp.status_code == 200:
            logger.debug("[%s] 200 OK — %d bytes", source_name, len(resp.content))
            return resp

        if resp.status_code in (429, 503) and attempt < max_retries:
            retry_after = int(resp.headers.get("Retry-After", backoff * (2 ** (attempt - 1))))
            logger.warning(
                "[%s] HTTP %d on attempt %d, retrying in %ds",
                source_name,
                resp.status_code,
                attempt,
                retry_after,
            )
            time.sleep(retry_after)
            continue

        if resp.status_code >= 500 and attempt < max_retries:
            wait = backoff * (2 ** (attempt - 1))
            logger.warning(
                "[%s] HTTP %d on attempt %d, retrying in %.1fs",
                source_name,
                resp.status_code,
                attempt,
                wait,
            )
            time.sleep(wait)
            continue

        raise UpstreamError(source_name, resp.status_code, scrub(resp.text[:200]))
