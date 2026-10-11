// App shell: sign-in, loading data, tabs, refresh, live updates and notifications.
import { db, demo } from "./data.js";
import { planFromState } from "./planner.js";
import { VAPID_PUBLIC_KEY } from "./config.js";
import { $, $$, addDays, ago, esc, isoDate, nightOfNow, num, toast, weekdayOf } from "./util.js";
import { renderHome } from "./views/home.js";
import { renderSleep } from "./views/sleep.js";
import { renderFitness } from "./views/fitness.js";
import { renderTennis, openLog } from "./views/tennis.js";
import { renderCalendar } from "./views/calendar.js";
import { renderSettings } from "./views/settings.js";
import { renderTips } from "./views/tips.js";

const app = $("#app");
export const DEFAULT_SETTINGS = {
  alarms: { wake: true, bed: true, morning: true },
  notify: {}, deadlines: {}, overrides: {},
  prep_min: 0, latency_min: 15, wind_down_min: 30, min_sleep_h: 7, max_sleep_h: 9,
  calorie_goal: null, steps_goal: 8000, workout_h: 1.5, profile: {}, onboarded: false, hidden_tips: [],
};

export const st = { settings: null, model: {}, insights: {}, live: {}, nights: [], activities: [], fitness: [],
  ratings: [], logs: {}, events: [], plan: null, tab: "home" };

const TITLES = { home: "היום", sleep: "שינה", fitness: "כושר", tennis: "טניס", calendar: "יומן", settings: "הגדרות", tips: "טיפים" };
const VIEWS = { home: renderHome, sleep: renderSleep, fitness: renderFitness, tennis: renderTennis, calendar: renderCalendar, settings: renderSettings, tips: renderTips };

// ---------- loading ----------
export async function loadAll() {
  const now = new Date();
  const [settings, model, insights, live, nights, activities, fitness, ratings, logs, events] = await Promise.all([
    db.control("settings"), db.control("model"), db.control("insights"), db.control("live"),
    db.nights(120), db.activities(250), db.fitnessDaily(180), db.ratings(90), db.logs(),
    db.events(new Date(now.getTime() - 14 * 864e5).toISOString(), new Date(now.getTime() + 60 * 864e5).toISOString()),
  ]);
  st.settings = { ...DEFAULT_SETTINGS, ...settings, alarms: { ...DEFAULT_SETTINGS.alarms, ...(settings.alarms || {}) } };
  Object.assign(st, { model, insights, live, nights, activities, fitness, ratings, logs, events });
  st.plan = await currentPlan();
}

// ---------- tonight's plan (re-planned on the phone when the deadline or settings change) ----------
export function deadlineFor(settings, nightOf) {
  const wakeDay = addDays(nightOf, 1);
  const ov = settings.overrides || {};
  const hhmm = wakeDay in ov ? ov[wakeDay] : (settings.deadlines || {})[String(weekdayOf(wakeDay))];
  return hhmm ? `${wakeDay}T${hhmm}` : null;
}
export function planSettings(s) {
  const out = {};
  for (const k of ["prep_min", "latency_min", "wind_down_min", "min_sleep_h", "max_sleep_h"]) if (s[k] != null) out[k] = Number(s[k]);
  return out;
}
const sameSettings = (a, b) => !!a && !!b && Object.keys(b).every((k) => Number(a[k]) === Number(b[k]));

export async function currentPlan() {
  const nightOf = nightOfNow();
  const deadline = deadlineFor(st.settings, nightOf);
  const saved = await db.plan(nightOf);
  if (saved && saved.data.deadline === deadline && sameSettings(saved.data.settings_used, planSettings(st.settings))) return saved.data;
  if (!st.model.coef) return saved?.data || null;
  const plan = planFromState(st.model, nightOf, planSettings(st.settings), deadline);
  plan.settings_used = planSettings(st.settings);
  await db.savePlan(nightOf, plan);
  return plan;
}

