import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from sleepwatch.parse import minutes, parse_daily, parse_hrv, parse_rhr, parse_sleep  # noqa: E402

SLEEP = """Sleep Overview
========================
Note: each record below is dated by its wake-up day.

2026-10-09
Sleep Score: 47
Daily Sleep: 4h 18min (incl. naps)
Main Sleep (asleep): 4h 18min
Main Sleep Period (incl. awake): 4h 34min
Deep Sleep Ratio: 24%
Light Sleep Ratio: 53%
REM Ratio: 17%
Awake Ratio: 6%
Awake Time: 16 min
Awake Count (>5 min): 1
Main Sleep Window: 2026-10-09 04:09 - 2026-10-09 08:43
Naps Total: 0 min

2025-10-11
Sleep detail for this day is not available yet.

2026-01-01
Sleep Score: 92
Main Sleep: 6h 46min
Deep Sleep Ratio: 28%
Light Sleep Ratio: 53%
REM Ratio: 17%
Awake Ratio: 2%
Awake Time: 8 min
Main Sleep Window: 2025-12-31 23:13 - 2026-01-01 05:59
Naps Total: 0 min
"""


def test_sanitize_makes_valid_json():
    import json
    import numpy as np
    from sleepwatch.store import sanitize
    out = sanitize({"a": float("nan"), "b": [np.float64(1.5), np.nan, float("inf")], "c": np.int64(3), "d": "x"})
    assert out == {"a": None, "b": [1.5, None, None], "c": 3, "d": "x"}
    json.dumps(out, allow_nan=False)


def test_minutes():
    assert minutes("4h 18min") == 258
    assert minutes("16 min") == 16
    assert minutes("2h") == 120
    assert minutes("") is None


def test_parse_sleep_both_formats_and_skips_missing():
    n = parse_sleep(SLEEP)
    assert set(n) == {"2026-10-09", "2026-01-01"}
    a = n["2026-10-09"]
    assert a["score"] == 47 and a["sleep_min"] == 258 and a["awake_count"] == 1
    assert a["onset"] == datetime(2026, 10, 9, 4, 9)
    b = n["2026-01-01"]
    assert b["sleep_min"] == 406 and b["awake_count"] == 0
    assert b["onset"] == datetime(2025, 12, 31, 23, 13)


def test_parse_hrv_multiword_evaluation():
    text = ("2025-08-14:\n  HRV Avg: 98 ms — Above normal\n  Normal Range: 79 - 91 ms\n  Baseline: 85 ms\n"
            "2025-08-15:\n  HRV Avg: 90 ms — Normal\n  Normal Range: 79 - 91 ms\n  Baseline: 85 ms\n")
    h = parse_hrv(text)
    assert h["2025-08-14"] == {"hrv": 98, "hrv_eval": "Above normal", "hrv_lo": 79, "hrv_hi": 91, "hrv_base": 85}
    assert h["2025-08-15"]["hrv"] == 90


def test_parse_daily_with_and_without_sleep_hr():
    text = ("--- 20250907 ---\nSteps: 18,178 | Calories: 957 kcal | Exercise: 1h 9min\nStress: Avg 44\n"
            "Sleep Summary:\n  Sleep HR: Avg 46 bpm | Min 41 bpm | Max 58 bpm\n\n"
            "--- 20260406 ---\nSteps: 7,137 | Calories: 1,156 kcal | Exercise: 0 min\nStress: Avg 34\n")
    d = parse_daily(text)
    assert d["2025-09-07"] == {"steps": 18178, "calories": 957, "exercise_min": 69, "stress": 44,
                               "sleep_hr": 46, "sleep_hr_min": 41, "sleep_hr_max": 58}
    assert "sleep_hr" not in d["2026-04-06"] and d["2026-04-06"]["exercise_min"] == 0


def test_parse_rhr_skips_no_data():
    assert parse_rhr("2026-10-11: 51 bpm\n2026-09-21: No data\n") == {"2026-10-11": {"rhr": 51}}
