"""Per-night features shared by the analysis and the recommendation engine."""
import numpy as np
import pandas as pd


def clock_hours(ts: pd.Series, pivot: float = 18.0) -> pd.Series:
    """Clock time as hours where evening/night times stay continuous: 23:30 -> 23.5, 01:00 -> 25.0."""
    h = ts.dt.hour + ts.dt.minute / 60
    return h.where(h >= pivot, h + 24)


def load_nights(path) -> pd.DataFrame:
    return prepare(pd.read_csv(path, index_col="date", parse_dates=["date", "onset", "wake"]))


def prepare(df: pd.DataFrame) -> pd.DataFrame:
    """Add derived columns to raw nights (index = wake date; onset/wake datetimes)."""
    df = df.copy()
    df.index = pd.to_datetime(df.index)
    df.index.name = "date"
    df["onset"] = pd.to_datetime(df["onset"])
    df["wake"] = pd.to_datetime(df["wake"])
    df = df[df["score"] > 0].sort_index()
    df["onset_h"] = clock_hours(df["onset"])
    # wake is a morning time; keep it on a plain 0-24 scale (12 = noon)
    df["wake_h"] = df["wake"].dt.hour + df["wake"].dt.minute / 60
    df["sleep_h"] = df["sleep_min"] / 60
    df["mid_h"] = df["onset_h"] + (df["wake"] - df["onset"]).dt.total_seconds() / 7200
    # Israeli weekend: nights into Friday and Saturday morning are "free" (no work alarm)
    df["free_day"] = df.index.dayofweek.isin([4, 5])
    # Regularity: how far tonight's onset is from the mean of the previous 7 nights
    prev_mean = df["onset_h"].rolling("7D", closed="left").mean()
    df["onset_dev"] = (df["onset_h"] - prev_mean).abs()
    df["prev_sleep_h"] = df["sleep_h"].shift(1)
    df["debt_3d"] = (8 - df["sleep_h"]).rolling("3D", closed="left").sum()
    return df


def binned(df: pd.DataFrame, col: str, edges, target: str = "score") -> pd.DataFrame:
    cats = pd.cut(df[col], edges)
    g = df.groupby(cats, observed=True)[target]
    out = g.agg(["count", "mean", "median"]).round(1)
    out["se"] = (g.std() / np.sqrt(g.count())).round(1)
    return out
