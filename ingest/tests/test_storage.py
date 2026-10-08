"""Tests for ingest.common.storage. Objects here only exercise the storage
plumbing (round-trip + validation); they are not data for any AERIS output."""

import json

import pytest

from ingest.common import storage

STAMPED = {"generated_at": "2026-10-08T00:00:00Z", "source": "storage-test", "items": [1, 2]}


class FakeS3:
    """In-memory stand-in for a boto3 S3 client."""

    class exceptions:
        class NoSuchKey(Exception):
            pass

    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, ContentType):
        self.objects[(Bucket, Key)] = Body

    def get_object(self, Bucket, Key):
        if (Bucket, Key) not in self.objects:
            raise self.exceptions.NoSuchKey()
        body = self.objects[(Bucket, Key)]
        return {"Body": type("B", (), {"read": lambda self_: body})()}


@pytest.fixture
def local(tmp_path, monkeypatch):
    monkeypatch.setenv("AERIS_STORAGE", "local")
    monkeypatch.setenv("AERIS_DATA_DIR", str(tmp_path))
    return tmp_path


def test_local_round_trip(local):
    storage.write_json("thing", STAMPED)
    assert (local / "thing.json").exists()
    assert storage.read_json("thing") == STAMPED


def test_geojson_extension(local):
    storage.write_json("sites", STAMPED, geojson=True)
    assert (local / "sites.geojson").exists()
    assert storage.read_json("sites", geojson=True) == STAMPED


def test_missing_key_raises(local):
    with pytest.raises(FileNotFoundError):
        storage.read_json("nope")


def test_unstamped_object_rejected(local):
    with pytest.raises(storage.StorageError):
        storage.write_json("bad", {"x": 1})


@pytest.mark.parametrize("key", ["", "/abs", "../escape"])
def test_bad_keys_rejected(local, key):
    with pytest.raises(storage.StorageError):
        storage.write_json(key, STAMPED)


def test_unknown_backend(monkeypatch):
    monkeypatch.setenv("AERIS_STORAGE", "ftp")
    with pytest.raises(storage.StorageError):
        storage.read_json("x")


def test_s3_requires_bucket(monkeypatch):
    monkeypatch.setenv("AERIS_STORAGE", "s3")
    monkeypatch.delenv("AERIS_S3_BUCKET", raising=False)
    with pytest.raises(storage.StorageError):
        storage.write_json("x", STAMPED)


def test_s3_round_trip(monkeypatch):
    fake = FakeS3()
    monkeypatch.setenv("AERIS_STORAGE", "s3")
    monkeypatch.setattr(
        storage, "get_backend", lambda: storage.S3Backend("b", "gold/", client=fake)
    )
    loc = storage.write_json("thing", STAMPED)
    assert loc == "s3://b/gold/thing.json"
    assert json.loads(fake.objects[("b", "gold/thing.json")]) == STAMPED
    assert storage.read_json("thing") == STAMPED
    with pytest.raises(FileNotFoundError):
        storage.read_json("missing")


def test_s3_slash_key_used_verbatim():
    be = storage.S3Backend("b", "gold/", client=FakeS3())
    assert be.write("bronze/fires", "{}", False) == "s3://b/bronze/fires.json"


def test_write_bronze_writes_stamped_and_latest(local):
    loc = storage.write_bronze("thing", STAMPED)
    assert "bronze/thing/" in loc
    assert storage.read_json("bronze/thing/latest") == STAMPED
    assert len(list((local / "bronze" / "thing").glob("*.json"))) == 2
