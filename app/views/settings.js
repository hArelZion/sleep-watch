// Settings: notifications, alarms, wake deadlines, goals, sleep calculation, profile, iPhone links.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";
import { $, DAYS, esc, num, sw, toast } from "../util.js";

const N = { bed_prep: true, bed_prep_min: 60, bedtime: true, caffeine: true, training: true, training_time: "08:30",
  morning: true, events: true, workout_log: true, warnings: true, weekly: true, weekly_time: "09:00",
  calories: true, calories_time: "20:00", nap: true };

export function renderSettings(app, ctx) {
  const { st, db } = ctx;
  const s = st.settings;
  const n = { ...N, ...(s.notify || {}) };
  const field = (id, label, v, attrs = "") => `<label class="field">${label}<input id="${id}" value="${esc(v ?? "")}" ${attrs}></label>`;
  const days = [0, 1, 2, 3, 4, 5, 6].map((wd) => `<div class="row spread" style="flex-wrap:nowrap"><span>${DAYS[wd]}</span>
    <input type="time" id="dl${wd}" value="${esc(s.deadlines?.[String(wd)] || "")}" aria-label="שעת יעד ליום ${DAYS[wd]}" style="max-width:130px"></div>`).join("");
  const feed = s.feed_token ? `${SUPABASE_URL}/functions/v1/ics?token=${s.feed_token}` : "";

  app.innerHTML = `
  <section class="card glass"><h2>התראות לטלפון</h2>
    <button class="primary" id="pushOn">הפעל התראות במכשיר הזה</button>
    <button class="ghost" id="pushTest">שלח התראת בדיקה</button>
    <div class="divider"></div>
    ${sw("nBedPrep", "להתחיל להתארגן לשינה", n.bed_prep)}
    ${field("nBedPrepMin", "כמה דקות לפני שעת המיטה", n.bed_prep_min, 'type="number" min="10" max="180" step="5" inputmode="numeric"')}
    ${sw("nBedtime", "הגיע הזמן לישון", n.bedtime)}
    ${sw("nCaffeine", "קפה אחרון להיום", n.caffeine)}
    ${sw("nTraining", "המלצת האימון של היום", n.training)}
    ${field("nTrainingTime", "באיזו שעה", n.training_time, 'type="time"')}
    ${sw("nMorning", "שאלון בוקר אחרי השעון המעורר", n.morning)}
    ${sw("nEvents", "תזכורות לפני משחקים ואימונים", n.events)}
    ${sw("nLog", "\"איך היה?\" אחרי אימון", n.workout_log)}
    ${sw("nWarnings", "אזהרות (מחלה, עומס)", n.warnings)}
    ${sw("nNap", "נמנום מומלץ אחרי לילה קצר", n.nap)}
    ${sw("nCalories", "יעד הקלוריות בערב", n.calories)}
    ${field("nCaloriesTime", "באיזו שעה", n.calories_time, 'type="time"')}
    ${sw("nWeekly", "דוח שבועי ביום ראשון", n.weekly)}
  </section>

  <section class="card glass"><h2>שעונים מעוררים באייפון</h2>
    ${sw("alWake", "שעון מעורר לקימה", s.alarms.wake)}
    ${sw("alBed", "שעון \"הולכים לישון\"", s.alarms.bed)}
    <p class="small muted">השעונים נוצרים בשעון של האייפון דרך הקיצור "שעוני שינה" (הוראות ב-SHORTCUTS.md).</p></section>

  <section class="card glass"><h2>חייב להיות ער עד (קבוע)</h2><p class="small muted">לפי יום הקימה. השאר ריק ליום בלי שעת יעד.</p>
    <div class="stack">${days}</div></section>

  <section class="card glass"><h2>מטרות</h2><div class="grid2">
    ${field("gCal", "קלוריות ביום", s.calorie_goal, 'type="number" min="100" max="3000" step="50" inputmode="numeric"')}
    ${field("gSteps", "צעדים ביום", s.steps_goal, 'type="number" min="1000" max="40000" step="500" inputmode="numeric"')}
    ${field("gWorkout", "משך אימון רגיל (שעות)", s.workout_h, 'type="number" min="0.5" max="4" step="0.25" inputmode="decimal"')}
  </div></section>

  <section class="card glass"><h2>חישוב השינה</h2><div class="grid2">
    ${field("prep", "זמן התארגנות בבוקר (דק׳)", s.prep_min, 'type="number" min="0" max="120" inputmode="numeric"')}
    ${field("lat", "זמן הירדמות (דק׳)", s.latency_min, 'type="number" min="0" max="90" inputmode="numeric"')}
    ${field("wind", "שעון \"לישון\" לפני המיטה (דק׳)", s.wind_down_min, 'type="number" min="0" max="120" inputmode="numeric"')}
    ${field("minS", "מינימום שינה (שעות)", s.min_sleep_h, 'type="number" min="5" max="9" step="0.25" inputmode="decimal"')}
    ${field("maxS", "מקסימום שינה (שעות)", s.max_sleep_h, 'type="number" min="6" max="11" step="0.25" inputmode="decimal"')}
  </div></section>

  <section class="card glass"><h2>פרופיל</h2><div class="grid2">
    ${field("pAge", "גיל", s.profile?.age, 'type="number" min="10" max="100" inputmode="numeric"')}
    ${field("pW", 'משקל (ק"ג)', s.profile?.weight_kg, 'type="number" min="30" max="250" inputmode="decimal"')}
    ${field("pH", 'גובה (ס"מ)', s.profile?.height_cm, 'type="number" min="100" max="230" inputmode="numeric"')}
  </div></section>

  <button class="primary" id="save">שמור הגדרות</button>

  <section class="card glass"><h2>חיבורים לאייפון</h2>
    <p class="small muted">קוד סודי אחד משמש את הקיצור לשעונים, את היומן ואת הווידג'ט. הוא נותן גישה רק לשעות ולתוכנית, לא לשאר הנתונים.</p>
    ${field("feedToken", "קוד סודי", s.feed_token || "", 'readonly placeholder="עוד לא נוצר"')}
    <div class="row"><button id="newToken">${s.feed_token ? "צור קוד חדש" : "צור קוד"}</button><button id="copyToken" class="ghost">העתק קוד</button></div>
    ${feed ? `${field("icsUrl", "כתובת יומן לאייפון (הגדרות ← יומן ← חשבונות ← הוסף לוח שנה מנוי)", feed, "readonly")}
      <button id="copyIcs" class="ghost">העתק כתובת יומן</button>` : ""}
    ${field("anonKey", "מפתח ציבורי (לקיצור ולווידג'ט)", SUPABASE_ANON_KEY, "readonly")}
  </section>

  <section class="card glass"><div class="row spread"><span class="small muted">המודל: ${st.model.n ?? 0} לילות · ${st.model.rated_nights ?? 0} דירוגי בוקר<br>עודכן ${esc(st.insights?.updated || st.model.updated || "—")}</span>
    <button id="signOut" class="ghost">התנתק</button></div></section>`;

  const chk = (id) => $(`#${id}`).checked;
  $("#save").onclick = async () => {
    s.notify = { bed_prep: chk("nBedPrep"), bed_prep_min: num($("#nBedPrepMin").value) ?? 60, bedtime: chk("nBedtime"), caffeine: chk("nCaffeine"),
      training: chk("nTraining"), training_time: $("#nTrainingTime").value || "08:30", morning: chk("nMorning"), events: chk("nEvents"),
      workout_log: chk("nLog"), warnings: chk("nWarnings"), nap: chk("nNap"), calories: chk("nCalories"),
      calories_time: $("#nCaloriesTime").value || "20:00", weekly: chk("nWeekly"), weekly_time: n.weekly_time };
    s.alarms = { ...s.alarms, wake: chk("alWake"), bed: chk("alBed"), morning: chk("nMorning") };
    s.deadlines = {};
    for (let wd = 0; wd < 7; wd++) { const v = $(`#dl${wd}`).value; if (v) s.deadlines[String(wd)] = v; }
    s.calorie_goal = num($("#gCal").value); s.steps_goal = num($("#gSteps").value); s.workout_h = num($("#gWorkout").value) ?? 1.5;
    s.prep_min = num($("#prep").value) ?? 0; s.latency_min = num($("#lat").value) ?? 15; s.wind_down_min = num($("#wind").value) ?? 30;
    s.min_sleep_h = num($("#minS").value) ?? 7; s.max_sleep_h = num($("#maxS").value) ?? 9;
    if (s.min_sleep_h > s.max_sleep_h) return toast("המינימום גדול מהמקסימום. תקן ונסה שוב.");
    s.profile = { ...s.profile, age: num($("#pAge").value), weight_kg: num($("#pW").value), height_cm: num($("#pH").value) };
    try { await db.saveSettings(s); st.plan = await ctx.currentPlan(); toast("ההגדרות נשמרו"); } catch (e) { toast(e.message); }
  };
  $("#pushOn").onclick = async () => { try { await ctx.enablePush(); toast("ההתראות הופעלו במכשיר הזה"); } catch (e) { toast(e.message); } };
  $("#pushTest").onclick = async () => { try { const r = await db.invoke("notify", { query: "?test=1" }); toast(r.demo ? "מצב הדגמה" : r.sent ? "נשלחה התראת בדיקה" : "אין מכשיר רשום. הפעל התראות קודם."); } catch (e) { toast(e.message); } };
  $("#newToken").onclick = async () => {
    s.feed_token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
    try { await db.saveSettings(s); renderSettings(app, ctx); toast("נוצר קוד חדש. עדכן אותו גם בקיצור ובווידג'ט."); } catch (e) { toast(e.message); }
  };
  const copy = async (id) => { const el = $(`#${id}`); try { await navigator.clipboard.writeText(el.value); toast("הועתק"); } catch { el.select(); toast("סמן והעתק ידנית"); } };
  $("#copyToken").onclick = () => copy("feedToken");
  $("#copyIcs")?.addEventListener("click", () => copy("icsUrl"));
  $("#signOut").onclick = async () => { await db.signOut(); location.reload(); };
}
