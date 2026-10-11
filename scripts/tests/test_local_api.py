"""Local demo CORS accepts loopback hosts and rejects prefix lookalikes."""
import pytest
from scripts.local_api import local_origin


@pytest.mark.parametrize("origin", ["http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173"])
def test_local_dev_origin(origin):
    assert local_origin(origin) == origin


@pytest.mark.parametrize("origin", [None, "http://localhost.attacker.test", "http://localhost:bad", "http://localhost@attacker.test", "https://example.test", "http://localhost/private"])
def test_nonlocal_or_malformed_origin(origin):
    assert local_origin(origin) is None
