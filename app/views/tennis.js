// Tennis: match log, what helps you play well, next-match preparation, session details with heart
// rate, zones, effort and a court movement map, and long-term trends.
import { bars, courtMap, lines } from "../charts.js";
import { $, ICON, addDays, bindSlider, dm, esc, fmtDur, hm, isoDate, localIso, openSheet, closeSheet, round, slider, toast } from "../util.js";
import { activityDetail } from "./fitness.js";

export function renderTennis(app, ctx) {
  const { st } = ctx;
  const t = st.insights?.tennis || {};
  const sessions = st.activities.filter((a) => a.data.sport_type === 1005);
  const logged = sessions.map((s) => st.logs[s.label_id]).filter((l) => l?.result);
  const wins = logged.filter((l) => l.result === "win").length;
  const month = isoDate(new Date()).slice(0, 7);
  const thisMonth = sessions.filter((s) => s.date.startsWith(month));
  const next = st.events.find((e) => e.kind === "tennis" && new Date(e.starts_at) > new Date());
  const evening = eveningEffect(sessions, st.nights);
  const trend = t.trend || [];

  app.innerHTML = `
  <section class="card glass"><div class="row spread"><h2>טניס</h2><button class="primary small" id="addMatch">קבע משחק</button></div>
    <div class="grid3">
      <div class="tile"><span class="eyebrow">החודש</span><b class="mid">${thisMonth.length}</b><span class="small muted">משחקים</span></div>
      <div class="tile"><span class="eyebrow">סה"כ</span><b class="mid">${sessions.length}</b><span class="small muted">${round(sessions.reduce((a, s) => a + (s.data.duration_s || 0), 0) / 3600)} שעות</span></div>
      <div class="tile"><span class="eyebrow">ניצחונות</span><b class="mid">${logged.length ? Math.round((wins / logged.length) * 100) + "%" : "–"}</b><span class="small muted">${logged.length} מסומנים</span></div>
    </div></section>

  ${next ? prepCard(next, st) : ""}

  <section class="card glass"><h3>מה למדנו עליך</h3>
    <ul class="reasons">
      ${evening ? `<li>${esc(evening)}</li>` : ""}
      ${(t.insights || []).map((x) => `<li>${esc(x)}</li>`).join("")}
      <li>אחרי טניס ה-HRV ודופק המנוחה שלך חוזרים לרגיל כבר למחרת. אתה מתאושש מהר, ואפשר לשחק יומיים ברצף כשהמוכנות גבוהה.</li>
    </ul></section>

  ${trend.length >= 2 ? `<section class="card glass"><h3>דופק ממוצע במשחק לפי חודש</h3>
    <div class="chart">${lines([{ values: trend.map((m) => m.avg_hr), color: "var(--accent)" }], trend.map((m) => m.month.slice(5) + "/" + m.month.slice(2, 4)), { ticks: [120, 140, 160] })}</div>
    <p class="small muted">באותה עצימות משחק, דופק שיורד לאורך זמן אומר שהכושר שלך השתפר.</p>
    <div class="chart">${bars(trend.map((m) => ({ label: m.month.slice(5) + "/" + m.month.slice(2, 4), value: m.sessions, color: "var(--sport)" })), { ticks: [5, 10], height: 110, unit: " משחקים" })}</div></section>` : ""}

  <section class="card glass"><div class="row spread"><h2>משחקים</h2><span class="small muted">לחץ לפרטים ולסימון תוצאה</span></div>
    <div class="list">${[...sessions].reverse().map((s) => { const l = st.logs[s.label_id] || {}; return `<button class="item" data-log="${s.label_id}">
      <span class="dot tennis">${ICON.tennis}</span>
      <span><b>${dm(s.date)} · ${hm(s.data.start_local)}</b> ${l.result ? `<span class="pill ${l.result === "win" ? "good" : "bad"}">${l.result === "win" ? "ניצחון" : "הפסד"}${l.score ? " " + esc(l.score) : ""}</span>` : ""}<br>
      <span class="small muted">${fmtDur((s.data.duration_s || 0) / 60)} · דופק ${s.data.avg_hr} · ${round(s.data.calories)} קל׳${s.data.fit?.bursts != null ? ` · ${s.data.fit.bursts} ספרינטים` : ""}</span></span>
      <span class="small muted">${l.rating ? l.rating + "/10" : "›"}</span></button>`; }).join("")}</div></section>`;

  app.querySelectorAll("[data-log]").forEach((b) => (b.onclick = () => openLog(ctx, b.dataset.log)));
  $("#addMatch").onclick = async () => (await import("./calendar.js")).eventSheet(ctx, { kind: "tennis", title: "טניס" });
}

/** Sleep after evening tennis (ending 18:00 or later) vs other nights. */
function eveningEffect(sessions, nights) {
  const byDate = Object.fromEntries(nights.map((n) => [n.date, n.data.score]));
  const evenings = sessions.filter((s) => Number((s.data.end_local || "").slice(11, 13)) >= 18)
    .map((s) => byDate[addDays(s.date, 1)]).filter((v) => v != null);
  if (evenings.length < 4) return null;
  const all = nights.map((n) => n.data.score);
  const a = evenings.reduce((x, y) => x + y, 0) / evenings.length, b = all.reduce((x, y) => x + y, 0) / all.length;
  return `אחרי טניס בערב ציון השינה הממוצע שלך ${Math.round(a)}, לעומת ${Math.round(b)} בכל הלילות (${evenings.length} ערבים).`;
}

