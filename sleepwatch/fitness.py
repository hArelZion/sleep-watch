"""Daily fitness engine: training load, readiness, today's training advice, best time to train,
early warnings, sleep debt, nap advice, streaks and the weekly report.

Everything here is a plain function of the data, so the daily job can run it and the tests can
check it. Texts are in Hebrew because they go straight to the app and to notifications.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd

LEVELS = ["מנוחה", "קל", "בינוני", "קשה"]   # rest, easy, moderate, hard
TENNIS = 1005


# ---- training load ---------------------------------------------------------------------------

def daily_load(acts: pd.DataFrame, start: date, end: date) -> pd.Series:
    """Sum of COROS training load per local day (0 on rest days)."""
    idx = pd.date_range(start, end)
    if acts.empty:
        return pd.Series(0.0, index=idx)
    day = pd.to_datetime(acts["start_local"]).dt.normalize()
    return acts.assign(day=day).groupby("day")["load"].sum().reindex(idx, fill_value=0.0).astype(float)


def load_state(load: pd.Series) -> dict:
    """Acute (7-day) and chronic (42-day) load as exponentially weighted averages, and their ratio."""
    atl = load.ewm(span=7, adjust=False).mean()
    ctl = load.ewm(span=42, adjust=False).mean()
    ratio = float(atl.iloc[-1] / ctl.iloc[-1]) if ctl.iloc[-1] > 1 else None
    return {"atl": round(float(atl.iloc[-1]), 1), "ctl": round(float(ctl.iloc[-1]), 1),
            "ratio": None if ratio is None else round(ratio, 2),
            "week": round(float(load.tail(7).sum())), "series_atl": atl.round(1).tail(90).tolist(),
            "series_ctl": ctl.round(1).tail(90).tolist(), "series_days": [d.date().isoformat() for d in load.tail(90).index]}


# ---- readiness -------------------------------------------------------------------------------

def _clip(x, lo=0.0, hi=100.0):
    return float(min(max(x, lo), hi))


def readiness(nights: pd.DataFrame, load: dict, recovery_pct: float | None = None) -> dict:
    """0-100: how ready the body is today. Built from last night's sleep, HRV against its normal
    range, resting heart rate against the last 30 days, and the training-load ratio."""
    last = nights.iloc[-1]
    parts, notes = {}, []

    sleep = float(last["score"])
    if last["sleep_h"] < 6:
        sleep -= 10
        notes.append("ישנת פחות מ-6 שעות.")
    parts["sleep"] = _clip(sleep)

    if pd.notna(last.get("hrv")) and pd.notna(last.get("hrv_lo")):
        lo, hi, v = float(last["hrv_lo"]), float(last["hrv_hi"]), float(last["hrv"])
        if v < lo:
            parts["hrv"] = _clip(60 - (lo - v) * 3)
            notes.append(f"ה-HRV ({v:.0f}) מתחת לטווח הרגיל שלך ({lo:.0f}–{hi:.0f}).")
        else:
            parts["hrv"] = _clip(80 + (min(v, hi) - lo) / max(hi - lo, 1) * 20)
    rhr_hist = nights["rhr"].tail(31).iloc[:-1].dropna()
    if pd.notna(last.get("rhr")) and len(rhr_hist) >= 7:
        d = float(last["rhr"]) - float(rhr_hist.mean())
        parts["rhr"] = _clip(90 - max(d, 0) * 8 + min(-d, 3) * 3)
        if d >= 3:
            notes.append(f"דופק המנוחה גבוה ב-{d:.0f} מהרגיל.")
    r = load.get("ratio")
    if r is not None:
        parts["load"] = _clip(100 - max(r - 1.2, 0) * 120 - max(0.6 - r, 0) * 20)
        if r > 1.5:
            notes.append(f"העומס בשבוע האחרון גבוה מאוד ביחס לרגיל ({r:.2f}).")

    weights = {"sleep": 0.35, "hrv": 0.30, "rhr": 0.20, "load": 0.15}
    have = {k: w for k, w in weights.items() if k in parts}
    score = sum(parts[k] * w for k, w in have.items()) / sum(have.values())
    if recovery_pct is not None:
        score = 0.8 * score + 0.2 * float(recovery_pct)
    score = round(_clip(score))
    label = "מוכן לגמרי" if score >= 80 else "מוכן" if score >= 65 else "חלקית" if score >= 50 else "צריך מנוחה"
    return {"score": score, "label": label, "parts": {k: round(v) for k, v in parts.items()}, "notes": notes}


# ---- warnings --------------------------------------------------------------------------------

def warnings(nights: pd.DataFrame, load: dict) -> list[dict]:
    """Early signs worth a notification. Each has an id so it is sent once."""
    out = []
    tail = nights.tail(2)
    if len(tail) == 2 and tail["hrv"].notna().all() and tail["hrv_lo"].notna().all():
        low_hrv = (tail["hrv"] < tail["hrv_lo"]).all()
        base = nights["rhr"].tail(32).iloc[:-2].mean()
        high_rhr = (tail["rhr"] >= base + 3).all()
        if low_hrv and high_rhr:
            out.append({"id": f"ill-{tail.index[-1].date()}", "level": "serious",
                        "title": "הגוף שלך בעומס",
                        "text": "יומיים ברצף HRV נמוך ודופק מנוחה גבוה. זה יכול להיות תחילת מחלה, עייפות או אימון-יתר. כדאי יום קל או מנוחה, ולשים לב איך אתה מרגיש."})
    r = load.get("ratio")
    if r is not None and r > 1.5:
        out.append({"id": f"load-{nights.index[-1].date()}", "level": "warning", "title": "קפיצה בעומס",
                    "text": f"העומס בשבוע האחרון גבוה פי {r:.1f} מהממוצע שלך. עלייה מהירה כזו קשורה לסיכון פציעה. עדיף להוסיף עומס בהדרגה."})
    return out


# ---- today's training advice -----------------------------------------------------------------

def training_advice(ready: dict, load: dict, nights: pd.DataFrame, acts: pd.DataFrame,
                    today: date, planned: list[dict], recovery_pct: float | None = None) -> dict:
    """Level for today + why + what to do. Planned events (e.g. tennis) are respected."""
    s = ready["score"]
    level = 3 if s >= 80 else 2 if s >= 65 else 1 if s >= 50 else 0
    reasons = [f"ציון מוכנות {s} ({ready['label']})."] + ready["notes"]
    if recovery_pct is not None and recovery_pct < 90 and level == 3:
        level = 2
        reasons.append(f"השעון מראה התאוששות של {recovery_pct:.0f}%, אז עדיף בינוני היום.")
    elif recovery_pct is not None and recovery_pct < 60 and level >= 2:
        level = 1
        reasons.append(f"השעון מראה התאוששות של {recovery_pct:.0f}% בלבד.")
    r = load.get("ratio")
    if r is not None and r > 1.3 and level > 1:
        level -= 1
        reasons.append("העומס עלה מהר לאחרונה, אז הורדתי רמה אחת.")
    if r is not None and r < 0.7 and level >= 2:
        reasons.append("עשית פחות מהרגיל לאחרונה, אפשר להעלות עומס בהדרגה.")
    recent = acts[pd.to_datetime(acts["start_local"]).dt.date >= today - timedelta(days=2)] if not acts.empty else acts
    hard_recent = (recent["load"] >= 150).sum() if not recent.empty else 0
    if hard_recent >= 2 and level == 3:
        level = 2
        reasons.append("היו לך שני אימונים קשים ביומיים האחרונים.")

    today_events = [e for e in planned if e.get("start", "")[:10] == today.isoformat()]
    if today_events:
        e = today_events[0]
        reasons.append(f"מתוכנן היום: {e.get('title', 'אימון')} ב-{e['start'][11:16]}.")
        if level == 0:
            reasons.append("המוכנות נמוכה: אם אפשר, שחק בקצב קל או קצר יותר.")

    ideas = {
        0: ["מנוחה, או הליכה של 20–30 דקות", "מתיחות או יוגה קלה"],
        1: ["אופניים או הליכה בקצב קל 30–45 דקות", "טניס קליל, תרגול חבטות בלי משחק תחרותי", "ניידות וגמישות 20 דקות"],
        2: ["טניס רגיל", "אימון כוח לרגליים ולליבה (45 דקות)", "קפיצה בחבל: 10 סבבים של 1 דקה"],
        3: ["משחק טניס תחרותי", "אינטרוולים: 8 × 30 שניות מהר / 90 שניות קל", "תרגילי זריזות ושינוי כיוון לטניס"],
    }[level]
    return {"level": level, "level_he": LEVELS[level], "reasons": reasons, "ideas": ideas}


# ---- best time to train ----------------------------------------------------------------------

def best_windows(hourly: list[dict], lights_out: datetime | None, duration_h: float = 1.5,
                 outdoor: bool = True, earliest: int = 7, latest_start: int = 21) -> list[dict]:
    """Score each start hour of the day: weather (heat, wind, rain) and the personal sleep finding
    (finishing 3-6 hours before bed gives your best sleep; under 3 hours is worse).
    hourly: [{"time": "YYYY-MM-DDTHH:00", "feels": °C, "wind": km/h, "rain": %}]."""
    out = []
    for h in hourly:
        t = datetime.fromisoformat(h["time"])
        if not earliest <= t.hour <= latest_start:
            continue
        score, why = 100.0, []
        if outdoor:
            feels = h.get("feels")
            if feels is not None and feels > 27:
                score -= (feels - 27) * 6
                why.append(f"חם ({feels:.0f}°)")
            if feels is not None and feels < 10:
                score -= (10 - feels) * 4
                why.append(f"קר ({feels:.0f}°)")
            wind = h.get("wind") or 0
            if wind > 20:
                score -= (wind - 20) * 2
                why.append(f"רוח {wind:.0f} קמ\"ש")
            rain = h.get("rain") or 0
            if rain >= 30:
                score -= rain * 0.6
                why.append(f"סיכוי לגשם {rain:.0f}%")
        if lights_out is not None:
            gap = (lights_out - (t + timedelta(hours=duration_h))).total_seconds() / 3600
            if gap < 0:
                continue
            if gap < 3:
                score -= (3 - gap) * 12
                why.append("קרוב מדי לשינה")
            elif gap <= 6:
                score += 5
                why.append("זמן טוב לשינה שלך")
        out.append({"start": h["time"][:16], "score": round(score), "why": why,
                    "feels": h.get("feels"), "wind": h.get("wind"), "rain": h.get("rain")})
    return sorted(out, key=lambda x: -x["score"])


# ---- sleep debt, nap, streaks ----------------------------------------------------------------

def sleep_debt(nights: pd.DataFrame, target_h: float) -> dict:
    week = nights.tail(7)
    per = (target_h - week["sleep_h"]).clip(lower=-1.5)
    debt = float(per.sum())
    advice = []
    if debt > 2:
        advice.append(f"חסרות לך כ-{debt:.1f} שעות שינה השבוע.")
        advice.append("להשלמה: עד שעה נוספת בלילה, בקימה מאוחרת יותר ולא בהירדמות מוקדמת מדי, כדי לשמור על סדירות. נמנום קצר עוזר גם הוא.")
    elif debt < -2:
        advice.append("ישנת השבוע יותר מהיעד. אין צורך להשלים.")
    else:
        advice.append("השבוע אתה קרוב ליעד השינה.")
    return {"hours": round(debt, 1), "per_night": [{"date": d.date().isoformat(), "h": round(float(v), 2)}
                                                    for d, v in week["sleep_h"].items()], "advice": advice}


def nap_advice(last_sleep_h: float, target_h: float, wake: datetime, lights_out: datetime | None) -> dict | None:
    """After a short night: one short nap, early enough not to hurt tonight's sleep."""
    if last_sleep_h >= target_h - 1:
        return None
    start = max(wake + timedelta(hours=6), wake.replace(hour=13, minute=0))
    latest = (lights_out - timedelta(hours=7)) if lights_out else wake.replace(hour=16, minute=0)
    if start > latest:
        return None
    return {"start": start.isoformat(timespec="minutes"), "latest": latest.isoformat(timespec="minutes"),
            "minutes": 20,
            "text": f"ישנת {last_sleep_h:.1f} שעות. נמנום של 20 דקות בין {start:%H:%M} ל-{latest:%H:%M} יעזור, בלי לפגוע בשינה הלילה."}


