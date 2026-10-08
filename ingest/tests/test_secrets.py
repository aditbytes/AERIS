"""Tests for ingest.common.secrets (no real keys or AWS calls)."""

import sys
import types

import pytest

from ingest.common import secrets


@pytest.fixture(autouse=True)
def _clear_cache():
    secrets.get_secret.cache_clear()
    yield
    secrets.get_secret.cache_clear()


def test_local_reads_env(monkeypatch):
    monkeypatch.delenv("AWS_LAMBDA_FUNCTION_NAME", raising=False)
    monkeypatch.delenv("AERIS_SECRETS", raising=False)
    monkeypatch.setenv("SOME_KEY", "from-env")
    assert secrets.get_secret("SOME_KEY") == "from-env"


def test_local_unset_is_empty(monkeypatch):
    monkeypatch.delenv("AWS_LAMBDA_FUNCTION_NAME", raising=False)
    monkeypatch.delenv("AERIS_SECRETS", raising=False)
    monkeypatch.delenv("NOPE_KEY", raising=False)
    assert secrets.get_secret("NOPE_KEY") == ""


def _fake_boto3(monkeypatch, client):
    mod = types.ModuleType("boto3")
    mod.client = lambda name: client
    monkeypatch.setitem(sys.modules, "boto3", mod)


def test_lambda_reads_secrets_manager_and_caches(monkeypatch):
    calls = []

    class Client:
        def get_secret_value(self, SecretId):
            calls.append(SecretId)
            return {"SecretString": " value\n"}

    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "fn")
    _fake_boto3(monkeypatch, Client())
    assert secrets.get_secret("FIRMS_MAP_KEY") == "value"
    assert secrets.get_secret("FIRMS_MAP_KEY") == "value"
    assert calls == ["aeris/FIRMS_MAP_KEY"]


def test_lambda_failure_raises_without_leaking(monkeypatch):
    class Client:
        def get_secret_value(self, SecretId):
            raise RuntimeError("denied")

    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "fn")
    _fake_boto3(monkeypatch, Client())
    with pytest.raises(secrets.SecretError):
        secrets.get_secret("FIRMS_MAP_KEY")


def test_scrub_redacts_keys_in_urls():
    from ingest.common.http import scrub

    msg = (
        "Max retries exceeded with url: /resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69"
        "?api-key=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&format=json "
        "and /api/area/csv/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/VIIRS_SNPP_NRT/1,2,3,4/1"
    )
    out = scrub(msg)
    assert "a" * 56 not in out and "b" * 32 not in out
    assert "format=json" in out and "3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69" in out
