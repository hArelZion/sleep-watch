// Which reminders are due right now (pure function, tested in rules_test.ts).
import { addMin, fromLocal, hhmm, localOf } from "../_shared/util.ts";

const WINDOW_MIN = 15; // a reminder is still sent if the run was up to 15 minutes late

export type Note = { id: string; at: Date; title: string; body: string; url?: string };

export const NOTIFY_DEFAULTS = {
  bed_prep: true, bed_prep_min: 60, bedtime: true, caffeine: true, training: true, training_time: "08:30",
  morning: true, events: true, workout_log: true, warnings: true, weekly: true, weekly_time: "09:00",
  calories: true, calories_time: "20:00", nap: true,
};

export function dueNotes(ctx: {
  now: Date; settings: any; plan: any; insights: any; events: any[]; activities: any[]; logged: Set<string>;
  ratedToday: boolean; nowLocal: string;
}): Note[] {
  const n = { ...NOTIFY_DEFAULTS, ...(ctx.settings.notify ?? {}) };
  const today = ctx.nowLocal.slice(0, 10);
  const out: Note[] = [];
  const p = ctx.plan;
  if (p?.lights_out) {
    const lo = fromLocal(p.lights_out);
    if (n.bed_prep) out.push({ id: `bedprep-${p.night_of}`, at: addMin(lo, -n.bed_prep_min), title: "מתחילים להתארגן לשינה",
      body: `למיטה ב-${hhmm(p.lights_out)}. זה הזמן להוריד אורות, לסגור מסכים ולהתארגן.`, url: "./#tonight" });
    if (n.bedtime) out.push({ id: `bed-${p.night_of}`, at: lo, title: "הגיע הזמן לישון",
      body: `להירדם בסביבות ${hhmm(p.sleep_onset)}, השעון המעורר ב-${hhmm(p.wake)}. לילה טוב!`, url: "./#tonight" });
    if (n.morning && !ctx.ratedToday && p.wake?.slice(0, 10) === today)
      out.push({ id: `morning-${today}`, at: addMin(fromLocal(p.wake), 15), title: "בוקר טוב! איך ישנת?",
        body: "שתי שאלות קצרות, כדי שהמנוע ילמד מה הכי טוב לך.", url: "./#morning" });
  }
  const ins = ctx.insights ?? {};
  if (ins.date === today) {
    if (n.caffeine && ins.caffeine_cutoff)
      out.push({ id: `caffeine-${today}`, at: fromLocal(ins.caffeine_cutoff), title: "קפה אחרון להיום",
        body: "מעכשיו עדיף בלי קפאין, כדי שלא יפריע לשינה הלילה." });
    if (n.training && ins.training) {
      const w = ins.windows?.[0];
      out.push({ id: `training-${today}`, at: fromLocal(`${today}T${n.training_time}`),
        title: `היום: ${ins.training.level_he} · מוכנות ${ins.readiness?.score ?? "–"}`,
        body: (ins.training.ideas?.[0] ?? "") + (w ? `. הכי טוב ב-${hhmm(w.start)}${w.feels != null ? ` (${Math.round(w.feels)}°)` : ""}.` : "."),
        url: "./#home" });
    }
    if (n.nap && ins.nap)
      out.push({ id: `nap-${today}`, at: fromLocal(ins.nap.start), title: "זמן טוב לנמנום", body: ins.nap.text });
    if (n.warnings) for (const w of ins.warnings ?? [])
      out.push({ id: `warn-${w.id}`, at: ctx.now, title: w.title, body: w.text, url: "./#home" });
    const t = ins.today ?? {};
    if (n.calories && t.calorie_goal && t.calories != null && t.calories < t.calorie_goal)
      out.push({ id: `cal-${today}`, at: fromLocal(`${today}T${n.calories_time}`), title: "יעד הקלוריות",
        body: `נשארו ${Math.round(t.calorie_goal - t.calories)} קלוריות ליעד היומי (${Math.round(t.calories)} מתוך ${t.calorie_goal}).` });
    const dow = new Date(today + "T12:00:00Z").getUTCDay();
    if (n.weekly && dow === 0 && ins.weekly?.lines?.length)
      out.push({ id: `weekly-${today}`, at: fromLocal(`${today}T${n.weekly_time}`), title: "הדוח השבועי שלך",
        body: ins.weekly.lines.slice(0, 2).join(" "), url: "./#home" });
  }
  if (n.events) for (const e of ctx.events) {
    const start = new Date(e.starts_at);
    const when = hhmm(localOf(start));
    const what = e.title + (e.level ? ` · ${e.level}` : "");
    if (Date.now() - new Date(e.created_at).getTime() < 20 * 60000)
      out.push({ id: `evnew-${e.id}`, at: ctx.now, title: "נקבע ביומן", body: `${what}, ${localOf(start).slice(8, 10)}/${localOf(start).slice(5, 7)} ב-${when}.`, url: "./#calendar" });
    for (const r of e.reminders ?? [120, 60])
      out.push({ id: `ev-${e.id}-${r}`, at: addMin(start, -r), title: `${what} בעוד ${r >= 60 ? (r / 60) + " " + (r === 60 ? "שעה" : "שעות") : r + " דקות"}`,
        body: e.kind === "tennis" ? `ב-${when}. לשתות מים, ולאכול משהו קל אם עוד לא אכלת.` : `ב-${when}.`, url: "./#calendar" });
  }
  if (n.workout_log) for (const a of ctx.activities) {
    if (ctx.logged.has(a.label_id) || !a.data.end_local) continue;
    out.push({ id: `log-${a.label_id}`, at: addMin(fromLocal(a.data.end_local), 20),
      title: `איך היה ה${a.data.sport_he ?? "אימון"}?`,
      body: a.data.sport_type === 1005 ? "סמן תוצאה ודרג את המשחק, כדי לגלות מה עוזר לך לשחק טוב." : "דרג את האימון מ-1 עד 10.",
      url: `./#log-${a.label_id}` });
  }
  return out.filter((x) => x.at <= ctx.now && ctx.now.getTime() - x.at.getTime() <= WINDOW_MIN * 60000);
}

