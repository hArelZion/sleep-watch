// Fitness: watch fitness numbers, recovery, training load, daily activity and every workout.
import { bars, lines, zonesBar, ZONE_COLORS } from "../charts.js";
import { dm, esc, fmtDur, hm, openSheet, round, sportIcon } from "../util.js";
import { openLog } from "./tennis.js";

const FOCUS_HE = { Threshold: "סף", Aerobic: "אירובי", "Aerobic Base": "בסיס אירובי", Recovery: "התאוששות", Anaerobic: "אנאירובי", "Anaerobic Capacity": "יכולת אנאירובית", Sprint: "ספרינט", "VO2 Max": "VO2max", "Lactate Threshold": "סף" };
const ZONE_HE = ["התאוששות", "קל", "אירובי", "סף", "מקסימלי"];

export function renderFitness(app, ctx) {
  const { st } = ctx;
  const ins = st.insights || {};
  const f = st.fitness.at(-1)?.data || ins.coros || {};
  const load = ins.load || {};
  const ns = st.nights.slice(-30);
  const acts = [...st.activities].reverse();
  const weeks = weeklyMinutes(st.activities);
  const vo2 = st.fitness.filter((x) => x.data.vo2max != null);

  app.innerHTML = `
  <section class="card glass"><div class="row spread"><h2>הכושר שלך</h2><span class="small muted">מהשעון</span></div>
    <div class="grid3">
      <div class="tile"><span class="eyebrow">VO2max</span><b class="mid">${f.vo2max ?? "–"}</b></div>
      <div class="tile"><span class="eyebrow">רמת ריצה</span><b class="mid">${f.running_level ?? "–"}</b></div>
      <div class="tile"><span class="eyebrow">קצב סף</span><b class="mid" style="font-size:19px">${esc((f.threshold_pace || "–").replace(" /km", ""))}</b><span class="small muted">לק"מ</span></div>
    </div>
    ${f.pred_5k ? `<div class="grid2">
      <div class="tile"><span class="eyebrow">5 ק"מ</span><b class="num">${esc(f.pred_5k)}</b></div><div class="tile"><span class="eyebrow">10 ק"מ</span><b class="num">${esc(f.pred_10k)}</b></div>
      <div class="tile"><span class="eyebrow">חצי מרתון</span><b class="num">${esc(f.pred_half)}</b></div><div class="tile"><span class="eyebrow">מרתון</span><b class="num">${esc(f.pred_marathon)}</b></div></div>` : ""}
    ${vo2.length >= 3 ? `<div class="chart">${lines([{ values: vo2.map((x) => x.data.vo2max), color: "var(--sport)" }], vo2.map((x) => dm(x.date)), { area: true })}</div>` : `<p class="small muted">גרף VO2max יתמלא מיום ליום מעכשיו.</p>`}
  </section>

  <section class="card glass"><div class="row spread"><h2>התאוששות ועומס</h2>${f.recovery_pct != null ? `<span class="pill ${f.recovery_pct >= 90 ? "good" : f.recovery_pct >= 60 ? "warn" : "bad"}">התאוששות ${f.recovery_pct}%</span>` : ""}</div>
    ${f.full_recovery ? `<p class="small muted">התאוששות מלאה בעוד ${esc(f.full_recovery.replace("h", " שעות"))}.</p>` : ""}
    <div class="grid3">
      <div class="tile"><span class="eyebrow">עומס קצר</span><b class="mid">${round(load.atl)}</b></div>
      <div class="tile"><span class="eyebrow">עומס ארוך</span><b class="mid">${round(load.ctl)}</b></div>
      <div class="tile"><span class="eyebrow">יחס</span><b class="mid" style="color:${ratioColor(load.ratio)}">${load.ratio ?? "–"}</b><span class="small muted">טוב: 0.8–1.3</span></div>
    </div>
    ${load.series_days?.length ? `<div class="chart">${lines([{ values: load.series_ctl, color: "var(--night)" }, { values: load.series_atl, color: "var(--accent)" }], load.series_days.map(dm), { ticks: [0, 25, 50] })}</div>
      <div class="legend"><span><i style="background:var(--accent)"></i>עומס 7 ימים</span><span><i style="background:var(--night)"></i>עומס 6 שבועות</span></div>
      <p class="small muted">כשהקו הכתום עולה הרבה מעל הכחול, העומס עולה מהר מדי.</p>` : ""}
  </section>

  ${ns.length ? `<section class="card glass"><h3>צעדים וקלוריות, 30 יום</h3>
    <div class="chart">${bars(ns.map((n) => ({ label: dm(n.date), value: n.data.steps ?? null, color: st.settings.steps_goal && n.data.steps >= st.settings.steps_goal ? "var(--good)" : "var(--sport)" })), { ticks: [5000, 10000], unit: " צעדים" })}</div>
    <div class="chart">${bars(ns.map((n) => ({ label: dm(n.date), value: n.data.calories ?? null, color: st.settings.calorie_goal && n.data.calories >= st.settings.calorie_goal ? "var(--good)" : "var(--accent)" })), { ticks: [500, 1000], unit: " קל׳" })}</div>
    <p class="small muted">ירוק = עמדת ביעד.</p></section>
  <section class="card glass"><h3>לחץ ממוצע ביום</h3>
    <div class="chart">${lines([{ values: ns.map((n) => n.data.stress ?? null), color: "var(--rem)" }], ns.map((n) => dm(n.date)), { ticks: [20, 40, 60], area: true })}</div></section>` : ""}

  ${weeks.length ? `<section class="card glass"><h3>דקות אימון בשבוע</h3>
    <div class="chart">${bars(weeks.map((w) => ({ label: dm(w.week), value: Math.round(w.min), color: "var(--sport)" })), { ticks: [120, 300], unit: " דק׳" })}</div></section>` : ""}

  <section class="card glass"><div class="row spread"><h2>אימונים</h2><span class="small muted">${st.activities.length}</span></div>
    <div class="list">${acts.slice(0, 40).map((a) => `<button class="item" data-act="${a.label_id}">
      <span class="dot ${a.data.sport_type === 1005 ? "tennis" : "sport"}">${sportIcon(a.data.sport_type)}</span>
      <span><b>${esc(a.data.sport_he)}</b> <span class="small muted">${dm(a.date)} · ${hm(a.data.start_local)}</span><br>
      <span class="small muted">${fmtDur((a.data.duration_s || 0) / 60)} · דופק ${a.data.avg_hr ?? "–"} · ${round(a.data.calories)} קל׳ · עומס ${round(a.data.load)}</span></span>
      <span class="small muted">${st.logs[a.label_id]?.rating ? `${st.logs[a.label_id].rating}/10` : "›"}</span></button>`).join("")}</div>
  </section>`;

  app.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => openActivity(ctx, b.dataset.act)));
}

