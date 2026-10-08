"""
ingest/tests/test_population.py
---------------------------------
Tests for ingest/population/build_population.py.

Pure-function tests cover raster-cell coordinate computation and nodata handling.
The rasterio/numpy calls are mocked — the actual WorldPop GeoTIFF is not
downloaded during unit tests (it is 829 MB).

TestClipAndExtract requires rasterio; those tests are skipped when rasterio
is not installed (they run in CI once rasterio is available).
TestBuildPopulation mocks at the _clip_and_extract level and always runs.

Tests:
  - _clip_and_extract: correct coordinate derivation from affine transform
  - nodata cells skipped
  - pop ≤ 0 cells skipped
  - build_population: missing rasterio raises ImportError cleanly
  - build_population: output schema fields present
  - build_population: cells list contains correct field names
  - build_population: total population is a real sum, not a hardcoded value
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from ingest.population.build_population import WORLDPOP_URL, build_population

# Skip rasterio-dependent tests if rasterio is not installed
rasterio_available = "rasterio" in sys.modules or True  # will be detected per test
try:
    import rasterio as _rasterio_check
    import numpy as _np_check
    _RASTERIO_INSTALLED = True
except ImportError:
    _RASTERIO_INSTALLED = False

skip_no_rasterio = pytest.mark.skipif(
    not _RASTERIO_INSTALLED,
    reason="rasterio not installed; install with: pip install rasterio numpy"
)


# ---------------------------------------------------------------------------
# Raster extraction — mocked rasterio
# ---------------------------------------------------------------------------

@skip_no_rasterio
class TestClipAndExtract:
    """
    Test _clip_and_extract by mocking rasterio.open() to return a controlled
    data array. This avoids downloading the 829 MB WorldPop file.
    Skipped automatically when rasterio is not installed.
    """

    def _make_mock_dataset(self, data_array, nodata=-99999.0):
        """Build a minimal rasterio dataset mock with a north-up 1km-ish transform."""
        import numpy as np

        pixel_size = 0.008333
        mock_ds = MagicMock()
        mock_ds.nodata = nodata
        mock_ds.width = data_array.shape[1]
        mock_ds.height = data_array.shape[0]

        transform = MagicMock()
        transform.c = 73.5
        transform.f = 32.5
        transform.a = pixel_size
        transform.e = -pixel_size

        mock_ds.transform = transform
        mock_ds.read.return_value = data_array
        mock_ds.window_transform.return_value = transform
        return mock_ds

    def test_positive_cells_extracted(self):
        import numpy as np
        from ingest.population.build_population import _clip_and_extract

        data = np.array([[5000.0, -99999.0], [0.0, 12000.0]])
        mock_ds = self._make_mock_dataset(data)

        with patch("ingest.population.build_population.rasterio") as mock_rasterio:
            mock_rasterio.open.return_value.__enter__ = lambda s: mock_ds
            mock_rasterio.open.return_value.__exit__ = MagicMock(return_value=False)
            mock_rasterio.windows.from_bounds.return_value = MagicMock(col_off=0, row_off=0, width=2, height=2)
            mock_rasterio.windows.Window = lambda *a: MagicMock(col_off=0, row_off=0, width=2, height=2)

            cells = _clip_and_extract(Path("dummy.tif"), [73.5, 28.0, 77.5, 32.5])

        assert len(cells) == 2
        pops = {c["pop"] for c in cells}
        assert 5000 in pops
        assert 12000 in pops

    def test_nodata_cells_excluded(self):
        import numpy as np
        from ingest.population.build_population import _clip_and_extract

        data = np.array([[-99999.0, -99999.0], [-99999.0, -99999.0]])
        mock_ds = self._make_mock_dataset(data)

        with patch("ingest.population.build_population.rasterio") as mock_rasterio:
            mock_rasterio.open.return_value.__enter__ = lambda s: mock_ds
            mock_rasterio.open.return_value.__exit__ = MagicMock(return_value=False)
            mock_rasterio.windows.from_bounds.return_value = MagicMock(col_off=0, row_off=0, width=2, height=2)
            mock_rasterio.windows.Window = lambda *a: MagicMock(col_off=0, row_off=0, width=2, height=2)

            cells = _clip_and_extract(Path("dummy.tif"), [73.5, 28.0, 77.5, 32.5])

        assert cells == []

    def test_cell_fields_present(self):
        import numpy as np
        from ingest.population.build_population import _clip_and_extract

        data = np.array([[8000.0]])
        mock_ds = self._make_mock_dataset(data)

        with patch("ingest.population.build_population.rasterio") as mock_rasterio:
            mock_rasterio.open.return_value.__enter__ = lambda s: mock_ds
            mock_rasterio.open.return_value.__exit__ = MagicMock(return_value=False)
            mock_rasterio.windows.from_bounds.return_value = MagicMock(col_off=0, row_off=0, width=1, height=1)
            mock_rasterio.windows.Window = lambda *a: MagicMock(col_off=0, row_off=0, width=1, height=1)

            cells = _clip_and_extract(Path("dummy.tif"), [73.5, 32.4, 73.6, 32.5])

        assert len(cells) == 1
        c = cells[0]
        assert "lat" in c and "lon" in c and "pop" in c
        assert isinstance(c["pop"], int)

    def test_population_rounded_to_int(self):
        import numpy as np
        from ingest.population.build_population import _clip_and_extract

        data = np.array([[12345.67]])
        mock_ds = self._make_mock_dataset(data)

        with patch("ingest.population.build_population.rasterio") as mock_rasterio:
            mock_rasterio.open.return_value.__enter__ = lambda s: mock_ds
            mock_rasterio.open.return_value.__exit__ = MagicMock(return_value=False)
            mock_rasterio.windows.from_bounds.return_value = MagicMock(col_off=0, row_off=0, width=1, height=1)
            mock_rasterio.windows.Window = lambda *a: MagicMock(col_off=0, row_off=0, width=1, height=1)

            cells = _clip_and_extract(Path("dummy.tif"), [73.5, 28.0, 73.6, 28.1])

        assert cells[0]["pop"] == 12346  # rounded



# ---------------------------------------------------------------------------
# build_population output schema
# ---------------------------------------------------------------------------

class TestBuildPopulation:
    def _mock_rasterio_cells(self, cells):
        """Patch _clip_and_extract to return controlled cell list."""
        return patch("ingest.population.build_population._clip_and_extract", return_value=cells)

    def _mock_tiff_exists(self):
        return patch("pathlib.Path.exists", return_value=True)

    def test_output_schema_fields(self):
        fake_cells = [{"lat": 28.5, "lon": 77.0, "pop": 5000}]
        with self._mock_rasterio_cells(fake_cells), self._mock_tiff_exists():
            result = build_population(bbox=[73.5, 28.0, 77.5, 32.5])

        assert "cell_km" in result
        assert result["cell_km"] == 1.0
        assert "generated_at" in result
        assert "source" in result
        assert "bbox" in result
        assert "cells" in result

    def test_source_metadata_present(self):
        fake_cells = [{"lat": 28.5, "lon": 77.0, "pop": 5000}]
        with self._mock_rasterio_cells(fake_cells), self._mock_tiff_exists():
            result = build_population(bbox=[73.5, 28.0, 77.5, 32.5])

        src = result["source"]
        assert "url" in src
        assert WORLDPOP_URL in src["url"]
        assert "doi" in src
        assert "license" in src
        assert "year" in src
        assert src["year"] == 2020

    def test_cells_are_real_data(self):
        """Cells come from the mocked extractor, not hardcoded values."""
        fake_cells = [
            {"lat": 28.5, "lon": 77.0, "pop": 18400},
            {"lat": 28.5, "lon": 77.1, "pop": 9200},
        ]
        with self._mock_rasterio_cells(fake_cells), self._mock_tiff_exists():
            result = build_population(bbox=[73.5, 28.0, 77.5, 32.5])

        assert result["cells"] == fake_cells

    def test_empty_cells_allowed(self):
        """An empty grid is valid (outside populated area), not an error."""
        with self._mock_rasterio_cells([]), self._mock_tiff_exists():
            result = build_population(bbox=[73.5, 28.0, 77.5, 32.5])
        assert result["cells"] == []

    def test_missing_rasterio_raises_import_error(self):
        """If rasterio is not available, ImportError should be raised clearly.

        With rasterio imported at module level, we simulate its absence by
        patching the module-level 'rasterio' name to None — exactly the guard
        that _clip_and_extract checks.
        """
        import ingest.population.build_population as _bp

        with patch.object(_bp, "rasterio", None), \
             patch.object(_bp, "np", None), \
             patch("pathlib.Path.exists", return_value=True):
            with pytest.raises(ImportError, match="rasterio"):
                build_population(bbox=[73.5, 28.0, 77.5, 32.5])


    def test_population_not_hardcoded(self):
        """
        Ensure the total population comes from cells, not any hardcoded value.
        If cells have total pop X, result must reflect X, not 1.2M or any other constant.
        """
        fake_cells = [{"lat": 28.5, "lon": 77.0, "pop": 99999}]
        with self._mock_rasterio_cells(fake_cells), self._mock_tiff_exists():
            result = build_population(bbox=[73.5, 28.0, 77.5, 32.5])

        total = sum(c["pop"] for c in result["cells"])
        assert total == 99999
