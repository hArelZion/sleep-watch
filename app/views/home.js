// "Today": readiness, training advice with the best hours, tonight, live numbers, next event,
// morning questionnaire, warnings, nap/caffeine/debt, streaks, weekly report and a tip.
import { ring } from "../charts.js";
import { tipsForNow, EVIDENCE_HE } from "../tips.js";
import { $, ICON, bindSlider, dm, esc, fmtDur, greeting, hm, isoDate, localIso, round, slider, sportIcon, toast } from "../util.js";
import { fmtH } from "../planner.js";
import { scheduleSheet } from "./calendar.js";

const LEVEL_COLOR = ["var(--night)", "var(--sport)", "var(--warn)", "var(--bad)"];
const readyColor = (s) => (s >= 80 ? "var(--good)" : s >= 65 ? "var(--sport)" : s >= 50 ? "var(--warn)" : "var(--bad)");
const PART_HE = { sleep: "שינה", hrv: "HRV", rhr: "דופק מנוחה", load: "עומס" };

export function renderHome(app, ctx) {
  const { st } = ctx;
  const ins = st.insights || {};
  const today = isoDate(new Date());
  const fresh = ins.date === today;
  const r = ins.readiness, t = ins.training, p = st.plan;
  const live = st.live || {};
  const steps = live.steps ?? ins.today?.steps, cals = live.calories ?? ins.today?.calories;
  const calGoal = st.settings.calorie_goal, stepsGoal = st.settings.steps_goal;
  const next = st.events.find((e) => new Date(e.starts_at) > new Date());
  const lastAct = st.activities.at(-1);
  const lastEnd = lastAct?.data?.end_local ? new Date(lastAct.data.end_local) : null;
  const tips = tipsForNow(new Date(), { nextEvent: next, lastWorkoutEnd: lastEnd, hidden: st.settings.hidden_tips });
  const tip = tips.length ? tips[new Date().getDate() % tips.length] : null;
  const rated = st.ratings.some((x) => x.date === today);
  const h = new Date().getHours();
  const unlogged = st.activities.filter((a) => a.date >= isoDate(new Date(Date.now() - 2 * 864e5)) && !st.logs[a.label_id]);

  app.innerHTML = `
  <section class="card glass">
    <div class="row spread"><div><span class="eyebrow">${greeting()}</span><h1>${fresh && r ? r.label : "היום"}</h1></div>
      ${!fresh ? `<span class="pill warn">מחכה לנתונים של היום</span>` : ""}</div>
    ${r ? `<div class="ring-wrap">${ring(r.score / 100, readyColor(r.score), `<div><b>${r.score}</b><div class="small muted">מוכנות</div></div>`)}
      <div class="bars">${Object.entries(r.parts).map(([k, v]) => `<div class="bar"><span>${PART_HE[k] ?? k}</span><span class="t"><i style="width:${v}%;background:${readyColor(v)}"></i></span><span class="num">${v}</span></div>`).join("")}</div></div>
      ${r.notes.length ? `<ul class="reasons">${r.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}` : `<p class="muted">ציון המוכנות יופיע אחרי החישוב הראשון בענן.</p>`}
  </section>

  ${!rated && h >= 4 && h < 16 ? morningCard(st) : ""}

  ${(ins.warnings || []).map((w) => `<section class="card glass" style="border-color:var(--${w.level === "serious" ? "bad" : "warn"})">
    <div class="row"><span class="pill ${w.level === "serious" ? "bad" : "warn"}">אזהרה</span><h3>${esc(w.title)}</h3></div><p>${esc(w.text)}</p></section>`).join("")}

  ${t ? `<section class="card glass">
    <div class="row spread"><h2>אימון היום</h2><span class="pill lvl${t.level}">${t.level_he}</span></div>
    <ul class="reasons">${t.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <div class="stack">${t.ideas.map((x) => `<div class="tile">${esc(x)}</div>`).join("")}</div>
    ${(ins.windows || []).length ? `<div class="divider"></div><span class="eyebrow">השעות הכי טובות היום</span>
      <div class="grid3">${ins.windows.map((w) => `<button class="tile" data-window="${w.start}" style="text-align:center">
        <b class="mid">${hm(w.start)}</b><span class="small muted">${w.feels != null ? `<span class="num">${Math.round(w.feels)}°</span>` : ""}${w.wind != null ? ` · רוח <span class="num">${Math.round(w.wind)}</span>` : ""}</span></button>`).join("")}</div>
      <p class="small muted">לחץ על שעה כדי לקבוע אימון ביומן.</p>` : ""}
  </section>` : ""}

  ${p ? `<section class="card glass">
    <div class="row spread"><h2>הלילה</h2><span class="pill">ציון צפוי <span class="num">${p.predicted_score}</span></span></div>
    <div class="grid2">
      <div class="stat"><span class="eyebrow">למיטה</span><span class="big">${hm(p.lights_out)}</span><span class="small muted">תזכורת <span class="num">${hm(p.bed_reminder)}</span></span></div>
      <div class="stat"><span class="eyebrow">השעון המעורר</span><span class="big wake">${hm(p.wake)}</span><span class="small muted">${fmtH(p.sleep_h)} שינה</span></div>
    </div>
    <button class="ghost" data-go="sleep">שינוי שעת יעד ופרטים</button>
  </section>` : ""}

  <section class="card glass">
    <div class="row spread"><h2>עד עכשיו היום</h2><span class="small muted">${live.updated ? "מתעדכן מהשעון" : ""}</span></div>
    <div class="grid3">
      <div class="tile">${calGoal ? ring(Math.min((cals ?? 0) / calGoal, 1), "var(--accent)", `<b style="font-size:20px">${round(cals)}</b>`, 78) : `<b class="mid">${round(cals)}</b>`}<span class="small muted">קלוריות${calGoal ? ` / ${calGoal}` : ""}</span></div>
      <div class="tile">${stepsGoal ? ring(Math.min((steps ?? 0) / stepsGoal, 1), "var(--sport)", `<b style="font-size:16px">${round(steps)}</b>`, 78) : `<b class="mid">${round(steps)}</b>`}<span class="small muted">צעדים</span></div>
      <div class="tile"><b class="mid">${round(live.stress ?? ins.today?.stress)}</b><span class="small muted">לחץ ממוצע</span><b class="mid" style="font-size:18px">${fmtDur(live.exercise_min)}</b><span class="small muted">אימון</span></div>
    </div>
  </section>

  ${unlogged.length ? `<section class="card glass"><h3>איך היה?</h3>${unlogged.map((a) => `<button class="item" data-log="${a.label_id}">
    <span class="dot ${a.data.sport_type === 1005 ? "tennis" : "sport"}">${sportIcon(a.data.sport_type)}</span>
    <span><b>${esc(a.data.sport_he)}</b><br><span class="small muted">${dm(a.date)} · ${hm(a.data.start_local)} · ${round(a.data.calories)} קלוריות</span></span><span class="small muted">דרג ›</span></button>`).join("")}</section>` : ""}

  ${next ? `<section class="card glass"><div class="row spread"><h3>הבא ביומן</h3><button class="small ghost" data-go="calendar">ליומן</button></div>
    <div class="row"><span class="dot ${next.kind === "tennis" ? "tennis" : "sport"}">${next.kind === "tennis" ? ICON.tennis : ICON.sport}</span>
    <div><b>${esc(next.title)}</b>${next.level ? ` <span class="pill">${esc(next.level)}</span>` : ""}<br>
    <span class="muted small">${dm(localIso(new Date(next.starts_at)))} · ${hm(localIso(new Date(next.starts_at)))}</span></div></div></section>` : ""}

  ${smallCards(ins, st)}

  ${tip ? `<section class="card glass"><div class="row spread"><span class="eyebrow">טיפ לעכשיו</span><span class="evidence ${tip.evidence}">${EVIDENCE_HE[tip.evidence]}</span></div>
    <h3>${esc(tip.title)}</h3><p class="muted">${esc(tip.text)}</p><div class="row spread"><span class="small muted">${esc(tip.source)}</span><button class="small ghost" data-go="tips">כל הטיפים</button></div></section>` : ""}

  ${ins.weekly?.lines?.length ? `<section class="card glass"><details ${new Date().getDay() === 0 ? "open" : ""}><summary><div class="row spread"><h3>הדוח השבועי</h3><span class="small muted">פתח ›</span></div></summary>
    <div class="stack" style="margin-top:10px">${ins.weekly.lines.map((l) => `<p>${esc(l)}</p>`).join("")}${ins.weekly.tip ? `<p class="muted">${esc(ins.weekly.tip)}</p>` : ""}</div></details></section>` : ""}
  `;

  app.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => ctx.show(b.dataset.go)));
  app.querySelectorAll("[data-window]").forEach((b) => (b.onclick = () => scheduleSheet(ctx, { start: b.dataset.window, level: t?.level_he })));
  app.querySelectorAll("[data-log]").forEach((b) => (b.onclick = async () => (await import("./tennis.js")).openLog(ctx, b.dataset.log)));
  bindMorning(app, ctx);
}

function smallCards(ins, st) {
  const out = [];
  if (ins.nap) out.push(`<div class="tile"><span class="eyebrow">נמנום</span><b>${hm(ins.nap.start)}–${hm(ins.nap.latest)}</b><span class="small muted">20 דקות</span></div>`);
  if (ins.caffeine_cutoff) out.push(`<div class="tile"><span class="eyebrow">קפה אחרון</span><b class="mid">${hm(ins.caffeine_cutoff)}</b></div>`);
  if (ins.debt) out.push(`<div class="tile"><span class="eyebrow">חוב שינה השבוע</span><b class="mid">${ins.debt.hours > 0 ? round(ins.debt.hours, 1) : 0}</b><span class="small muted">שעות</span></div>`);
  const s = ins.streaks || {};
  if (s.bedtime) out.push(`<div class="tile"><span class="eyebrow">רצף שעת שינה קבועה</span><b class="mid">${s.bedtime}</b><span class="small muted">ימים</span></div>`);
  if (s.steps) out.push(`<div class="tile"><span class="eyebrow">רצף יעד צעדים</span><b class="mid">${s.steps}</b><span class="small muted">ימים</span></div>`);
  if (!out.length) return "";
  return `<section class="card glass"><div class="grid2">${out.join("")}</div>${ins.debt?.advice?.length && ins.debt.hours > 2 ? `<p class="small muted">${esc(ins.debt.advice[1] ?? "")}</p>` : ""}</section>`;
}

function morningCard(st) {
  const today = isoDate(new Date());
  const last = st.nights.at(-1);
  const score = last && last.date === today ? `ציון COROS: <b class="num">${Math.round(last.data.score)}</b>` : "ציון COROS עוד לא הגיע";
  return `<section class="card glass" id="morning" aria-label="שאלון בוקר">
    <div class="row spread"><h2>איך ישנת?</h2><span class="small muted">${score}</span></div>
    ${slider("slept", "איך ישנת?")}${slider("woke", "איך קמת?")}
    <label class="field">הערה (לא חובה)<textarea id="note" placeholder="קפה מאוחר, אימון בערב, רעש, לחץ…"></textarea></label>
    <button class="primary" id="saveRating">שמור</button></section>`;
}
function bindMorning(app, ctx) {
  const card = $("#morning", app);
  if (!card) return;
  bindSlider(card, "slept"); bindSlider(card, "woke");
  $("#saveRating", card).onclick = async () => {
    const r = { date: isoDate(new Date()), slept: Number($("#slept").value), woke: Number($("#woke").value), note: $("#note").value.trim() || null };
    try { await ctx.db.saveRating(r); ctx.st.ratings.push(r); card.remove(); toast("נשמר. המנוע לומד ממך."); } catch (e) { toast(e.message); }
  };
}
