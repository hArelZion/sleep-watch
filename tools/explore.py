"""Print the numbers behind the stage-3 report."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from sleepwatch.features import binned, load_nights  # noqa: E402

df = load_nights(ROOT / "data" / "nights.csv")
pd.set_option("display.width", 160)

print("== overall")
print(df[["score", "sleep_h", "onset_h", "wake_h", "deep_pct", "rem_pct", "awake_min", "hrv", "rhr"]].describe().round(2).T)

print("\n== score by sleep duration (h)")
print(binned(df, "sleep_h", [0, 5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10, 13]))
print("\n== score by onset time (h, 24=midnight)")
print(binned(df, "onset_h", [18, 23, 23.5, 24, 24.5, 25, 25.5, 26, 27, 30]))
print("\n== score by onset deviation from previous week (h)")
print(binned(df, "onset_dev", [0, 0.25, 0.5, 1, 1.5, 2, 3, 10]))
print("\n== score by wake time")
print(binned(df, "wake_h", [0, 6, 7, 7.5, 8, 8.5, 9, 10, 11, 15]))
print("\n== weekday vs free day")
print(df.groupby("free_day")[["score", "sleep_h", "onset_h", "wake_h", "mid_h"]].mean().round(2))

print("\n== correlations with score")
cols = ["sleep_h", "onset_h", "wake_h", "onset_dev", "deep_pct", "rem_pct", "light_pct", "awake_min",
        "awake_count", "hrv", "rhr", "sleep_hr", "stress", "steps", "exercise_min", "prev_sleep_h", "debt_3d"]
print(df[cols + ["score"]].corr(method="spearman")["score"].drop("score").sort_values().round(2))

print("\n== what goes with low scores (<70) vs good (>=85)")
low, good = df[df.score < 70], df[df.score >= 85]
print(pd.DataFrame({"low": low[cols].mean(), "good": good[cols].mean()}).round(2))
print(f"low n={len(low)} good n={len(good)}")

print("\n== REM% and deep% bins")
print(binned(df, "rem_pct", [0, 10, 15, 20, 25, 30, 50]))
print(binned(df, "deep_pct", [0, 15, 20, 25, 30, 60]))

print("\n== linear model: score ~ components")
X = df[["sleep_h", "rem_pct", "deep_pct", "awake_min", "onset_dev"]].copy()
X["short"] = np.clip(7.5 - df["sleep_h"], 0, None)  # penalty below 7.5h
d = pd.concat([X, df["score"]], axis=1).dropna()
A = np.column_stack([np.ones(len(d)), d[X.columns].values])
coef, *_ = np.linalg.lstsq(A, d["score"].values, rcond=None)
pred = A @ coef
r2 = 1 - ((d.score - pred) ** 2).sum() / ((d.score - d.score.mean()) ** 2).sum()
print(dict(zip(["const"] + list(X.columns), coef.round(2))), "R2", round(r2, 3))

print("\n== monthly")
print(df.resample("ME")[["score", "sleep_h", "onset_h"]].mean().round(2))
