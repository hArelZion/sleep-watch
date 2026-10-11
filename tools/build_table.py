"""Combine the raw history files into data/nights.csv (one row per wake-up date) and print checks."""
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from sleepwatch.parse import parse_daily, parse_hrv, parse_rhr, parse_sleep  # noqa: E402

HIST = ROOT / "data" / "raw" / "history"


def main() -> None:
    rows: dict[str, dict] = {}

    def merge(parsed: dict[str, dict]) -> None:
        for d, r in parsed.items():
            rows.setdefault(d, {}).update(r)

    for f in sorted(HIST.glob("sleep_*.txt")):
        merge(parse_sleep(f.read_text("utf-8")))
    for f in sorted(HIST.glob("hrv_*.txt")):
        merge(parse_hrv(f.read_text("utf-8")))
    merge(parse_daily((HIST / "daily_health.txt").read_text("utf-8")))
    merge(parse_rhr((HIST / "resting_hr.txt").read_text("utf-8")))

    df = pd.DataFrame.from_dict(rows, orient="index").sort_index()
    df.index.name = "date"
    # COROS reports score 0 / -1 for nights it could not evaluate; they carry no sleep data.
    df = df[df["score"] > 0]
    out = ROOT / "data" / "nights.csv"
    df.to_csv(out)

    print(f"nights with a score: {len(df)}  ({df.index.min()} .. {df.index.max()})")
    span = pd.date_range(df.index.min(), df.index.max())
    missing = span.difference(pd.to_datetime(df.index))
    print(f"days without sleep data: {len(missing)} of {len(span)}")
    print("missing values per column:")
    print(df.isna().sum()[df.isna().sum() > 0].to_string())
    stage_sum = df[["deep_pct", "light_pct", "rem_pct", "awake_pct"]].sum(axis=1)
    print(f"stage % sum off by >2: {(abs(stage_sum - 100) > 2).sum()}")
    print(f"score range {df.score.min()}..{df.score.max()}, sleep_min range {df.sleep_min.min()}..{df.sleep_min.max()}")
    print(f"saved {out}")


if __name__ == "__main__":
    main()
