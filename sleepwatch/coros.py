"""COROS official MCP server: session with a saved OAuth login, and fetching nights."""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from datetime import date, timedelta

from mcp import ClientSession
from mcp.client.auth import OAuthClientProvider
from mcp.client.streamable_http import create_mcp_http_client, streamable_http_client
from mcp.shared.auth import OAuthClientMetadata

from .parse import parse_daily, parse_hrv, parse_rhr, parse_sleep

SERVERS = {
    "eu": "https://mcpeu.coros.com/mcp",
    "us": "https://mcpus.coros.com/mcp",
    "cn": "https://mcpcn.coros.com/mcp",
}
REDIRECT_URI = "http://localhost:8765/callback"


class LoginExpired(RuntimeError):
    pass


@asynccontextmanager
async def coros_session(storage, region: str = "eu"):
    """An initialized MCP session using a saved login. Never opens a browser: if the login is
    gone, raises LoginExpired (log in again on the computer with tools/coros_probe.py)."""
    server_url = SERVERS[region]

    async def no_browser(url: str) -> None:
        raise LoginExpired("COROS login expired: run tools/coros_probe.py, then tools/seed_cloud.py")

    auth = OAuthClientProvider(
        server_url=server_url,
        client_metadata=OAuthClientMetadata(client_name="Sleep Watch (personal)", redirect_uris=[REDIRECT_URI]),
        storage=storage,
        redirect_handler=no_browser,
    )
    async with create_mcp_http_client(auth=auth) as http_client:
        async with streamable_http_client(server_url, http_client=http_client) as streams:
            async with ClientSession(streams[0], streams[1]) as session:
                await session.initialize()
                yield session


async def call_text(session: ClientSession, name: str, args: dict) -> str:
    """Call a tool and return its text. COROS wraps the text in a JSON string, so unwrap it."""
    result = await session.call_tool(name, args)
    text = "\n".join(c.text for c in getattr(result, "content", []) if hasattr(c, "text"))
    try:
        unwrapped = json.loads(text)
        if isinstance(unwrapped, str):
            return unwrapped
    except json.JSONDecodeError:
        pass
    return text


def month_ranges(start: date, end: date):
    cur = start.replace(day=1)
    while cur <= end:
        nxt = (cur.replace(day=28) + timedelta(days=4)).replace(day=1)
        yield max(cur, start), min(nxt - timedelta(days=1), end)
        cur = nxt


async def fetch_nights(session: ClientSession, start: date, end: date) -> dict[str, dict]:
    """All parsed fields for wake-up dates start..end, keyed by 'YYYY-MM-DD'."""
    rows: dict[str, dict] = {}

    def merge(parsed: dict[str, dict]) -> None:
        for d, r in parsed.items():
            if start.isoformat() <= d <= end.isoformat():
                rows.setdefault(d, {}).update(r)

    for a, b in month_ranges(start, end):
        rng = {"startDate": f"{a:%Y%m%d}", "endDate": f"{b:%Y%m%d}"}
        merge(parse_sleep(await call_text(session, "querySleepOverview", rng)))
        merge(parse_hrv(await call_text(session, "querySleepHrv", {**rng, "days": 7})))
    days = (end - start).days + 1
    merge(parse_daily(await call_text(session, "queryDailyHealthData", {"days": days})))
    merge(parse_rhr(await call_text(session, "queryRestingHeartRate", {"days": days})))
    return rows


async def fetch_activities(session: ClientSession, start: date, end: date, known: dict[str, dict],
                           fit_sports=frozenset({1005}), max_hr: int = 190) -> list[dict]:
    """Workouts start..end with training load, plus a FIT summary for tennis. `known` = rows
    already stored (label_id -> data), so details and FIT files are fetched only once."""
    import base64

    from .activities import local_dt, parse_detail, parse_records, summarize_fit

    out = []
    for a, b in month_ranges(start, end):
        text = await call_text(session, "querySportRecords", {"startDate": f"{a:%Y%m%d}", "endDate": f"{b:%Y%m%d}"})
        for rec in parse_records(text):
            row = {**known.get(rec["label_id"], {}), **rec}
            if "load" not in row:
                row.update(parse_detail(await call_text(session, "getActivityDetail",
                                                        {"labelId": row["label_id"], "sportType": row["sport_type"]})))
            if row.get("start_ts"):
                row["start_local"] = local_dt(row["start_ts"]).isoformat(timespec="minutes")
                row["end_local"] = local_dt(row["end_ts"]).isoformat(timespec="minutes")
            if row["sport_type"] in fit_sports and "fit" not in row:
                try:
                    r = await session.call_tool("downloadActivityFitFiles",
                                                {"labelId": row["label_id"], "sportType": row["sport_type"]})
                    blob = next((c.resource.blob for c in r.content if getattr(c, "resource", None) is not None
                                 and getattr(c.resource, "blob", None)), None)
                    if blob:
                        row["fit"] = summarize_fit(base64.b64decode(blob), max_hr=max_hr)
                except Exception as e:  # FIT daily limit or a broken file: try again next run
                    print("FIT skipped", row["label_id"], e)
            out.append(row)
    return out


async def fetch_snapshot(session: ClientSession) -> dict:
    """Today's VO2max / threshold / race predictions, recovery and COROS's own load numbers."""
    import re

    snap: dict = {}
    fit = await call_text(session, "queryFitnessAssessmentOverview", {})
    for key, field in (("VO2max", "vo2max"), ("Running Level", "running_level")):
        if m := re.search(rf"{key}: ([\d.]+)", fit):
            snap[field] = float(m.group(1))
    for key, field in (("Threshold Pace", "threshold_pace"), ("5 km Prediction", "pred_5k"), ("10 km Prediction", "pred_10k"),
                       ("Half Marathon Prediction", "pred_half"), ("Marathon Prediction", "pred_marathon")):
        if m := re.search(rf"^{key}: ([^\n]+)", fit, re.M):  # ^ so "Marathon" doesn't match "Half Marathon"
            snap[field] = m.group(1).strip()
    rec = await call_text(session, "queryRecoveryStatus", {})
    if m := re.search(r"Recovery: (\d+)%", rec):
        snap["recovery_pct"] = int(m.group(1))
    if m := re.search(r"Level: ([^\n]+)", rec):
        snap["recovery_level"] = m.group(1).strip()
    if m := re.search(r"Estimated Full Recovery: ([^\n]+)", rec):
        snap["full_recovery"] = m.group(1).strip()
    load = await call_text(session, "queryTrainingLoadAssessment", {"days": 1})
    for key, field in (("Short-Term Load", "coros_atl"), ("Long-Term Load", "coros_ctl"), ("Load Ratio", "coros_ratio")):
        if m := re.search(rf"{key}: ([\d.]+)", load):
            snap[field] = float(m.group(1))
    if m := re.search(r"Comment: ([^\n]+)", load):
        snap["load_comment"] = m.group(1).strip()
    return snap


async def fetch_profile(session: ClientSession) -> dict:
    text = await call_text(session, "queryUserInfo", {})
    out = {}
    for key, field in (("Height", "height_cm"), ("Weight", "weight_kg"), ("Birthday", "birthday"), ("Gender", "gender")):
        for line in text.splitlines():
            if line.startswith(key + ":"):
                out[field] = line.split(":", 1)[1].strip().split(" (")[0].replace(" cm", "").replace(" kg", "")
    return out
