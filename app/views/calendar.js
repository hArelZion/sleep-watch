// Calendar: tennis matches and workouts, with reminders, and sending a workout to the watch.
import { $, DAYS, ICON, addDays, dm, esc, hm, isoDate, localIso, openSheet, closeSheet, toast, weekdayOf } from "../util.js";

const KIND_HE = { tennis: "טניס", workout: "אימון", other: "אחר" };
const REMINDERS = [[120, "שעתיים"], [60, "שעה"], [30, "חצי שעה"], [15, "רבע שעה"]];

export function renderCalendar(app, ctx) {
  const { st } = ctx;
  const today = isoDate(new Date());
  const upcoming = st.events.filter((e) => localIso(new Date(e.ends_at || e.starts_at)) >= localIso(new Date(Date.now() - 3 * 3600e3)));
  const days = {};
  for (const e of upcoming) (days[localIso(new Date(e.starts_at)).slice(0, 10)] ||= []).push(e);
  const p = st.plan;

  app.innerHTML = `
  <section class="card glass"><div class="row spread"><h2>יומן</h2><button class="primary small" id="addEvent">+ הוסף</button></div>
    <p class="small muted">תקבל תזכורת לפני כל אירוע, לפי מה שתבחר. כדי לראות את היומן גם ביומן של האייפון, ראה בהגדרות.</p></section>
  ${p ? `<section class="card glass"><div class="row"><span class="dot night">${ICON.moon}</span><div><b>שינה הלילה</b><br>
    <span class="small muted">למיטה <span class="num">${hm(p.lights_out)}</span> · שעון מעורר <span class="num">${hm(p.wake)}</span></span></div></div></section>` : ""}
  ${Object.keys(days).length ? Object.entries(days).sort().map(([d, evs]) => `<section class="card glass">
    <h3>${d === today ? "היום" : d === addDays(today, 1) ? "מחר" : `יום ${DAYS[weekdayOf(d)]}`} <span class="muted small">${dm(d)}</span></h3>
    <div class="list">${evs.map((e) => `<button class="item" data-ev="${e.id}">
      <span class="dot ${e.kind === "tennis" ? "tennis" : "sport"}">${e.kind === "tennis" ? ICON.tennis : ICON.sport}</span>
      <span><b>${esc(e.title)}</b> ${e.level ? `<span class="pill lvl${["קל", "בינוני", "קשה"].indexOf(e.level) + 1}">${esc(e.level)}</span>` : ""}<br>
      <span class="small muted num">${hm(localIso(new Date(e.starts_at)))}${e.ends_at ? "–" + hm(localIso(new Date(e.ends_at))) : ""}</span>
      ${e.data?.watch ? `<span class="small muted"> · נשלח לשעון</span>` : ""}</span><span class="small muted">›</span></button>`).join("")}</div></section>`).join("")
    : `<section class="card glass"><p class="empty">אין אירועים קרובים. הוסף משחק טניס או אימון.</p></section>`}`;

  $("#addEvent").onclick = () => eventSheet(ctx, {});
  app.querySelectorAll("[data-ev]").forEach((b) => (b.onclick = () => eventSheet(ctx, st.events.find((e) => e.id === b.dataset.ev))));
}

/** From the home screen's best hours: a workout prefilled at that time and level. */
export function scheduleSheet(ctx, { start, level }) {
  eventSheet(ctx, { kind: "workout", title: "אימון", start_local: start, level });
}