def streaks(nights: pd.DataFrame, steps_goal: int | None, cal_goal: int | None) -> dict:
    """Consecutive days ending today: steady bedtime (within 30 min of the 14-night median),
    steps goal, calories goal."""
    def run(mask: pd.Series) -> int:
        n = 0
        for v in reversed(mask.tolist()):
            if not v:
                break
            n += 1
        return n
    med = nights["onset_h"].rolling(14, min_periods=5).median().shift(1)
    out = {"bedtime": run(((nights["onset_h"] - med).abs() <= 0.5).fillna(False))}
    if steps_goal and "steps" in nights:
        out["steps"] = run(nights["steps"].fillna(0) >= steps_goal)
    if cal_goal and "calories" in nights:
        out["calories"] = run(nights["calories"].fillna(0) >= cal_goal)
    return out


# ---- weekly report ---------------------------------------------------------------------------

def weekly_report(nights: pd.DataFrame, acts: pd.DataFrame, end: date) -> dict:
    """Last 7 days vs the 7 before."""
    end_ts = pd.Timestamp(end)
    this = nights[(nights.index > end_ts - pd.Timedelta(days=7)) & (nights.index <= end_ts)]
    prev = nights[(nights.index > end_ts - pd.Timedelta(days=14)) & (nights.index <= end_ts - pd.Timedelta(days=7))]
    a = acts.copy()
    if not a.empty:
        a["d"] = pd.to_datetime(a["start_local"])
        a = a[(a["d"] > end_ts - pd.Timedelta(days=7)) & (a["d"] <= end_ts + pd.Timedelta(days=1))]

    def m(df, c):
        return None if df.empty or c not in df else round(float(df[c].mean()), 1)
    best = this["score"].idxmax() if len(this) else None
    lines = []
    if len(this):
        lines.append(f"ציון שינה ממוצע {m(this, 'score')}" + (f" (לעומת {m(prev, 'score')} שבוע קודם)" if len(prev) else "") + ".")
        lines.append(f"שינה ממוצעת {m(this, 'sleep_h')} שעות. הלילה הכי טוב: {best.date():%d/%m} עם {this['score'].max():.0f}.")
    if not a.empty:
        tennis = (a["sport_type"] == TENNIS).sum()
        lines.append(f"{len(a)} אימונים ({tennis} טניס), {a['calories'].sum():.0f} קלוריות באימונים, עומס {a['load'].sum():.0f}.")
    tip = None
    if len(this) and this["sleep_h"].lt(7).sum() >= 3:
        tip = "השבוע היו 3 לילות או יותר מתחת ל-7 שעות. נסה להקדים את שעת ההירדמות ברבע שעה בכל ערב."
    elif len(this) and this["onset_h"].std() > 1.2:
        tip = "שעות ההירדמות השבוע היו מפוזרות. שעה קבועה יותר תעזור לציון."
    return {"week_end": end.isoformat(), "score": m(this, "score"), "prev_score": m(prev, "score"),
            "sleep_h": m(this, "sleep_h"), "workouts": 0 if a.empty else int(len(a)), "lines": lines, "tip": tip}


