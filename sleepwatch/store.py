"""Supabase access for the daily job (secret key; bypasses row-level security).

Needs SUPABASE_URL and SUPABASE_SECRET_KEY in the environment (GitHub Actions secrets, or a
local .env file that is never committed).
"""
from __future__ import annotations

import json
import os
from datetime import date, datetime
from pathlib import Path

import httpx
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken


def load_dotenv(path: Path) -> None:
    if path.exists():
        for line in path.read_text("utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))


class Store:
    def __init__(self, url: str | None = None, key: str | None = None):
        url = url or os.environ["SUPABASE_URL"]
        key = key or os.environ["SUPABASE_SECRET_KEY"]
        self.http = httpx.Client(
            base_url=url.rstrip("/") + "/rest/v1",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=30,
        )

    def _check(self, r: httpx.Response) -> httpx.Response:
        if r.status_code >= 400:
            raise RuntimeError(f"Supabase {r.request.method} {r.request.url.path}: {r.status_code} {r.text[:300]}")
        return r

    def select(self, table: str, query: str = "select=*") -> list[dict]:
        rows, start = [], 0
        while True:  # PostgREST returns at most 1000 rows per request
            r = self._check(self.http.get(f"/{table}?{query}", headers={"Range": f"{start}-{start + 999}"}))
            batch = r.json()
            rows += batch
            if len(batch) < 1000:
                return rows
            start += 1000

    def upsert(self, table: str, rows: list[dict] | dict) -> None:
        if not rows:
            return
        self._check(self.http.post(
            f"/{table}", content=json.dumps(sanitize(rows), default=_json_default, allow_nan=False),
            headers={"Content-Type": "application/json",
                     "Prefer": "resolution=merge-duplicates,return=minimal"},
        ))

    def control(self, key: str) -> dict:
        rows = self.select("control", f"select=data&id=eq.{key}")
        return rows[0]["data"] if rows else {}

    def set_control(self, key: str, data: dict) -> None:
        self.upsert("control", {"id": key, "data": data, "updated_at": datetime.utcnow().isoformat() + "Z"})


def sanitize(o):
    """JSON has no NaN/Infinity: turn them (and pandas NA) into null, recursively."""
    import math
    if isinstance(o, dict):
        return {k: sanitize(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [sanitize(v) for v in o]
    if hasattr(o, "item") and not isinstance(o, (str, bytes)):
        try:
            o = o.item()
        except (ValueError, AttributeError):
            pass
    if isinstance(o, float) and not math.isfinite(o):
        return None
    if o is not None and type(o).__name__ in ("NAType", "NaTType"):
        return None
    return o


def _json_default(o):
    if isinstance(o, (date, datetime)):
        return o.isoformat()
    if hasattr(o, "item"):  # numpy scalars
        return o.item()
    raise TypeError(type(o))


class SupabaseTokenStorage:
    """COROS OAuth tokens kept in control/coros_auth, so the cloud job can refresh them."""

    def __init__(self, store: Store):
        self.store = store

    async def get_tokens(self):
        d = self.store.control("coros_auth").get("tokens")
        return OAuthToken(**d) if d else None

    async def set_tokens(self, tokens: OAuthToken) -> None:
        data = self.store.control("coros_auth")
        data["tokens"] = tokens.model_dump(mode="json", exclude_none=True)
        self.store.set_control("coros_auth", data)

    async def get_client_info(self):
        d = self.store.control("coros_auth").get("client_info")
        return OAuthClientInformationFull(**d) if d else None

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        data = self.store.control("coros_auth")
        data["client_info"] = client_info.model_dump(mode="json", exclude_none=True)
        self.store.set_control("coros_auth", data)