// ---------- navigation ----------
export function show(tab, { scroll = true } = {}) {
  if (!VIEWS[tab]) tab = "home";
  st.tab = tab;
  $("#pageTitle").textContent = TITLES[tab];
  for (const b of $$("#tabs button")) b.setAttribute("aria-selected", String(b.dataset.tab === tab));
  VIEWS[tab](app, ctx);
  if (scroll) window.scrollTo({ top: 0, behavior: "instant" });
  if (location.hash.slice(1) !== tab) history.replaceState(null, "", `#${tab}${demo ? "" : ""}`);
  setFreshness();
}
export const rerender = () => VIEWS[st.tab](app, ctx);
const ctx = { st, db, show, rerender, reload: async () => { await loadAll(); rerender(); }, enablePush, deadlineFor, planSettings, currentPlan };

$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (b) show(b.dataset.tab); });
$("#btnSettings").onclick = () => show("settings");

function setFreshness() {
  const t = st.live?.updated || st.insights?.updated;
  $("#freshness").textContent = t ? ago(t.length === 16 ? t + ":00" : t) : "";
}
setInterval(setFreshness, 60000);

// ---------- refresh ----------
$("#btnRefresh").onclick = async () => {
  const b = $("#btnRefresh");
  if (b.classList.contains("spin")) return;
  b.classList.add("spin");
  try {
    const r = await db.invoke("sync", { query: "?force=1" });
    await loadAll();
    rerender();
    toast(r.demo ? "מצב הדגמה: אין חיבור לענן" : r.dispatched ? "יש נתונים חדשים. החישוב המלא יסתיים בעוד כ-2 דקות." : "הכל מעודכן");
  } catch (e) {
    toast(e.message);
  } finally {
    b.classList.remove("spin");
    setFreshness();
  }
};

// ---------- notifications ----------
function b64ToBytes(b64) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
export async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("כדי לקבל התראות צריך לפתוח את האפליקציה מהאייקון במסך הבית (לא מספארי).");
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("ההתראות לא אושרו. אפשר לאשר בהגדרות האייפון ← התראות ← שעון שינה.");
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) });
  await db.savePushSub(sub.toJSON());
  return true;
}

// ---------- sign-in & onboarding ----------
function renderLogin() {
  app.innerHTML = `<section class="card glass"><h1>שעון שינה</h1>
    <p class="muted">התחבר עם החשבון שיצרת ב-Supabase.</p>
    <form id="login" class="stack">
      <label class="field">מייל<input id="email" type="email" autocomplete="username" required></label>
      <label class="field">סיסמה<input id="password" type="password" autocomplete="current-password" required></label>
      <button class="primary" type="submit">התחבר</button>
      <p class="error small" id="loginErr" hidden></p>
    </form></section>`;
  $("#login").onsubmit = async (e) => {
    e.preventDefault();
    try { await db.signIn($("#email").value.trim(), $("#password").value); boot(); }
    catch (err) { const p = $("#loginErr"); p.textContent = err.message; p.hidden = false; }
  };
}