function prepCard(e, st) {
  const start = new Date(e.starts_at);
  const meal = new Date(start.getTime() - 150 * 60000);
  const kg = st.settings.profile?.weight_kg;
  const water = kg ? `${Math.round(kg * 5 / 50) * 50}–${Math.round(kg * 7 / 50) * 50} מ"ל` : "כ-500 מ\"ל";
  const w = (st.insights?.weather || []).find((h) => h.time.slice(0, 13) === localIso(start).slice(0, 13));
  return `<section class="card glass"><div class="row spread"><h3>הכנה למשחק הבא</h3><span class="pill">${dm(localIso(start))} · ${hm(localIso(start))}</span></div>
    ${w ? `<p class="muted">מזג אוויר במגרש: מורגש ${Math.round(w.feels)}°, רוח ${Math.round(w.wind)} קמ"ש${w.rain >= 30 ? `, סיכוי לגשם ${w.rain}%` : ""}.${w.wind > 20 ? " רוח חזקה: כדאי לשחק עם יותר ספין ומרווח מהקווים." : ""}</p>` : ""}
    <div class="stack">
      <div class="tile"><b>לישון טוב בלילה שלפני</b><span class="small muted">התוכנית בלשונית "שינה" מתחשבת בשעת המשחק אם תקבע אותה כשעת יעד.</span></div>
      <div class="tile"><b>לאכול ב-${hm(localIso(meal))}</b><span class="small muted">ארוחה עם פחמימות, מעט שומן וסיבים, 2–3 שעות לפני.</span></div>
      <div class="tile"><b>לשתות ${water} עד 4 שעות לפני</b><span class="small muted">ולהביא מים ומלחים למגרש${w?.feels > 28 ? ", במיוחד בחום של היום" : ""}.</span></div>
      <div class="tile"><b>חימום 10 דקות</b><span class="small muted">ריצה קלה, מתיחות דינמיות, ואז חבטות קצרות מהרשת.</span></div>
    </div></section>`;
}

export function openLog(ctx, labelId) {
  const { st, db } = ctx;
  const a = st.activities.find((x) => x.label_id === labelId);
  if (!a) return;
  const tennis = a.data.sport_type === 1005;
  const l = st.logs[labelId] || {};
  const f = a.data.fit || {};
  const chip = (group, value, label, cur) => `<button type="button" class="chip" data-g="${group}" data-v="${value}" aria-pressed="${cur === value}">${label}</button>`;
  const sheet = openSheet(`
    ${activityDetail(a)}
    ${tennis && f.court_xy?.length ? `<h3>איפה זזת במגרש</h3><div class="row" style="align-items:start;flex-wrap:nowrap">${courtMap(f.court_xy)}
      <div class="stack" style="flex:1"><div class="tile"><span class="eyebrow">ספרינטים</span><b class="mid">${f.bursts ?? "–"}</b></div>
      <div class="tile"><span class="eyebrow">מהירות מקס׳</span><b class="mid">${f.max_speed_kmh ?? "–"}</b><span class="small muted">קמ"ש</span></div>
      <div class="tile"><span class="eyebrow">מרחק</span><b class="mid">${round(a.data.distance_km, 1)}</b><span class="small muted">ק"מ</span></div></div></div>
      <p class="small muted">ה-GPS בשעון מדויק לכמה מטרים, אז המפה מראה בערך איפה בילית הכי הרבה זמן.</p>` : ""}
    <div class="divider"></div>
    <h3>${tennis ? "איך היה המשחק?" : "איך היה האימון?"}</h3>
    ${tennis ? `<div class="chips">${chip("type", "match", "משחק", l.type)}${chip("type", "practice", "אימון", l.type)}${chip("type", "drill", "תרגול", l.type)}</div>
      <div class="chips">${chip("format", "singles", "יחידים", l.format)}${chip("format", "doubles", "זוגות", l.format)}</div>
      <div class="chips">${chip("result", "win", "ניצחון", l.result)}${chip("result", "loss", "הפסד", l.result)}${chip("result", "none", "בלי תוצאה", l.result)}</div>
      <div class="grid2"><label class="field">תוצאה<input id="lgScore" placeholder="6-4 3-6 10-8" value="${esc(l.score)}"></label>
        <label class="field">עם מי<input id="lgPartner" value="${esc(l.partner)}"></label></div>` : ""}
    ${slider("lgRating", tennis ? "איך שיחקתי (1–10)" : "איך הרגשתי (1–10)", l.rating ?? 7)}
    <label class="field">הערות<textarea id="lgNotes" placeholder="${tennis ? "מה עבד, מה לא, איך הגוף הרגיש" : "איך הגוף הרגיש"}">${esc(l.notes)}</textarea></label>
    <button class="primary" id="lgSave">שמור</button>`);
  bindSlider(sheet, "lgRating");
  const vals = { type: l.type, format: l.format, result: l.result };
  sheet.querySelectorAll(".chip").forEach((c) => (c.onclick = () => {
    vals[c.dataset.g] = c.dataset.v;
    sheet.querySelectorAll(`.chip[data-g="${c.dataset.g}"]`).forEach((x) => x.setAttribute("aria-pressed", String(x === c)));
  }));
  $("#lgSave", sheet).onclick = async () => {
    const data = { ...vals, rating: Number($("#lgRating", sheet).value), notes: $("#lgNotes", sheet).value.trim() || null,
      score: $("#lgScore", sheet)?.value.trim() || null, partner: $("#lgPartner", sheet)?.value.trim() || null, logged_at: new Date().toISOString() };
    try { await db.saveLog(labelId, data); st.logs[labelId] = data; closeSheet(); ctx.rerender(); toast("נשמר"); } catch (e) { toast(e.message); }
  };
}
