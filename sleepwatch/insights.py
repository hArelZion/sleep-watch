"""Compose everything the app's home screen shows into one JSON (control/insights)."""
from __future__ import annotations

from datetime import date, datetime, timedelta

import pandas as pd

from . import fitness as fz
from .engine import Settings, ScoreModel, target_sleep_h


def build(nights: pd.DataFrame, acts: pd.DataFrame, state: dict, plan: dict | None, settings: dict,
          today: date, now: datetime, hourly: list[dict] | None, coros: dict, events: list[dict],
          tennis_logs: dict | None = None) -> dict:
    load_series = fz.daily_load(acts, nights.index.min().date(), today)
    load = fz.load_state(load_series)
    # COROS's own short/long-term load is what the watch shows; prefer it for decisions and keep
    # our day-by-day estimate for the charts.
    if coros.get("coros_ratio") is not None:
        load.update(atl=coros.get("coros_atl"), ctl=coros.get("coros_ctl"), ratio=coros["coros_ratio"], source="coros")
    ready = fz.readiness(nights, load, coros.get("recovery_pct"))
    advice = fz.training_advice(ready, load, nights, acts, today, events, coros.get("recovery_pct"))

    lights_out = datetime.fromisoformat(plan["lights_out"]) if plan else None
    windows = []
    if hourly:
        todays = [h for h in hourly if h["time"][:10] == today.isoformat() and int(h["time"][11:13]) >= now.hour + 1]
        windows = fz.best_windows(todays, lights_out, duration_h=float(settings.get("workout_h", 1.5)))[:3]
    model = ScoreModel(coef=__import__("numpy").asarray(state["coef"]), mae=state["mae"], n=state["n"])
    target = target_sleep_h(model, Settings(), state["debt_3d"])
    last = nights.iloc[-1]
    nap = fz.nap_advice(float(last["sleep_h"]), target, last["wake"].to_pydatetime(), lights_out) \
        if last.name.date() == today else None
    cal_goal = settings.get("calorie_goal")
    calories_today = float(last["calories"]) if last.name.date() == today and pd.notna(last.get("calories")) else None
    out = {
        "date": today.isoformat(), "updated": now.isoformat(timespec="minutes"),
        "readiness": ready, "training": advice, "windows": windows, "load": load,
        "warnings": fz.warnings(nights, load),
        "debt": fz.sleep_debt(nights, target), "nap": nap,
        "streaks": fz.streaks(nights, settings.get("steps_goal"), cal_goal),
        "weekly": fz.weekly_report(nights, acts, today),
        "tennis": fz.tennis_summary(acts, nights, tennis_logs),
        "coros": coros,
        "today": {"steps": None if last.name.date() != today else _num(last.get("steps")),
                  "calories": calories_today, "calorie_goal": cal_goal,
                  "steps_goal": settings.get("steps_goal"), "stress": None if last.name.date() != today else _num(last.get("stress"))},
        "weather": hourly[:72] if hourly else [],
    }
    if lights_out:
        out["caffeine_cutoff"] = (lights_out - timedelta(hours=8)).isoformat(timespec="minutes")
        # A planned session that ends less than 3 hours before bed: your nights are worse then.
        for e in events:
            if e.get("start", "")[:10] != today.isoformat() or not e.get("end"):
                continue
            gap = (lights_out - datetime.fromisoformat(e["end"][:16])).total_seconds() / 3600
            if 0 <= gap < 3:
                advice["reasons"].append(
                    f"{e.get('title', 'האימון')} מסתיים {gap:.1f} שעות לפני השינה. אצלך שינה אחרי אימון מאוחר "
                    "פחות טובה. אם אפשר, הקדם או קצר אותו.")
    return out


def _num(v):
    return None if v is None or pd.isna(v) else float(v)