function ageFrom(birthday) {
  if (!birthday) return "";
  const b = new Date(birthday), n = new Date();
  return n.getFullYear() - b.getFullYear() - (n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
}
function renderOnboarding() {
  $("#tabs").hidden = true;
  const cp = st.model.profile || {};
  const p = { age: ageFrom(cp.birthday), weight_kg: cp.weight_kg ? Math.round(cp.weight_kg) : "", height_cm: cp.height_cm ? Math.round(cp.height_cm) : "",
    gender: cp.gender === "Male" ? "male" : cp.gender === "Female" ? "female" : "", ...st.settings.profile };
  app.innerHTML = `<section class="card glass"><h1>ברוך הבא</h1>
    <p class="muted">כמה פרטים כדי שהחישובים יתאימו לך. מילאתי מה שמצאתי ב-COROS, אפשר לתקן או לדלג.</p>
    <form id="ob" class="stack">
      <div class="grid2">
        <label class="field">גיל<input id="age" type="number" min="10" max="100" inputmode="numeric" value="${esc(p.age)}"></label>
        <label class="field">מין<select id="gender"><option value="">לא צוין</option>
          <option value="male" ${p.gender === "male" ? "selected" : ""}>זכר</option><option value="female" ${p.gender === "female" ? "selected" : ""}>נקבה</option></select></label>
        <label class="field">משקל (ק"ג)<input id="weight" type="number" min="30" max="250" inputmode="decimal" value="${esc(p.weight_kg)}"></label>
        <label class="field">גובה (ס"מ)<input id="height" type="number" min="100" max="230" inputmode="numeric" value="${esc(p.height_cm)}"></label>
        <label class="field">יעד קלוריות ביום<input id="calGoal" type="number" min="100" max="3000" step="50" inputmode="numeric" placeholder="למשל 600"></label>
        <label class="field">יעד צעדים<input id="stepsGoal" type="number" min="1000" max="40000" step="500" inputmode="numeric" value="8000"></label>
      </div>
      <label class="field">בימי חול אני צריך להיות ער עד<input id="obDeadline" type="time" value="${esc(st.settings.deadlines?.["0"] || "")}"></label>
      <label class="field">כמה דקות לוקח לי להירדם בערך<input id="obLatency" type="number" min="0" max="90" inputmode="numeric" value="${st.settings.latency_min}"></label>
      <p class="small muted">גיל משפיע ישירות על כמה שינה צריך. משקל משמש לחישוב כמות המים לפני משחק ולטיפים.</p>
      <div class="row"><button class="primary" type="submit">שמור והמשך</button><button type="button" id="skip" class="ghost">דלג</button></div>
    </form></section>`;
  const finish = async (save) => {
    const s = st.settings;
    if (save) {
      s.profile = { age: num($("#age").value), gender: $("#gender").value || null, weight_kg: num($("#weight").value), height_cm: num($("#height").value) };
      s.latency_min = num($("#obLatency").value) ?? 15;
      s.calorie_goal = num($("#calGoal").value);
      s.steps_goal = num($("#stepsGoal").value) ?? 8000;
      const d = $("#obDeadline").value;
      if (d) for (const wd of [0, 1, 2, 3, 4]) s.deadlines[String(wd)] = d; // mornings Sunday-Thursday
    }
    s.onboarded = true;
    await db.saveSettings(s);
    st.plan = await currentPlan();
    $("#tabs").hidden = false;
    show("home");
  };
  $("#ob").onsubmit = (e) => { e.preventDefault(); finish(true).catch((e) => toast(e.message)); };
  $("#skip").onclick = () => finish(false).catch((e) => toast(e.message));
}

function renderError(e) {
  app.innerHTML = `<section class="card glass"><h2>משהו לא עבד</h2><p class="error">${esc(e.message || e)}</p>
    <button id="retry">נסה שוב</button></section>`;
  $("#retry").onclick = () => location.reload();
}

// ---------- boot ----------
async function boot() {
  let signedIn;
  try { signedIn = await db.init(); } catch (e) { return renderError(e); }
  if (!signedIn) return renderLogin();
  try { await loadAll(); } catch (e) { return renderError(e); }
  $("#topbar").hidden = false;
  $("#tabs").hidden = false;
  if (!st.settings.onboarded) return renderOnboarding();
  const hash = location.hash.slice(1);
  if (hash.startsWith("log-")) { show("tennis"); openLog(ctx, hash.slice(4)); }
  else show(hash === "morning" ? "home" : hash.replace(/^tonight$/, "sleep") || "home");
  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    if (h.startsWith("log-")) openLog(ctx, h.slice(4));
    else if (h && h !== st.tab) show(h === "morning" ? "home" : h.replace(/^tonight$/, "sleep"));
  });
  let pending = null;
  db.subscribe(() => { clearTimeout(pending); pending = setTimeout(() => ctx.reload().catch(() => {}), 800); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) ctx.reload().catch(() => {}); });
}

if ("serviceWorker" in navigator && !demo) navigator.serviceWorker.register("sw.js").catch(() => {});
boot();
