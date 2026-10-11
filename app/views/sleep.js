// Sleep: tonight's plan and deadline, "what if" simulator, last night, trends and morning ratings.
import { bars, lines } from "../charts.js";
import { fmtH, predict } from "../planner.js";
import { SHORTCUT_NAME } from "../config.js";
import { $, DAYS, addDays, dm, esc, hm, nightOfNow, round, toast, weekdayOf } from "../util.js";

const scoreColor = (v) => (v >= 80 ? "var(--night)" : v >= 60 ? "var(--warn)" : "var(--bad)");
const clockH = (iso) => { const [h, m] = iso.slice(11, 16).split(":").map(Number); const x = h + m / 60; return x < 18 ? x + 24 : x; };
const hrv = (e) => ({ Normal: "תקין", Low: "נמוך", "Above normal": "מעל הרגיל", "Below normal": "מתחת לרגיל" }[e] || e || "");

export function renderSleep(app, ctx) {
  const { st } = ctx;
  const p = st.plan;
  const nightOf = nightOfNow();
  const wakeDay = addDays(nightOf, 1);
  const override = st.settings.overrides?.[wakeDay];
  const weekly = st.settings.deadlines?.[String(weekdayOf(wakeDay))] || "";
  const ns = st.nights.slice(-30);
  const last = st.nights.at(-1);
  const d = last?.data || {};
  const seg = (k, c) => (d[k] ? `<span style="width:${d[k]}%;background:var(${c})"></span>` : "");
  const debt = st.insights?.debt;
  const rated = st.ratings.slice(-30);

  app.innerHTML = `
  ${p ? `<section class="card glass">
    <div class="row spread"><h2>הלילה</h2><span class="pill">ציון צפוי <span class="num">${p.predicted_score}</span> <span class="muted num">(${p.score_range[0]}–${p.score_range[1]})</span></span></div>
    <div class="grid2">
      <div class="stat"><span class="eyebrow">למיטה</span><span class="big">${hm(p.lights_out)}</span><span class="small muted">להירדם ~<span class="num">${hm(p.sleep_onset)}</span></span></div>
      <div class="stat"><span class="eyebrow">השעון המעורר</span><span class="big wake">${hm(p.wake)}</span><span class="small muted">${fmtH(p.sleep_h)}</span></div>
    </div>
    <ul class="reasons">${p.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
  </section>` : `<section class="card glass"><h2>עוד אין תוכנית</h2><p class="muted">היא תופיע אחרי החישוב הראשון בענן.</p></section>`}

  <section class="card glass">
    <h3>חייב להיות ער עד (מחר, יום ${DAYS[weekdayOf(wakeDay)]})</h3>
    <input id="deadline" type="time" value="${esc(override ?? weekly)}" aria-label="שעת יעד למחר">
    <div class="grid2"><button id="setDeadline" class="primary">חשב מחדש</button><button id="noDeadline" class="ghost">בלי שעת יעד</button></div>
    <p class="small muted">${override !== undefined ? "שעה מיוחדת למחר." : weekly ? `ברירת המחדל לימי ${DAYS[weekdayOf(wakeDay)]}. אפשר לשנות בהגדרות.` : "אין שעת יעד קבועה ליום הזה."}</p>
    <a class="btn" href="shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}">עדכן שעונים מעוררים באייפון</a>
  </section>

  ${st.model?.coef ? `<section class="card glass"><h3>מה אם…?</h3>
    <p class="small muted">בחר מתי תירדם ומתי תקום, ותראה איזה ציון המודל שלך צופה.</p>
    <div class="grid2"><label class="field">נרדם ב<input id="wiOn" type="time" value="${p ? hm(p.sleep_onset) : "00:30"}"></label>
      <label class="field">קם ב<input id="wiOff" type="time" value="${p ? hm(p.wake) : "08:30"}"></label></div>
    <div class="row spread"><span class="muted" id="wiDur"></span><span class="mid" id="wiScore"></span></div></section>` : ""}

  ${last ? `<section class="card glass">
    <div class="row spread"><h2>אמש</h2><span class="small muted">${dm(last.date)} (לפי יום הקימה)</span></div>
    <div class="row spread"><span class="big" style="color:${scoreColor(d.score)}">${Math.round(d.score)}</span>
      <span class="muted">${fmtH(d.sleep_min / 60)} · <span class="num">${hm(d.onset)}–${hm(d.wake)}</span></span></div>
    <div class="stages" role="img" aria-label="שלבי שינה">${seg("deep_pct", "--deep")}${seg("light_pct", "--light")}${seg("rem_pct", "--rem")}${seg("awake_pct", "--awake")}</div>
    <div class="legend"><span><i style="background:var(--deep)"></i>עמוקה ${d.deep_pct ?? "–"}%</span><span><i style="background:var(--light)"></i>קלה ${d.light_pct ?? "–"}%</span>
      <span><i style="background:var(--rem)"></i>REM ${d.rem_pct ?? "–"}%</span><span><i style="background:var(--awake)"></i>ער ${d.awake_min ?? "–"} דק׳</span></div>
    <div class="grid3">
      <div class="tile"><span class="eyebrow">HRV</span><b class="mid">${d.hrv ?? "–"}</b><span class="small muted">${esc(hrv(d.hrv_eval))}</span></div>
      <div class="tile"><span class="eyebrow">דופק מנוחה</span><b class="mid">${d.rhr ?? "–"}</b><span class="small muted">${d.sleep_hr ? `בשינה ${d.sleep_hr}` : ""}</span></div>
      <div class="tile"><span class="eyebrow">התעוררויות</span><b class="mid">${d.awake_count ?? 0}</b></div>
    </div></section>` : ""}

  ${ns.length ? `<section class="card glass"><div class="row spread"><h3>ציון שינה, 30 לילות</h3><span class="small muted">ממוצע ${round(ns.reduce((a, n) => a + n.data.score, 0) / ns.length)}</span></div>
    <div class="chart">${bars(ns.map((n) => ({ label: dm(n.date), value: Math.round(n.data.score), color: scoreColor(n.data.score) })), { ticks: [50, 80, 100], max: 100 })}</div></section>
  <section class="card glass"><h3>שעות שינה ושעת הירדמות</h3>
    <div class="chart">${lines([{ values: ns.map((n) => +(n.data.sleep_min / 60).toFixed(2)), color: "var(--night)" }], ns.map((n) => dm(n.date)), { ticks: [6, 7.5, 8.5, 10], area: true })}</div>
    <p class="small muted">הטווח הטוב שלך: 7.5–8.5 שעות.</p>
    <div class="chart">${lines([{ values: ns.map((n) => n.data.onset ? +clockH(n.data.onset).toFixed(2) : null), color: "var(--accent)" }], ns.map((n) => dm(n.date)), { ticks: [23, 24, 25, 26, 27] })}</div>
    <p class="small muted">שעת הירדמות (24 = חצות, 26 = 02:00). קו שטוח יותר = סדירות טובה יותר.</p></section>` : ""}

  ${debt ? `<section class="card glass"><div class="row spread"><h3>חוב שינה השבוע</h3><span><b class="mid">${debt.hours > 0 ? round(debt.hours, 1) : 0}</b> <span class="muted">שעות</span></span></div>
    <div class="chart">${bars(debt.per_night.map((x) => ({ label: dm(x.date), value: x.h, color: x.h >= 7.5 ? "var(--good)" : x.h >= 6.5 ? "var(--warn)" : "var(--bad)" })), { ticks: [6, 8, 10], max: 11, height: 120, unit: " שע׳" })}</div>
    ${debt.advice.map((a) => `<p class="small muted">${esc(a)}</p>`).join("")}</section>` : ""}

  ${rated.length ? `<section class="card glass"><h3>הדירוגים שלך בבוקר</h3>
    <div class="chart">${lines([{ values: rated.map((r) => Number(r.slept)), color: "var(--night)" }, { values: rated.map((r) => Number(r.woke)), color: "var(--accent)" }], rated.map((r) => dm(r.date)), { ticks: [1, 5, 10], min: 1, max: 10 })}</div>
    <div class="legend"><span><i style="background:var(--night)"></i>איך ישנתי</span><span><i style="background:var(--accent)"></i>איך קמתי</span></div>
    <p class="small muted">${rated.length} דירוגים. ${rated.length >= 28 ? "המנוע כבר לומד מהם." : `מ-28 דירוגים הם יתחילו להשפיע על ההמלצות (עוד ${28 - rated.length}).`}</p></section>` : ""}
  `;

  const setOverride = async (val) => {
    st.settings.overrides = { ...(st.settings.overrides || {}), [wakeDay]: val };
    await ctx.db.saveSettings(st.settings);
    st.plan = await ctx.currentPlan();
    renderSleep(app, ctx);
    toast("התוכנית חושבה מחדש. לחץ 'עדכן שעונים' כדי לעדכן את האייפון.");
  };
  $("#setDeadline").onclick = () => setOverride($("#deadline").value || null).catch((e) => toast(e.message));
  $("#noDeadline").onclick = () => setOverride(null).catch((e) => toast(e.message));

  const on = $("#wiOn"), off = $("#wiOff");
  if (on) {
    const calc = () => {
      if (!on.value || !off.value) return;
      const [h1, m1] = on.value.split(":").map(Number), [h2, m2] = off.value.split(":").map(Number);
      let o = h1 + m1 / 60; if (o < 18) o += 24;
      let w = h2 + m2 / 60 + 24; if (w <= o) w += 24;
      const dur = w - o;
      const s = predict(st.model, dur, o, Math.abs(o - st.model.usual_onset));
      $("#wiDur").textContent = `${fmtH(dur)} שינה`;
      const v = Math.round(Math.min(Math.max(s, 0), 100));
      $("#wiScore").textContent = v;
      $("#wiScore").style.color = scoreColor(v);
    };
    on.oninput = off.oninput = calc;
    calc();
  }
}
