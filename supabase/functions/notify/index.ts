// Push notifications, run every 5 minutes by cron. Works out which reminders are due now and
// sends each one once to every phone that enabled notifications in the app.
import webpush from "npm:web-push@3.6.7";
import { addMin, admin, authorized, control, cors, json, localOf } from "../_shared/util.ts";
import { dueNotes, type Note } from "./rules.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  if (!(await authorized(req, db))) return json({ error: "unauthorized" }, 401);
  const url = new URL(req.url);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:harelzionk@gmail.com",
    Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

  const now = new Date();
  const nowLocal = localOf(now);
  const today = nowLocal.slice(0, 10);
  const nightOf = Number(nowLocal.slice(11, 13)) >= 12 ? today : localOf(addMin(now, -24 * 60)).slice(0, 10);
  const [settings, insights, planRow, events, acts, logs, rating, subs] = await Promise.all([
    control(db, "settings"), control(db, "insights"),
    db.from("plans").select("data").eq("night_of", nightOf).maybeSingle(),
    db.from("events").select("*").gte("starts_at", addMin(now, -60).toISOString()).lte("starts_at", addMin(now, 26 * 60).toISOString()),
    db.from("activities").select("label_id,data").gte("date", localOf(addMin(now, -24 * 60)).slice(0, 10)),
    db.from("activity_logs").select("label_id"),
    db.from("ratings").select("date").eq("date", today).maybeSingle(),
    db.from("push_subs").select("endpoint,sub"),
  ]);

  // Test button in the app: one notification right now.
  let notes: Note[];
  if (url.searchParams.has("test")) {
    notes = [{ id: `test-${now.getTime()}`, at: now, title: "התראות פועלות", body: "ככה ייראו התזכורות של שעון שינה." }];
  } else {
    notes = dueNotes({
      now, nowLocal, settings, plan: planRow.data?.data, insights, events: events.data ?? [],
      activities: acts.data ?? [], logged: new Set((logs.data ?? []).map((l: any) => l.label_id)),
      ratedToday: !!rating.data,
    });
  }
  if (!notes.length) return json({ sent: 0 });
  const { data: already } = await db.from("sent").select("id").in("id", notes.map((x) => x.id));
  const done = new Set((already ?? []).map((r: any) => r.id));
  let sent = 0;
  for (const note of notes.filter((x) => !done.has(x.id))) {
    for (const s of subs.data ?? []) {
      try {
        await webpush.sendNotification(s.sub, JSON.stringify({ title: note.title, body: note.body, url: note.url ?? "./", tag: note.id }));
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await db.from("push_subs").delete().eq("endpoint", s.endpoint);
      }
    }
    await db.from("sent").upsert({ id: note.id, title: note.title, body: note.body });
  }
  return json({ sent, due: notes.length });
});
