"""Walk-forward backtest: for every past night, plan it using only the nights before it.

The deadline is the actual wake time that night (what the user really had to do). We then ask:
on nights where the user happened to fall asleep close to the plan, was the score better than on
nights far from it? Same question for the baseline "fall asleep at your usual time".
"""
import sys
from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from sleepwatch.engine import Settings, fit_model, plan_night  # noqa: E402
from sleepwatch.features import load_nights  # noqa: E402

WARMUP = 90
CLOSE_H = 0.5


def main() -> None:
    df = load_nights(ROOT / "data" / "nights.csv").dropna(subset=["onset", "wake", "score"])
    s = Settings()
    rows = []
    for i in range(WARMUP, len(df)):
        night = df.iloc[i]
        hist = df.iloc[:i]
        model = fit_model(hist)
        night_of = (night["wake"] - timedelta(hours=12)).date()
        try:
            plan = plan_night(hist, night_of, s, deadline=night["wake"].to_pydatetime(), model=model)
        except ValueError:
            continue
        usual = hist["onset_h"].tail(7).mean()
        rows.append({
            "score": night["score"],
            "pred_actual": float(model.predict([night["sleep_h"]], [night["onset_h"]], [night["onset_dev"] or 0])[0]),
            "gap_plan": abs((night["onset"] - pd.Timestamp(plan.sleep_onset)).total_seconds() / 3600),
            "gap_usual": abs(night["onset_h"] - usual),
        })
    r = pd.DataFrame(rows)
    print(f"nights tested: {len(r)}")
    print(f"walk-forward prediction error (MAE): {np.abs(r.score - r.pred_actual).mean():.1f} points; "
          f"guessing the average: {np.abs(r.score - r.score.expanding().mean().shift().fillna(r.score.iloc[0])).mean():.1f}")
    for col, name in [("gap_plan", "engine plan"), ("gap_usual", "usual onset (baseline)")]:
        close, far = r[r[col] <= CLOSE_H], r[r[col] > CLOSE_H]
        print(f"{name:24s} close (<= {CLOSE_H}h): n={len(close):3d} mean score {close.score.mean():.1f} | "
              f"far: n={len(far):3d} mean {far.score.mean():.1f} | diff {close.score.mean() - far.score.mean():+.1f}")
    for lo, hi in [(0, 0.5), (0.5, 1), (1, 2), (2, 9)]:
        b = r[(r.gap_plan > lo) & (r.gap_plan <= hi)] if lo else r[r.gap_plan <= hi]
        print(f"  distance from plan {lo}-{hi}h: n={len(b):3d} mean score {b.score.mean():.1f}")


if __name__ == "__main__":
    main()
