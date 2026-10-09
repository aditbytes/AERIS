"""
Serve the AERIS API Lambda (api/handlers/app.py) over HTTP on localhost, reading
the real snapshots in data/live/. For UI work and for running the smoke test
without AWS. POST /run is disabled (no state machine locally).

Usage:
  python3 scripts/local_api.py            # http://localhost:8000
  VITE_API_BASE_URL=http://localhost:8000 npm run dev   (in web/)
"""

from __future__ import annotations

import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("AERIS_STORAGE", "local")

from api.handlers import app  # noqa: E402


class Handler(BaseHTTPRequestHandler):
    def _route_key(self, method: str, path: str) -> tuple[str, dict[str, str]]:
        if method == "GET" and path.startswith("/run/"):
            return "GET /run/{run_id}", {"run_id": path[len("/run/"):]}
        return f"{method} {path}", {}

    def _handle(self, method: str) -> None:
        url = urlsplit(self.path)
        route, params = self._route_key(method, url.path.rstrip("/") or "/")
        event = {"routeKey": route, "queryStringParameters": dict(parse_qsl(url.query)) or None, "pathParameters": params}
        resp = app.lambda_handler(event, None)
        body = resp["body"].encode()
        self.send_response(resp["statusCode"])
        for k, v in resp["headers"].items():
            self.send_header(k, v)
        origin = self.headers.get("Origin")
        if origin and origin.startswith("http://localhost"):
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        self._handle("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._handle("POST")


def main() -> None:
    port = int(os.environ.get("PORT", "8000"))
    print(f"AERIS local API on http://localhost:{port} (data: {os.environ.get('AERIS_DATA_DIR', 'data/live')})")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
