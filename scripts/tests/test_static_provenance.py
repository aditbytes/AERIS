"""Static metadata describes the exact copied captures, not an invented replay."""
from pathlib import Path
import pytest
from scripts.publish_model_provenance import main, publication

ROOT = Path(__file__).resolve().parents[2]


def test_static_manifest_matches_committed_publication_bytes():
    main(["--check"])
    metadata = publication(ROOT / "web/public/data")
    assert metadata["artifacts"]["sources"]["artifact_status"] == "ARCHIVED_LEGACY"
    assert metadata["artifacts"]["corridor"]["artifact_status"] == "ARCHIVED_LEGACY"


def test_stale_static_manifest_fails_without_changing_snapshots(tmp_path):
    before = {}
    for name in ("sources.json", "corridor.geojson"):
        before[name] = (ROOT / "web/public/data" / name).read_bytes()
        (tmp_path / name).write_bytes(before[name])
    main(["--directory", str(tmp_path)])
    (tmp_path / "sources.json").write_bytes(before["sources.json"] + b" ")
    with pytest.raises(SystemExit) as error:
        main(["--directory", str(tmp_path), "--check"])
    assert error.value.code == 1
    assert (tmp_path / "corridor.geojson").read_bytes() == before["corridor.geojson"]


def test_git_newline_variants_share_disclosures_but_keep_distinct_hashes(tmp_path):
    for name in ("sources.json", "corridor.geojson"):
        raw = (ROOT / "web/public/data" / name).read_bytes()
        (tmp_path / name).write_bytes(raw.replace(b"\r\n", b"\n"))
    assert publication(tmp_path) == publication(ROOT / "web/public/data")
    for metadata in publication(tmp_path)["artifacts"].values():
        assert metadata["byte_variant"] == "GIT_COMMITTED_LF_COPY"
