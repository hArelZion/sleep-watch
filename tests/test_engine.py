import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from sleepwatch.engine import (  # noqa: E402
    MIN_RATED_NIGHTS, ScoreModel, Settings, at_night_clock, fit_model, night_clock, plan_night,
)
from sleepwatch.features import clock_hours  # noqa: E402


def make_history(n=120, onset_h=25.0, sleep_h=8.0, seed=0) -> pd.DataFrame:
    """Synthetic nights: score peaks at 8h sleep, drops when short."""
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2026-01-02", periods=n, freq="D")
    on = onset_h + rng.normal(0, 0.7, n)
    dur = sleep_h + rng.normal(0, 1.2, n)
    score = 90 - 9 * np.clip(7.5 - dur, 0, None) - 8 * np.clip(dur - 9, 0, None) + rng.normal(0, 3, n)
    onset = [datetime.combine(d.date() - timedelta(days=1), datetime.min.time()) + timedelta(hours=h)
             for d, h in zip(idx, on)]
    wake = [o + timedelta(hours=float(x)) for o, x in zip(onset, dur)]
    df = pd.DataFrame({"score": score, "sleep_h": dur, "onset_h": on, "onset": onset, "wake": wake}, index=idx)
    df["wake_h"] = [w.hour + w.minute / 60 for w in wake]
    df["free_day"] = df.index.dayofweek.isin([4, 5])
    df["onset_dev"] = (df["onset_h"] - df["onset_h"].rolling(7, min_periods=1).mean().shift()).abs()
    return df


NIGHT = date(2026, 5, 3)


def test_night_clock_round_trip_across_midnight():
    for h in (22.0, 23.75, 24.0, 25.5, 27.25):
        dt = at_night_clock(NIGHT, h)
        assert night_clock(dt) == pytest.approx(h)
    assert at_night_clock(NIGHT, 25.5) == datetime(2026, 5, 4, 1, 30)


def test_clock_hours_keeps_night_continuous():
    s = pd.Series(pd.to_datetime(["2026-01-01 23:30", "2026-01-02 01:15", "2026-01-02 19:00"]))
    assert list(clock_hours(s)) == [23.5, 25.25, 19.0]


def test_deadline_is_respected_with_prep_time():
    hist = make_history()
    deadline = datetime(2026, 5, 4, 8, 0)
    p = plan_night(hist, NIGHT, Settings(prep_min=20), deadline=deadline)
    assert p.wake <= deadline - timedelta(minutes=20)
    assert p.lights_out < p.sleep_onset < p.wake
    assert p.bed_reminder == p.lights_out - timedelta(minutes=30)


def test_wakes_near_deadline_not_much_earlier():
    hist = make_history()
    deadline = datetime(2026, 5, 4, 9, 30)
    p = plan_night(hist, NIGHT, Settings(), deadline=deadline)
    assert deadline - p.wake <= timedelta(minutes=30)


def test_never_plans_sleep_far_earlier_than_usual():
    hist = make_history(onset_h=25.0)
    s = Settings()
    p = plan_night(hist, NIGHT, s, deadline=datetime(2026, 5, 4, 5, 0))
    usual = hist["onset_h"].tail(7).mean()
    assert night_clock(p.sleep_onset) >= usual - s.max_advance_h - 1e-6
    assert p.sleep_h < 8  # the early deadline costs sleep instead
    assert any("הביולוגי" in r for r in p.reasons)


def test_impossible_deadline_raises():
    hist = make_history(onset_h=25.0)
    with pytest.raises(ValueError):
        plan_night(hist, NIGHT, Settings(), deadline=datetime(2026, 5, 3, 23, 0))


def test_no_deadline_gives_target_length_sleep():
    hist = make_history()
    p = plan_night(hist, NIGHT, Settings())
    assert 7.0 <= p.sleep_h <= 9.0
    assert p.score_range[0] <= p.predicted_score <= p.score_range[1]


def test_model_learns_short_sleep_penalty():
    hist = make_history()
    m = fit_model(hist)
    short, ok = m.predict([5.5, 8.0], [25, 25], [0, 0])
    assert ok - short > 10


def test_ratings_only_count_after_a_month():
    hist = make_history()
    few = pd.Series(1.0, index=hist.index[: MIN_RATED_NIGHTS - 1])
    many = pd.Series(1.0, index=hist.index[: MIN_RATED_NIGHTS + 20])
    base = fit_model(hist).coef
    assert np.allclose(fit_model(hist, few).coef, base)
    assert not np.allclose(fit_model(hist, many).coef, base)


def test_score_model_fit_recovers_intercept():
    m = ScoreModel.fit([8, 8, 8, 8], [24.5] * 4, [0] * 4, [90, 90, 90, 90])
    assert m.predict([8], [24.5], [0])[0] == pytest.approx(90, abs=0.5)