const ratioColor = (r) => (r == null ? "inherit" : r > 1.5 ? "var(--bad)" : r > 1.3 ? "var(--warn)" : r < 0.8 ? "var(--night)" : "var(--good)");

function weeklyMinutes(acts) {
  const m = {};
  for (const a of acts) {
    const d = new Date(a.date + "T12:00:00");
    d.setDate(d.getDate() - d.getDay());
    const k = d.toISOString().slice(0, 10);
    m[k] = (m[k] || 0) + (a.data.duration_s || 0) / 60;
  }
  return Object.entries(m).sort().slice(-12).map(([week, min]) => ({ week, min }));
}

export function activityDetail(a) {
  const d = a.data, f = d.fit || {};
  return `
    <div class="row spread"><h2>${esc(d.sport_he)}</h2><span class="small muted">${dm(a.date)} · ${hm(d.start_local)}–${hm(d.end_local)}</span></div>
    <div class="grid3">
      <div class="tile"><span class="eyebrow">משך</span><b class="mid" style="font-size:20px">${fmtDur((d.duration_s || 0) / 60)}</b></div>
      <div class="tile"><span class="eyebrow">דופק ממוצע</span><b class="mid">${d.avg_hr ?? "–"}</b><span class="small muted">${f.max_hr ? `מקס׳ ${f.max_hr}` : ""}</span></div>
      <div class="tile"><span class="eyebrow">קלוריות</span><b class="mid">${round(d.calories)}</b></div>
      <div class="tile"><span class="eyebrow">עומס</span><b class="mid">${round(d.load)}</b></div>
      <div class="tile"><span class="eyebrow">השפעה אירובית</span><b class="mid">${d.aerobic_te ?? "–"}</b><span class="small muted">אנאירובית ${d.anaerobic_te ?? "–"}</span></div>
      <div class="tile"><span class="eyebrow">סוג מאמץ</span><b>${esc(FOCUS_HE[d.focus] ?? d.focus ?? "–")}</b></div>
    </div>
    ${f.hr_curve?.length ? `<h3>דופק לאורך האימון</h3><div class="chart">${lines([{ values: f.hr_curve, color: "var(--bad)" }], ["0", `${Math.round(f.hr_curve.length / 2)} דק׳`], { ticks: [100, 140, 180], area: true })}</div>
      ${f.peak10_hr ? `<p class="small muted">10 הדקות הכי קשות: מדקה ${Math.round(f.peak10_start_min)}, דופק ממוצע ${f.peak10_hr}.</p>` : ""}` : ""}
    ${f.zones_min ? `<h3>זמן באזורי דופק</h3>${zonesBar(f.zones_min)}
      <div class="legend">${f.zones_min.map((m, i) => `<span><i style="background:${ZONE_COLORS[i]}"></i>${ZONE_HE[i]} ${Math.round(m)} דק׳</span>`).join("")}</div>` : ""}`;
}

export function openActivity(ctx, labelId) {
  const a = ctx.st.activities.find((x) => x.label_id === labelId);
  if (!a) return;
  if (a.data.sport_type === 1005) return openLog(ctx, labelId);
  const sheet = openSheet(`${activityDetail(a)}<button class="primary" id="rateAct">דרג את האימון</button>`);
  sheet.querySelector("#rateAct").onclick = () => openLog(ctx, labelId);
}
