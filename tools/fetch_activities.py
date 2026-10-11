"""Download every workout (list + training load) and the FIT files of tennis sessions.

Writes data/activities.json. FIT files are cached in data/fit/ (COROS allows ~50 per day,
so re-run on the next day if some are missing; existing files are never fetched again).
"""
import asyncio
import base64
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))
from coros_probe import FileTokenStorage  # noqa: E402
from sleepwatch.activities import local_dt, parse_detail, parse_records, summarize_fit  # noqa: E402
from sleepwatch.coros import call_text, coros_session, month_ranges  # noqa: E402

FIT_DIR = ROOT / "data" / "fit"
OUT = ROOT / "data" / "activities.json"
FIT_SPORTS = {1005}  # tennis


async def fetch_fit(session, label_id: str, sport_type: int) -> bytes | None:
    r = await session.call_tool("downloadActivityFitFiles", {"labelId": label_id, "sportType": sport_type})
    for c in r.content:
        res = getattr(c, "resource", None)
        if res is not None and getattr(res, "blob", None):
            return base64.b64decode(res.blob)
    return None


async def main(start: date) -> None:
    FIT_DIR.mkdir(parents=True, exist_ok=True)
    old = {a["label_id"]: a for a in json.loads(OUT.read_text("utf-8"))} if OUT.exists() else {}
    acts: dict[str, dict] = {}
    async with coros_session(FileTokenStorage()) as s:
        for a, b in month_ranges(start, date.today()):
            text = await call_text(s, "querySportRecords", {"startDate": f"{a:%Y%m%d}", "endDate": f"{b:%Y%m%d}"})
            for rec in parse_records(text):
                acts[rec["label_id"]] = {**old.get(rec["label_id"], {}), **rec}
        print(f"{len(acts)} workouts")

        for a in acts.values():
            if "load" not in a:
                a.update(parse_detail(await call_text(s, "getActivityDetail",
                                                      {"labelId": a["label_id"], "sportType": a["sport_type"]})))
            if a.get("start_ts"):
                a["start_local"] = local_dt(a["start_ts"]).isoformat(timespec="minutes")
                a["end_local"] = local_dt(a["end_ts"]).isoformat(timespec="minutes")

        fetched = 0
        for a in acts.values():
            if a["sport_type"] not in FIT_SPORTS:
                continue
            path = FIT_DIR / f"{a['label_id']}.fit"
            if not path.exists():
                try:
                    data = await fetch_fit(s, a["label_id"], a["sport_type"])
                except Exception as e:  # daily limit reached: keep what we have
                    print("FIT stopped:", e)
                    break
                if not data:
                    print("no FIT for", a["label_id"])
                    continue
                path.write_bytes(data)
                fetched += 1
        print(f"FIT files downloaded now: {fetched}")

    max_hr = max([a.get("max_hr") or 0 for a in acts.values()] + [190])
    for a in acts.values():
        path = FIT_DIR / f"{a['label_id']}.fit"
        if path.exists() and "fit" not in a:
            try:
                a["fit"] = summarize_fit(path.read_bytes(), max_hr=max_hr)
            except Exception as e:  # a few COROS files have non-standard fields
                print("FIT parse failed", a["label_id"], e)
    rows = sorted(acts.values(), key=lambda a: a.get("start_ts", 0))
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=1, default=str), "utf-8")
    print(f"saved {OUT} ({sum('fit' in a for a in rows)} with FIT summaries)")


if __name__ == "__main__":
    asyncio.run(main(date(2025, 6, 1)))
