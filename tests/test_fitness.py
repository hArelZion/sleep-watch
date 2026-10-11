import sys
from datetime import date, datetime
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from sleepwatch import fitness as fz  # noqa: E402
from sleepwatch.activities import parse_detail, parse_records  # noqa: E402


def nights_frame(n=40, hrv=80, rhr=50, score=85, sleep_h=8.0):
    idx = pd.date_range(end="2026-10-11", periods=n, freq="D")
    df = pd.DataFrame({"score": score, "sleep_h": sleep_h, "hrv": float(hrv), "hrv_lo": 70.0, "hrv_hi": 90.0,
                       "rhr": float(rhr), "onset_h": 24.5, "steps": 9000.0, "calories": 700.0}, index=idx)
    df["wake"] = [d + pd.Timedelta(hours=8, minutes=30) for d in idx]
    return df


def acts_frame(days_loads):
    return pd.DataFrame([{"start_local": f"{d}T19:00", "load": l, "sport_type": 1005, "label_id": str(i),
                          "duration_s": 3600, "calories": 800, "avg_hr": 140}
                         for i, (d, l) in enumerate(days_loads)])


def test_load_ratio_spikes_after_sudden_week():
    days = [(f"2026-09-{d:02d}", 50) for d in range(1, 30, 3)] + [(f"2026-10-{d:02d}", 200) for d in range(5, 12)]
    load = fz.load_state(fz.daily_load(acts_frame(days), date(2026, 9, 1), date(2026, 10, 11)))
    assert load["ratio"] > 1.5
    assert load["week"] == 1400


def test_readiness_high_when_everything_normal():
    r = fz.readiness(nights_frame(), {"ratio": 1.0})
    assert r["score"] >= 80 and r["label"] == "מוכן לגמרי"


def test_readiness_low_with_bad_signs():
    n = nights_frame()
    n.iloc[-1, n.columns.get_loc("hrv")] = 55
    n.iloc[-1, n.columns.get_loc("rhr")] = 56
    n.iloc[-1, n.columns.get_loc("score")] = 50
    n.iloc[-1, n.columns.get_loc("sleep_h")] = 5
    r = fz.readiness(n, {"ratio": 1.7})
    assert r["score"] < 50 and len(r["notes"]) >= 3


def test_illness_warning_needs_two_days():
    n = nights_frame()
    n.iloc[-1, n.columns.get_loc("hrv")] = 60
    n.iloc[-1, n.columns.get_loc("rhr")] = 55
    assert fz.warnings(n, {"ratio": 1.0}) == []
    n.iloc[-2, n.columns.get_loc("hrv")] = 60
    n.iloc[-2, n.columns.get_loc("rhr")] = 55
    w = fz.warnings(n, {"ratio": 1.0})
    assert len(w) == 1 and w[0]["id"].startswith("ill-")


def test_advice_steps_down_after_load_jump():
    ready = {"score": 90, "label": "מוכן לגמרי", "notes": []}
    a = fz.training_advice(ready, {"ratio": 1.4}, nights_frame(), acts_frame([]), date(2026, 10, 11), [])
    assert a["level_he"] == "בינוני"


def test_watch_recovery_caps_hard_day():
    ready = {"score": 90, "label": "מוכן לגמרי", "notes": []}
    a = fz.training_advice(ready, {"ratio": 1.0}, nights_frame(), acts_frame([]), date(2026, 10, 11), [], 85)
    assert a["level_he"] == "בינוני" and any("85%" in r for r in a["reasons"])


def test_best_windows_avoid_heat_and_late_finish():
    hourly = [{"time": f"2026-10-11T{h:02d}:00", "feels": 33 if 11 <= h <= 16 else 24, "wind": 8, "rain": 0}
              for h in range(7, 22)]
    w = fz.best_windows(hourly, datetime(2026, 10, 11, 23, 30), duration_h=1.5)
    top = w[0]["start"]
    assert top[11:13] in {"17", "18", "07", "08", "09", "10"}
    assert all(x["start"][11:13] != "22" for x in w)
    late = next(x for x in w if x["start"].endswith("21:00"))
    assert "קרוב מדי לשינה" in late["why"]


def test_nap_only_after_short_night_and_not_too_late():
    wake = datetime(2026, 10, 11, 7, 0)
    assert fz.nap_advice(8.0, 8.0, wake, datetime(2026, 10, 11, 23, 0)) is None
    n = fz.nap_advice(5.5, 8.0, wake, datetime(2026, 10, 11, 23, 0))
    assert n["start"] == "2026-10-11T13:00" and n["latest"] == "2026-10-11T16:00"


def test_streaks_count_back_from_today():
    n = nights_frame()
    n.iloc[-3, n.columns.get_loc("steps")] = 100
    s = fz.streaks(n, 8000, None)
    assert s["steps"] == 2 and s["bedtime"] >= 2


def test_parse_records_drops_coordinates():
    text = ("1. Tennis — 2026-10-09\n   Location: Tel Aviv-Yafo Tennis\n   Start Coordinates: 32.097, 34.779\n"
            "   Time Window: startTimestamp=1791527526 | endTimestamp=1791533004\n"
            "   Duration: 1:31:18 | Distance: 1.50 km\n   Average Speed: 1.0 km/h | Avg HR: 138 bpm | Calories: 917 kcal\n"
            "   LabelId: 480962854885818368 | SportType: 1005\n")
    (a,) = parse_records(text)
    assert a["duration_s"] == 5478 and a["calories"] == 917 and a["sport_he"] == "טניס"
    assert "32.097" not in str(a)


def test_parse_detail():
    d = parse_detail("Training Load: 154\nAerobic TE: 3.2\nAnaerobic TE: 1.7\nTraining Focus: Threshold\n")
    assert d == {"load": 154.0, "aerobic_te": 3.2, "anaerobic_te": 1.7, "focus": "Threshold"}
