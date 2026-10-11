// Mirror of sleepwatch/engine.py plan_from_state, so the phone can re-plan instantly when the
// user changes tonight's deadline. tools/check_planner.py verifies both give identical plans.
// Times are wall-clock "hours since 00:00 of the evening the night starts" (25.5 = 01:30).

export const DEFAULTS = {
  latency_min: 15, prep_min: 0, wind_down_min: 30,
  min_sleep_h: 7.0, max_sleep_h: 9.0, max_shift_h: 1.0, max_advance_h: 1.5,
};

function arange(start, stop, step) {
  const n = Math.ceil((stop - start) / step);
  return Array.from({ length: Math.max(n, 0) }, (_, i) => start + i * step);
}
const clip = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

export function predict(state, sleep_h, onset_h, dev) {
  const { coef: c, hinges: k } = state;
  return c[0]
    + c[1] * Math.max(k.dur_low - sleep_h, 0)
    + c[2] * Math.max(sleep_h - k.dur_high, 0)
    + c[3] * Math.max(onset_h - k.onset_late, 0)
    + c[4] * Math.max(k.onset_early - onset_h, 0)
    + c[5] * Math.min(dev, 4);
}

function targetSleep(state, s) {
  const grid = arange(s.min_sleep_h, s.max_sleep_h + 1e-9, 0.25);
  const pred = grid.map((d) => predict(state, d, 24.5, 0));
  const max = Math.max(...pred);
  const top = grid.filter((_, i) => pred[i] >= max - 0.5);
  let best = top.reduce((a, b) => a + b, 0) / top.length;
  if (state.debt_3d > 1.5) best += 0.5;
  return clip(best, s.min_sleep_h, s.max_sleep_h);
}

// "YYYY-MM-DD" + hours -> "YYYY-MM-DDTHH:MM" (wall clock, no time zones involved)
export function atClock(nightOf, hours) {
  const [y, m, d] = nightOf.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + Math.round(hours * 60) * 60000);
  return t.toISOString().slice(0, 16);
}
export function clockOf(nightOf, isoLocal) {
  const [y, m, d] = nightOf.split("-").map(Number);
  const [dt, tm] = isoLocal.split("T");
  const [yy, mm, dd] = dt.split("-").map(Number);
  const [hh, mi] = tm.split(":").map(Number);
  return (Date.UTC(yy, mm - 1, dd, hh, mi) - Date.UTC(y, m - 1, d)) / 3600000;
}

export function fmtH(h) {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} שעות`;
}

/** deadline: "YYYY-MM-DDTHH:MM" or null. Returns the same shape as Plan.to_dict(). */
export function planFromState(state, nightOf, settings = {}, deadline = null) {
  const s = { ...DEFAULTS, ...settings };
  const [y, m, d] = nightOf.split("-").map(Number);
  const wakeDow = new Date(Date.UTC(y, m - 1, d + 1)).getUTCDay(); // 0=Sun .. 5=Fri, 6=Sat
  const isFree = wakeDow === 5 || wakeDow === 6; // waking Friday or Saturday (pandas 4,5)
  const usualWake = isFree ? state.usual_wake_free : state.usual_wake_work;
  const usual = state.usual_onset;
  const debt = state.debt_3d;
  const target = targetSleep(state, s);

  const onsets = arange(21.0, 28.0 + 1e-9, 1 / 12);
  const durs = arange(3.0, s.max_sleep_h + 1e-9, 1 / 12);
  const latest = deadline == null ? null : clockOf(nightOf, deadline) - s.prep_min / 60;

  let best = null;
  let anyOk = false;
  for (const D of durs) {
    for (const O of onsets) {
      const wakeClock = O + D;
      const dev = Math.abs(O - usual);
      const pred = predict(state, D, O, dev);
      let u = pred - 2.0 * Math.abs(D - target) - 1.5 * Math.max(dev - s.max_shift_h, 0);
      if (!(O >= usual - s.max_advance_h)) continue;
      if (latest != null) {
        if (!(wakeClock <= latest + 1e-9)) continue;
        anyOk = true;
        u -= 0.5 * Math.max(latest - wakeClock, 0);
      } else {
        u -= 1.0 * Math.abs(wakeClock - (usualWake + 24));
      }
      if (best == null || u > best.u) best = { u, O, D, pred };
    }
  }
  if (latest != null && !anyOk) throw new Error("deadline is too early to plan a night");

  const { O: onsetH, D: sleepH, pred: p } = best;
  const onsetMin = Math.round(onsetH * 60);
  const onset = atClock(nightOf, onsetMin / 60);
  const wake = atClock(nightOf, (onsetMin + Math.round(sleepH * 60)) / 60);
  const lightsOut = atClock(nightOf, (onsetMin - s.latency_min) / 60);
  const bedReminder = atClock(nightOf, (onsetMin - s.latency_min - s.wind_down_min) / 60);
  const shift = onsetH - usual;

  const reasons = [`יעד שינה: ${fmtH(target)} — הטווח שבו הציון שלך הכי גבוה.`];
  if (debt > 1.5) reasons.push(`ישנת פחות מהיעד ב-3 הלילות האחרונים (${fmtH(debt)} חסר), אז הוספתי חצי שעה.`);
  if (deadline != null) {
    reasons.push(`חייב להיות ער עד ${deadline.slice(11, 16)}` + (s.prep_min ? `, כולל ${s.prep_min} דקות התארגנות.` : "."));
    if (sleepH < target - 0.1) reasons.push(`שעת היעד מוקדמת, אז יש פחות שינה מהיעד (${fmtH(sleepH)}).`);
  }
  if (deadline != null && sleepH < target - 0.1 && shift <= -s.max_shift_h + 0.05) {
    reasons.push("להירדם עוד יותר מוקדם לא סביר לשעון הביולוגי שלך, אז השינה הלילה קצרה יותר.");
  }
  if (Math.abs(shift) >= 0.75) {
    reasons.push(`זה ${fmtH(Math.abs(shift))} ${shift < 0 ? "מוקדם" : "מאוחר"} מהרגיל שלך — שינוי גדול פוגע מעט בסדירות.`);
  } else {
    reasons.push("קרוב לשעת השינה הרגילה שלך, טוב לסדירות.");
  }

  const r2 = (x) => Math.round(x * 100) / 100;
  return {
    night_of: nightOf,
    lights_out: lightsOut,
    sleep_onset: onset,
    wake,
    bed_reminder: bedReminder,
    sleep_h: r2(sleepH),
    predicted_score: Math.round(clip(p, 0, 100)),
    score_range: [Math.round(clip(p - state.mae, 0, 100)), Math.round(clip(p + state.mae, 0, 100))],
    shift_h: r2(shift),
    deadline,
    reasons,
  };
}
