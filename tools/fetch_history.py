"""Download the whole COROS history (sleep, HRV, daily health, resting HR) into data/raw/history/.

Daily health data tells us the first day with any data; sleep overview and HRV are then
fetched month by month from there. Re-running overwrites the files (the source is COROS).

Usage:  .venv\\Scripts\\python.exe tools\\fetch_history.py [--days 800]
"""
import argparse
import asyncio
import re
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from coros_call import RAW_DIR, call_text, coros_session  # noqa: E402

HIST = RAW_DIR / "history"


def month_ranges(start: date, end: date):
    cur = start.replace(day=1)
    while cur <= end:
        nxt = (cur.replace(day=28) + timedelta(days=4)).replace(day=1)
        yield max(cur, start), min(nxt - timedelta(days=1), end)
        cur = nxt


async def main(days: int) -> None:
    HIST.mkdir(parents=True, exist_ok=True)
    today = date.today()
    async with coros_session() as s:
        daily = await call_text(s, "queryDailyHealthData", {"days": days})
        (HIST / "daily_health.txt").write_text(daily, "utf-8")
        found = re.findall(r"--- (\d{8}) ---", daily)
        first = min(found) if found else (today - timedelta(days=days)).strftime("%Y%m%d")
        start = date(int(first[:4]), int(first[4:6]), int(first[6:]))
        print(f"first day with data: {start}")

        # Resting HR rejects a window that starts before the account's first data day.
        rhr = await call_text(s, "queryRestingHeartRate", {"days": (today - start).days + 1})
        (HIST / "resting_hr.txt").write_text(rhr, "utf-8")

        for a, b in month_ranges(start, today):
            rng = {"startDate": a.strftime("%Y%m%d"), "endDate": b.strftime("%Y%m%d")}
            sleep = await call_text(s, "querySleepOverview", rng)
            (HIST / f"sleep_{a:%Y%m}.txt").write_text(sleep, "utf-8")
            hrv = await call_text(s, "querySleepHrv", {**rng, "days": 7})
            (HIST / f"hrv_{a:%Y%m}.txt").write_text(hrv, "utf-8")
            print(f"{a:%Y-%m}: sleep {sleep.count('Sleep Score')} nights, hrv {hrv.count('HRV Avg')} days")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=800)
    asyncio.run(main(ap.parse_args().days))