export function eventSheet(ctx, ev) {
  const { st, db } = ctx;
  const isNew = !ev.id;
  const startLocal = ev.starts_at ? localIso(new Date(ev.starts_at)) : ev.start_local || `${addDays(isoDate(new Date()), 1)}T19:00`;
  const dur = ev.ends_at ? Math.round((new Date(ev.ends_at) - new Date(ev.starts_at)) / 60000) : (ev.kind || "tennis") === "tennis" ? 90 : 60;
  const v = { kind: ev.kind || "tennis", level: ev.level || null, format: ev.data?.format || null, reminders: ev.reminders || [120, 60] };
  const chip = (g, val, label, on) => `<button type="button" class="chip" data-g="${g}" data-v="${val}" aria-pressed="${on}">${label}</button>`;
  const sheet = openSheet(`
    <h2>${isNew ? "אירוע חדש" : "עריכת אירוע"}</h2>
    <div class="chips">${Object.entries(KIND_HE).map(([k, l]) => chip("kind", k, l, v.kind === k)).join("")}</div>
    <label class="field">כותרת<input id="evTitle" value="${esc(ev.title || KIND_HE[v.kind])}"></label>
    <div class="grid2"><label class="field">תאריך<input id="evDate" type="date" value="${startLocal.slice(0, 10)}"></label>
      <label class="field">שעה<input id="evTime" type="time" value="${startLocal.slice(11, 16)}"></label></div>
    <label class="field">משך (דקות)<input id="evDur" type="number" min="10" max="300" step="5" value="${dur}"></label>
    <span class="eyebrow">רמה</span><div class="chips">${["קל", "בינוני", "קשה"].map((l) => chip("level", l, l, v.level === l)).join("")}</div>
    <div id="tennisFields" ${v.kind === "tennis" ? "" : "hidden"}><div class="grid2">
      <label class="field">עם מי<input id="evPartner" value="${esc(ev.data?.partner)}"></label>
      <div class="field">סוג<div class="chips">${chip("format", "singles", "יחידים", v.format === "singles")}${chip("format", "doubles", "זוגות", v.format === "doubles")}</div></div></div></div>
    <span class="eyebrow">תזכורות לפני</span><div class="chips">${REMINDERS.map(([m, l]) => chip("rem", m, l, v.reminders.includes(m))).join("")}</div>
    <label class="field">הערות<textarea id="evNotes">${esc(ev.data?.notes)}</textarea></label>
    <label class="switch" for="evDeadline"><span>להתאים את השעון המעורר<br><span class="small muted">אם האירוע בבוקר, שעת היעד לקימה תהיה שעה לפניו</span></span><input type="checkbox" role="switch" id="evDeadline"></label>
    <button class="primary" id="evSave">${isNew ? "קבע" : "שמור"}</button>
    <div id="watchBox" ${v.kind === "workout" ? "" : "hidden"} class="stack"><div class="divider"></div>
      <span class="eyebrow">לשלוח אימון מובנה לשעון (ריצה או אופניים)</span>
      <select id="evTemplate"><option value="">בלי</option></select>
      <button id="evWatch" class="ghost">${ICON.watch} שלח לשעון ליום הזה</button></div>
    ${isNew ? "" : `<button id="evDelete" class="ghost" style="color:var(--bad)">מחק</button>`}`);

  sheet.querySelectorAll(".chip").forEach((c) => (c.onclick = () => {
    const g = c.dataset.g, val = c.dataset.v;
    if (g === "rem") {
      const m = Number(val);
      v.reminders = v.reminders.includes(m) ? v.reminders.filter((x) => x !== m) : [...v.reminders, m].sort((a, b) => b - a);
      c.setAttribute("aria-pressed", String(v.reminders.includes(m)));
      return;
    }
    v[g] = v[g] === val && g !== "kind" ? null : val;
    sheet.querySelectorAll(`.chip[data-g="${g}"]`).forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === v[g])));
    if (g === "kind") {
      $("#tennisFields", sheet).hidden = v.kind !== "tennis";
      $("#watchBox", sheet).hidden = v.kind !== "workout";
      const t = $("#evTitle", sheet);
      if (Object.values(KIND_HE).includes(t.value)) t.value = KIND_HE[v.kind];
    }
  }));

  const build = () => {
    const start = new Date(`${$("#evDate", sheet).value}T${$("#evTime", sheet).value}`);
    const end = new Date(start.getTime() + Number($("#evDur", sheet).value || 60) * 60000);
    return { ...(ev.id ? { id: ev.id } : {}), kind: v.kind, title: $("#evTitle", sheet).value.trim() || KIND_HE[v.kind],
      starts_at: start.toISOString(), ends_at: end.toISOString(), level: v.level, reminders: v.reminders,
      data: { ...(ev.data || {}), partner: $("#evPartner", sheet)?.value.trim() || null, format: v.format, notes: $("#evNotes", sheet).value.trim() || null } };
  };

  $("#evSave", sheet).onclick = async () => {
    try {
      const e = await db.saveEvent(build());
      if ($("#evDeadline", sheet).checked) {
        const s = new Date(e.starts_at);
        if (s.getHours() < 12) {
          const wake = new Date(s.getTime() - 60 * 60000);
          st.settings.overrides = { ...(st.settings.overrides || {}), [isoDate(s)]: localIso(wake).slice(11, 16) };
          await db.saveSettings(st.settings);
        }
      }
      await ctx.reload();
      closeSheet();
      toast(isNew ? "נקבע. תקבל התראה לטלפון ותזכורות לפני." : "נשמר");
    } catch (err) { toast(err.message); }
  };
  $("#evDelete", sheet)?.addEventListener("click", async () => {
    try { await db.deleteEvent(ev.id); await ctx.reload(); closeSheet(); toast("נמחק"); } catch (err) { toast(err.message); }
  });

  // Watch workout templates come from the cloud function (only running/cycling are allowed by COROS).
  const sel = $("#evTemplate", sheet);
  db.invoke("coros-write", { method: "GET" }).then((list) => {
    if (!Array.isArray(list)) { sel.innerHTML = `<option value="">זמין אחרי ההקמה בענן</option>`; return; }
    sel.innerHTML += list.map((t) => `<option value="${t.id}" ${v.level === t.level ? "" : ""}>${esc(t.title)} · ${esc(t.level)}</option>`).join("");
  }).catch(() => { sel.innerHTML = `<option value="">לא זמין כרגע</option>`; });
  $("#evWatch", sheet).onclick = async () => {
    if (!sel.value) return toast("בחר אימון מהרשימה");
    const e = build();
    try {
      await db.invoke("coros-write", { body: { template: sel.value, date: localIso(new Date(e.starts_at)).slice(0, 10) } });
      e.data.watch = sel.value;
      await db.saveEvent(e);
      await ctx.reload();
      toast("נשלח ללוח האימונים בשעון. הוא יופיע אחרי סנכרון.");
    } catch (err) { toast(err.message); }
  };
}
