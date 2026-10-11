"""Recommendation engine: when to go to bed and when to wake up tonight.

The score model is fitted on the user's own nights. It only uses things the user controls:
sleep duration, sleep-onset clock time and the jump from the previous week's onset. The
planner then searches onset/wake pairs that respect the wake deadline and picks the one with
the highest predicted score, with a mild preference for keeping the usual schedule.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

import numpy as np
import pandas as pd

# ---- score model -------------------------------------------------------------------------

DUR_LOW, DUR_HIGH = 7.5, 9.0       # hinge points (h) for "too short" / "too long"
ONSET_LATE, ONSET_EARLY = 25.0, 24.0  # 01:00 and 00:00 on the continuous night clock
RIDGE = 1.0
MIN_RATED_NIGHTS = 28               # morning ratings start to count after about a month


def _design(sleep_h, onset_h, onset_dev) -> np.ndarray:
    sleep_h, onset_h, onset_dev = map(np.asarray, (sleep_h, onset_h, onset_dev))
    return np.column_stack([
        np.ones_like(sleep_h, dtype=float),
        np.clip(DUR_LOW - sleep_h, 0, None),
        np.clip(sleep_h - DUR_HIGH, 0, None),
        np.clip(onset_h - ONSET_LATE, 0, None),
        np.clip(ONSET_EARLY - onset_h, 0, None),
        np.minimum(onset_dev, 4),
    ])


@dataclass
class ScoreModel:
    coef: np.ndarray
    mae: float          # typical error, shown to the user as the +/- range
    n: int

    @classmethod
    def fit(cls, sleep_h, onset_h, onset_dev, target) -> "ScoreModel":
        X = _design(sleep_h, onset_h, onset_dev)
        y = np.asarray(target, dtype=float)
        reg = RIDGE * np.eye(X.shape[1])
        reg[0, 0] = 0  # don't shrink the intercept
        coef = np.linalg.solve(X.T @ X + reg, X.T @ y)
        mae = float(np.abs(X @ coef - y).mean())
        return cls(coef=coef, mae=mae, n=len(y))

    def predict(self, sleep_h, onset_h, onset_dev) -> np.ndarray:
        return _design(sleep_h, onset_h, onset_dev) @ self.coef


# ---- inputs / outputs --------------------------------------------------------------------

@dataclass
class Settings:
    latency_min: int = 15            # minutes from lying down to falling asleep
    prep_min: int = 0                # minutes needed between waking and the "must be up" time
    wind_down_min: int = 30          # bedtime reminder fires this long before lights out
    min_sleep_h: float = 7.0
    max_sleep_h: float = 9.0
    max_shift_h: float = 1.0         # how far tonight's onset may move from the usual without a deadline
    max_advance_h: float = 1.5       # never plan falling asleep more than this much earlier than usual:
                                     # the body clock makes much earlier sleep unrealistic
    age: int | None = None


@dataclass
class Plan:
    night_of: date
    lights_out: datetime             # get into bed
    sleep_onset: datetime            # expected to be asleep
    wake: datetime                   # wake alarm
    bed_reminder: datetime
    sleep_h: float
    predicted_score: float
    score_range: tuple[float, float]
    shift_h: float                   # onset change vs. the usual (last 7 nights)
    deadline: datetime | None
    reasons: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        f = "%Y-%m-%dT%H:%M"
        return {
            "night_of": self.night_of.isoformat(),
            "lights_out": self.lights_out.strftime(f),
            "sleep_onset": self.sleep_onset.strftime(f),
            "wake": self.wake.strftime(f),
            "bed_reminder": self.bed_reminder.strftime(f),
            "sleep_h": round(self.sleep_h, 2),
            "predicted_score": round(self.predicted_score),
            "score_range": [round(self.score_range[0]), round(self.score_range[1])],
            "shift_h": round(self.shift_h, 2),
            "deadline": self.deadline.strftime(f) if self.deadline else None,
            "reasons": self.reasons,
        }


# ---- helpers -----------------------------------------------------------------------------

def night_clock(dt: datetime) -> float:
    """Clock time on the continuous night scale: 23:30 -> 23.5, 01:15 -> 25.25."""
    h = dt.hour + dt.minute / 60
    return h if h >= 18 else h + 24


def at_night_clock(night_of: date, h: float) -> datetime:
    """Inverse of night_clock for the night that starts on `night_of` (rounded to the minute)."""
    return datetime.combine(night_of, time(0)) + timedelta(minutes=round(h * 60))


def target_sleep_h(model: ScoreModel, s: Settings, debt_3d_h: float) -> float:
    """Duration with the best predicted score, nudged up after a short few nights."""
    grid = np.arange(s.min_sleep_h, s.max_sleep_h + 1e-9, 0.25)
    pred = model.predict(grid, np.full_like(grid, 24.5), np.zeros_like(grid))
    best = float(grid[pred >= pred.max() - 0.5].mean())  # middle of the flat top
    if debt_3d_h > 1.5:
        best += 0.5
    return float(np.clip(best, s.min_sleep_h, s.max_sleep_h))


# ---- planner -----------------------------------------------------------------------------

def model_state(history: pd.DataFrame, night_of: date, ratings: pd.Series | None = None,
                model: ScoreModel | None = None) -> dict:
    """Everything the planner needs, as plain JSON. The daily job stores this so the phone app
    can re-plan instantly (app/planner.js mirrors plan_from_state)."""
    hist = history[history.index < pd.Timestamp(night_of) + pd.Timedelta(days=1)]
    hist = hist.dropna(subset=["sleep_h", "onset_h", "score"])
    if model is None:
        model = fit_model(hist, ratings)

    def usual_wake(free: bool) -> float:
        same = hist[hist["free_day"] == free].tail(14)
        return float(same["wake_h"].median()) if len(same) else 9.0

    return {
        "coef": [float(c) for c in model.coef],
        "mae": model.mae,
        "n": model.n,
        "hinges": {"dur_low": DUR_LOW, "dur_high": DUR_HIGH,
                   "onset_late": ONSET_LATE, "onset_early": ONSET_EARLY},
        "usual_onset": float(hist["onset_h"].tail(7).mean()),
        "usual_wake_work": usual_wake(False),
        "usual_wake_free": usual_wake(True),
        "debt_3d": float((8 - hist["sleep_h"].tail(3)).sum()),
        "last_night": hist.index[-1].date().isoformat(),
    }


def plan_night(history: pd.DataFrame, night_of: date, s: Settings,
               deadline: datetime | None = None, ratings: pd.Series | None = None,
               model: ScoreModel | None = None) -> Plan:
    """history: load_nights() frame (index = wake date) with only nights before `night_of`."""
    return plan_from_state(model_state(history, night_of, ratings, model), night_of, s, deadline)


def plan_from_state(state: dict, night_of: date, s: Settings,
                    deadline: datetime | None = None) -> Plan:
    model = ScoreModel(coef=np.asarray(state["coef"]), mae=state["mae"], n=state["n"])
    usual_onset = state["usual_onset"]
    is_free = pd.Timestamp(night_of + timedelta(days=1)).dayofweek in (4, 5)
    usual_wake = state["usual_wake_free"] if is_free else state["usual_wake_work"]
    debt = state["debt_3d"]

    target = target_sleep_h(model, s, debt)

    # Candidate onsets every 5 minutes from 21:00 to 04:00, durations every 5 minutes.
    onsets = np.arange(21.0, 28.0 + 1e-9, 1 / 12)
    # Down to 3h so an early deadline (a flight) still gets the best short night, not an error.
    durs = np.arange(3.0, s.max_sleep_h + 1e-9, 1 / 12)
    O, D = np.meshgrid(onsets, durs)
    O, D = O.ravel(), D.ravel()
    wake_clock = O + D  # continuous clock (e.g. 32.5 = 08:30 next day)

    dev = np.abs(O - usual_onset)
    pred = model.predict(D, O, dev)
    # Prefer the target duration and the usual schedule; keep these soft so the model decides.
    utility = pred - 2.0 * np.abs(D - target) - 1.5 * np.maximum(dev - s.max_shift_h, 0)
    utility = np.where(O >= usual_onset - s.max_advance_h, utility, -np.inf)

    reasons = []
    if deadline is not None:
        latest = deadline - timedelta(minutes=s.prep_min)
        latest_clock = (latest - datetime.combine(night_of, time(0))).total_seconds() / 3600
        ok = wake_clock <= latest_clock + 1e-9
        if not (ok & np.isfinite(utility)).any():
            raise ValueError("deadline is too early to plan a night")
        utility = np.where(ok, utility, -np.inf)
        # Waking earlier than needed only costs sleep, so prefer waking near the latest time.
        utility -= 0.5 * np.clip(latest_clock - wake_clock, 0, None)
    else:
        utility -= 1.0 * np.abs(wake_clock - (usual_wake + 24))

    i = int(np.argmax(utility))
    onset_h, sleep_h = float(O[i]), float(D[i])
    onset = at_night_clock(night_of, onset_h)
    wake = onset + timedelta(minutes=round(sleep_h * 60))
    lights_out = onset - timedelta(minutes=s.latency_min)
    p = float(pred[i])
    shift = onset_h - usual_onset

    reasons.append(f"יעד שינה: {fmt_h(target)} — הטווח שבו הציון שלך הכי גבוה.")
    if debt > 1.5:
        reasons.append(f"ישנת פחות מהיעד ב-3 הלילות האחרונים ({fmt_h(debt)} חסר), אז הוספתי חצי שעה.")
    if deadline is not None:
        reasons.append(f"חייב להיות ער עד {deadline:%H:%M}" + (f", כולל {s.prep_min} דקות התארגנות." if s.prep_min else "."))
        if sleep_h < target - 0.1:
            reasons.append(f"שעת היעד מוקדמת, אז יש פחות שינה מהיעד ({fmt_h(sleep_h)}).")
    if deadline is not None and sleep_h < target - 0.1 and shift <= -s.max_shift_h + 0.05:
        reasons.append("להירדם עוד יותר מוקדם לא סביר לשעון הביולוגי שלך, אז השינה הלילה קצרה יותר.")
    if abs(shift) >= 0.75:
        side = "מוקדם" if shift < 0 else "מאוחר"
        reasons.append(f"זה {fmt_h(abs(shift))} {side} מהרגיל שלך — שינוי גדול פוגע מעט בסדירות.")
    else:
        reasons.append("קרוב לשעת השינה הרגילה שלך, טוב לסדירות.")

    return Plan(
        night_of=night_of, lights_out=lights_out, sleep_onset=onset, wake=wake,
        bed_reminder=lights_out - timedelta(minutes=s.wind_down_min), sleep_h=sleep_h,
        predicted_score=float(np.clip(p, 0, 100)),
        score_range=(float(np.clip(p - model.mae, 0, 100)), float(np.clip(p + model.mae, 0, 100))),
        shift_h=shift, deadline=deadline, reasons=reasons,
    )


def fit_model(hist: pd.DataFrame, ratings: pd.Series | None = None) -> ScoreModel:
    """Fit on COROS score; once there are enough morning ratings (1-10), blend them in as a
    second target scaled to 0-100 so the plan also follows how the user actually feels."""
    h = hist.dropna(subset=["sleep_h", "onset_h", "score"])
    dev = h["onset_dev"].fillna(0)
    target = h["score"].astype(float)
    if ratings is not None:
        r = ratings.reindex(h.index).dropna()
        if len(r) >= MIN_RATED_NIGHTS:
            weight = min(0.5, len(r) / 200)  # grows slowly with more ratings, max half
            target = target.copy()
            target.loc[r.index] = (1 - weight) * target.loc[r.index] + weight * (r * 10)
    return ScoreModel.fit(h["sleep_h"], h["onset_h"], dev, target)


def fmt_h(h: float) -> str:
    m = int(round(h * 60))
    return f"{m // 60}:{m % 60:02d} שעות"
