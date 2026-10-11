"""Daily cloud job (GitHub Actions, hourly): COROS -> Supabase -> tonight's plan.

1. Pull the last nights from COROS (the whole history with --backfill).
2. Fit the model on every night + morning ratings, store it in control/model.
3. Plan tonight from the settings (deadline per weekday, or a one-off override) and store it,
   unless the phone app already re-planned tonight after a change.

Local run:  .venv\\Scripts\\python.exe jobs\\daily.py [--backfill] [--dry-run]   (keys in .env)
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from sleepwatch.coros import coros_session, fetch_activities, fetch_nights, fetch_profile, fetch_snapshot  # noqa: E402
from sleepwatch.engine import Settings, model_state, plan_from_state  # noqa: E402
from sleepwatch.features import prepare  # noqa: E402
from sleepwatch.insights import build as build_insights  # noqa: E402
from sleepwatch.weather import TEL_AVIV, hourly_forecast  # noqa: E402
from sleepwatch.store import Store, SupabaseTokenStorage, load_dotenv  # noqa: E402

TZ = ZoneInfo("Asia/Jerusalem")
FIRST_DAY = date(2025, 6, 17)
SETTING_KEYS = ("latency_min", "prep_min", "wind_down_min", "min_sleep_h", "max_sleep_h",
                "max_shift_h", "max_advance_h")


def settings_from(data: dict) -> Settings:
    s = Settings(**{k: data[k] for k in SETTING_KEYS if data.get(k) is not None})
    return s


def deadline_for(data: dict, night_of: date) -> datetime | None:
    """settings.overrides["YYYY-MM-DD" wake date] beats settings.deadlines[weekday of waking]
    (weekday as in JavaScript: 0 = Sunday). Value "HH:MM", or null for no deadline."""
    wake_day = night_of + timedelta(days=1)
    overrides = data.get("overrides") or {}
    if wake_day.isoformat() in overrides:
        hhmm = overrides[wake_day.isoformat()]
    else:
        hhmm = (data.get("deadlines") or {}).get(str((wake_day.weekday() + 1) % 7))
    if not hhmm:
        return None
    h, m = map(int, hhmm.split(":"))
    return datetime(wake_day.year, wake_day.month, wake_day.day, h, m)


def nights_frame(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame([{**r["data"], "date": r["date"]} for r in rows]).set_index("date")
    return prepare(df)


async def main(backfill: bool, dry_run: bool) -> None:
    load_dotenv(ROOT / ".env")
    store = Store()
    now = datetime.now(TZ)
    today = now.date()
    start = FIRST_DAY if backfill else today - timedelta(days=10)

    known = {r["label_id"]: r["data"] for r in store.select(
        "activities", f"select=label_id,data&date=gte.{today - timedelta(days=21)}")}
    async with coros_session(SupabaseTokenStorage(store)) as session:
        fetched = await fetch_nights(session, start, today)
        profile = await fetch_profile(session)
        new_acts = await fetch_activities(session, today - timedelta(days=14), today, known)
        snapshot = await fetch_snapshot(session)
    rows = [{"date": d, "data": r} for d, r in fetched.items() if r.get("score")]
    print(f"COROS: {len(rows)} nights {start}..{today}, {len(new_acts)} recent workouts")
    if not dry_run:
        store.upsert("nights", rows)
        store.upsert("activities", [{"label_id": a["label_id"], "date": a["date"], "data": a} for a in new_acts])
        store.upsert("fitness_daily", {"date": today.isoformat(), "data": snapshot, "updated_at": now.isoformat()})

    df = nights_frame(store.select("nights", "select=date,data"))
    ratings_rows = store.select("ratings", "select=date,slept,woke")
    ratings = None
    if ratings_rows:
        r = pd.DataFrame(ratings_rows)
        r.index = pd.to_datetime(r["date"])
        ratings = r[["slept", "woke"]].astype(float).mean(axis=1)

    # Tonight = the evening of today (after midnight, the night that already started).
    night_of = today if now.hour >= 12 else today - timedelta(days=1)
    state = model_state(df, night_of, ratings)
    state["profile"] = profile
    state["updated"] = now.isoformat(timespec="minutes")
    state["rated_nights"] = 0 if ratings is None else int(len(ratings))

    data = store.control("settings")
    s = settings_from(data)
    plan = plan_from_state(state, night_of, s, deadline_for(data, night_of)).to_dict()
    # The app re-plans only when its settings differ from these (see sameSettings in app.js).
    plan["settings_used"] = {k: getattr(s, k) for k in ("prep_min", "latency_min", "wind_down_min",
                                                        "min_sleep_h", "max_sleep_h")}
    print(f"plan {night_of}: lights out {plan['lights_out']}, wake {plan['wake']}, score ~{plan['predicted_score']}")
    existing = store.select("plans", f"select=source,data&night_of=eq.{night_of}")
    if existing and existing[0]["source"] == "app":
        plan = existing[0]["data"]  # the phone re-planned after a change; insights follow it

    acts = pd.DataFrame([r["data"] for r in store.select("activities", "select=data")])
    logs = {r["label_id"]: r["data"] for r in store.select("activity_logs", "select=label_id,data")}
    events = [{"title": e["title"], "kind": e["kind"],
               "start": datetime.fromisoformat(e["starts_at"]).astimezone(TZ).isoformat(timespec="minutes")[:16],
               "end": (datetime.fromisoformat(e["ends_at"]).astimezone(TZ).isoformat(timespec="minutes")[:16]
                       if e.get("ends_at") else None)}
              for e in store.select("events", f"select=title,kind,starts_at,ends_at&starts_at=gte.{today}")]
    try:
        hourly = hourly_forecast(*(data.get("location") or TEL_AVIV))
    except Exception as e:  # weather is a nice-to-have
        print("weather unavailable:", e)
        hourly = None
    ins = build_insights(df, acts, state, plan, data, today, now.replace(tzinfo=None), hourly, snapshot, events, logs)
    print(f"readiness {ins['readiness']['score']}, training {ins['training']['level_he']}")
    if dry_run:
        return
    store.set_control("model", state)
    store.set_control("insights", ins)
    if not existing or existing[0]["source"] != "app":
        store.upsert("plans", {"night_of": night_of.isoformat(), "data": plan, "source": "job",
                               "updated_at": now.isoformat()})


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true", help="fetch the whole history, not just the last 10 days")
    ap.add_argument("--dry-run", action="store_true", help="don't write anything to Supabase")
    a = ap.parse_args()
    asyncio.run(main(a.backfill, a.dry_run))
