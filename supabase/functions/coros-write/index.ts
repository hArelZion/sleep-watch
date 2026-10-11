// Put a workout on the watch's training calendar. Called only by the signed-in app, after you
// press "send to watch". COROS lets apps create running and cycling workouts (not tennis or
// strength), so these templates are runs and rides that support tennis fitness.
import { Coros } from "../_shared/coros.ts";
import { admin, authorized, cors, json } from "../_shared/util.ts";

const z = (sectionType: number, seconds: number, zone: number) =>
  ({ sectionType, targetType: 2, targetValue: seconds, intensityType: 1, sectionIntensity: zone });

export const TEMPLATES: Record<string, { level: string; title: string; course: Record<string, unknown> }> = {
  easy_run: { level: "קל", title: "ריצה קלה 30 דקות", course: {
    courseName: "ריצה קלה", sportType: 1,
    courseDescription: "ריצת התאוששות בדופק נמוך (אזור 2). אמור להרגיש קל, אפשר לדבר תוך כדי.",
    sections: [z(1, 300, 1), z(2, 1800, 2), z(4, 300, 1)] } },
  tempo_run: { level: "בינוני", title: "ריצת סף 3×8 דקות", course: {
    courseName: "ריצת סף", sportType: 1,
    courseDescription: "שלוש חזרות של 8 דקות בקצב מאומץ אך יציב (אזור 4), עם 3 דקות קלות ביניהן. משפר סיבולת לסטים ארוכים.",
    sections: [z(1, 600, 2), { intervalGroup: true, repeats: 3, sets: [z(2, 480, 4), z(3, 180, 2)] }, z(4, 600, 1)] } },
  sprint_run: { level: "קשה", title: "אינטרוולים 8×30 שניות", course: {
    courseName: "אינטרוולים לטניס", sportType: 1,
    courseDescription: "8 ספרינטים של 30 שניות במאמץ גבוה (אזור 5) עם 90 שניות קלות. מדמה את המאמץ של נקודות ארוכות בטניס.",
    sections: [z(1, 600, 2), { intervalGroup: true, repeats: 8, sets: [z(2, 30, 5), z(3, 90, 1)] }, z(4, 420, 1)] } },
  easy_ride: { level: "קל", title: "רכיבה קלה 45 דקות", course: {
    courseName: "רכיבת התאוששות", sportType: 2,
    courseDescription: "רכיבה רגועה בדופק נמוך (אזור 2) להתאוששות אחרי משחק.",
    sections: [z(1, 300, 1), z(2, 2400, 2), z(4, 300, 1)] } },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  if (!(await authorized(req, db, false))) return json({ error: "unauthorized" }, 401);
  if (req.method === "GET") {
    return json(Object.entries(TEMPLATES).map(([id, t]) => ({ id, level: t.level, title: t.title, description: t.course.courseDescription })));
  }
  const { template, date } = await req.json();
  const t = TEMPLATES[template];
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return json({ error: "bad request" }, 400);
  try {
    const c = await Coros.open(db);
    const text = await c.text("createScheduledWorkout", { date: date.replaceAll("-", ""), course: t.course });
    return json({ ok: true, result: text.slice(0, 400) });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
