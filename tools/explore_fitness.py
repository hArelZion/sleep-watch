"""Numbers for the fitness/tennis analysis: how workouts affect sleep and recovery."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from sleepwatch.features import load_nights  # noqa: E402

nights = load_nights(ROOT / "data" / "nights.csv")
acts = pd.DataFrame(json.loads((ROOT / "data" / "activities.json").read_text("utf-8")))
acts["start"] = pd.to_datetime(acts["start_local"])
acts["end"] = pd.to_datetime(acts["end_local"])
acts["tennis"] = acts["sport_type"] == 1005
pd.set_option("display.width", 160)

print("== workouts by sport (count, mean load, mean kcal, mean min)")
print(acts.groupby("sport_he").agg(n=("label_id", "size"), load=("load", "mean"), kcal=("calories", "mean"),
                                    minutes=("duration_s", lambda s: s.mean() / 60)).round(0).sort_values("n", ascending=False))
print("\n== start hour of tennis")
print(acts[acts.tennis]["start"].dt.hour.value_counts().sort_index().to_string())

# For each night: hours between the last workout's end and sleep onset (same evening only)
rows = []
for d, n in nights.iterrows():
    before = acts[(acts["end"] <= n["onset"]) & (acts["end"] > n["onset"] - pd.Timedelta(hours=18))]
    last = before.sort_values("end").iloc[-1] if len(before) else None
    rows.append({"date": d, "gap_h": (n["onset"] - last["end"]).total_seconds() / 3600 if last is not None else np.nan,
                 "tennis": bool(last["tennis"]) if last is not None else False,
                 "load": before["load"].sum() if len(before) else 0})
w = pd.DataFrame(rows).set_index("date")
n2 = nights.join(w)
n2["group"] = np.select([n2.gap_h.isna(), n2.gap_h < 3, n2.gap_h < 6], ["no workout", "<3h before sleep", "3-6h"], "6h+")
print("\n== sleep after workouts (by time from workout end to falling asleep)")
print(n2.groupby("group")[["score", "sleep_h", "onset_h", "deep_pct", "rem_pct", "awake_min", "sleep_hr"]].agg(["mean"]).round(1).assign(
    n=n2.groupby("group").size()))
t = n2[n2.tennis]
print("\n== tennis evenings only by gap")
print(t.assign(g=pd.cut(t.gap_h, [0, 2, 3, 4, 6, 18])).groupby("g", observed=True)[["score", "onset_h", "sleep_hr", "deep_pct"]].mean().round(1).assign(
    n=t.assign(g=pd.cut(t.gap_h, [0, 2, 3, 4, 6, 18])).groupby("g", observed=True).size()))

# Recovery: HRV and resting HR on the mornings after tennis vs the 7 days before
print("\n== recovery after tennis (difference from the previous 7-day average)")
rec = []
for _, a in acts[acts.tennis].iterrows():
    day0 = a["end"].normalize()
    base = nights[(nights.index < day0) & (nights.index >= day0 - pd.Timedelta(days=7))]
    for k in (1, 2, 3):
        dk = day0 + pd.Timedelta(days=k)
        if dk in nights.index and len(base) >= 4:
            rec.append({"day": k, "hrv_d": nights.at[dk, "hrv"] - base["hrv"].mean(),
                        "rhr_d": nights.at[dk, "rhr"] - base["rhr"].mean(), "load": a["load"]})
r = pd.DataFrame(rec)
print(r.groupby("day")[["hrv_d", "rhr_d"]].agg(["mean", "count"]).round(1))
print("high-load (>=120) sessions:")
print(r[r.load >= 120].groupby("day")[["hrv_d", "rhr_d"]].mean().round(1))

# Daily load series and ACWR
daily = acts.groupby(acts["start"].dt.normalize())["load"].sum().reindex(pd.date_range(nights.index.min(), nights.index.max()), fill_value=0)
atl = daily.ewm(span=7).mean()
ctl = daily.ewm(span=42).mean()
acwr = (atl / ctl).replace([np.inf], np.nan)
print("\n== load: weekly total last 8 weeks")
print(daily.resample("W").sum().tail(8).round(0).to_string())
print("ACWR now", round(acwr.iloc[-1], 2), "ATL", round(atl.iloc[-1], 1), "CTL", round(ctl.iloc[-1], 1))

print("\n== calories (daily total from COROS) last 30 days")
print(nights["calories"].tail(30).describe().round(0).to_string() if "calories" in nights else "no calories column")
print("\n== tennis sessions: avg HR, peak10, bursts, zones (last 10)")
tt = acts[acts.tennis].tail(10)
for _, a in tt.iterrows():
    f = a["fit"] if isinstance(a["fit"], dict) else {}
    print(a["start_local"], int(a["duration_s"] / 60), "min", a["avg_hr"], "hr", f.get("peak10_hr"), "peak", f.get("bursts"), "bursts", f.get("zones_min"), a.get("load"))