# ---- tennis ----------------------------------------------------------------------------------

def tennis_summary(acts: pd.DataFrame, nights: pd.DataFrame, logs: dict[str, dict] | None = None) -> dict:
    """Per-session cards and long-term trends; links each session to the night before."""
    t = acts[acts["sport_type"] == TENNIS].copy() if not acts.empty else acts
    if t.empty:
        return {"sessions": [], "trend": []}
    t["start"] = pd.to_datetime(t["start_local"])
    sessions = []
    for _, a in t.sort_values("start").iterrows():
        f = a.get("fit") if isinstance(a.get("fit"), dict) else {}
        night = nights[nights.index == a["start"].normalize()]
        log = (logs or {}).get(a["label_id"], {})
        sessions.append({
            "label_id": a["label_id"], "start": a["start_local"], "minutes": round(a["duration_s"] / 60),
            "avg_hr": a.get("avg_hr"), "max_hr": f.get("max_hr"), "calories": a.get("calories"),
            "load": a.get("load"), "aerobic_te": a.get("aerobic_te"), "anaerobic_te": a.get("anaerobic_te"),
            "focus": a.get("focus"), "place": a.get("place"), "distance_km": a.get("distance_km"),
            "zones_min": f.get("zones_min"), "peak10_hr": f.get("peak10_hr"), "peak10_start_min": f.get("peak10_start_min"),
            "bursts": f.get("bursts"), "max_speed_kmh": f.get("max_speed_kmh"), "temp_c": f.get("temp_c"),
            "sleep_before": None if night.empty else round(float(night["score"].iloc[0])),
            "log": log,
        })
    monthly = t.set_index("start").resample("MS").agg({"avg_hr": "mean", "label_id": "count", "calories": "mean"})
    trend = [{"month": i.strftime("%Y-%m"), "avg_hr": None if pd.isna(r["avg_hr"]) else round(r["avg_hr"]),
              "sessions": int(r["label_id"]), "kcal": None if pd.isna(r["calories"]) else round(r["calories"])}
             for i, r in monthly.iterrows()]
    insights = []
    logged = [s for s in sessions if s["log"].get("result") in ("win", "loss") and s["sleep_before"] is not None]
    if len(logged) >= 6:
        wins = [s["sleep_before"] for s in logged if s["log"]["result"] == "win"]
        losses = [s["sleep_before"] for s in logged if s["log"]["result"] == "loss"]
        if wins and losses:
            insights.append(f"לפני ניצחונות ציון השינה הממוצע היה {np.mean(wins):.0f}, לפני הפסדים {np.mean(losses):.0f}.")
    else:
        insights.append(f"סמן תוצאה אחרי משחקים כדי לגלות מה עוזר לך לנצח ({len(logged)} מתוך 6 משחקים מסומנים).")
    return {"sessions": sessions[-60:], "trend": trend, "insights": insights}
