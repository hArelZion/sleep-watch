// Calendar feed for the iPhone calendar (Settings -> Calendar -> Accounts -> Add Subscribed
// Calendar). URL: .../functions/v1/ics?token=<feed token from the app>. Shows sleep plans and
// the tennis/workout calendar.
import { admin, control, fromLocal } from "../_shared/util.ts";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");

Deno.serve(async (req) => {
  const db = admin();
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const settings = await control(db, "settings");
  if (token.length < 32 || token !== settings.feed_token) return new Response("not found", { status: 404 });

  const since = new Date(Date.now() - 14 * 86400000);
  const [{ data: plans }, { data: events }] = await Promise.all([
    db.from("plans").select("night_of,data").gte("night_of", since.toISOString().slice(0, 10)),
    db.from("events").select("*").gte("starts_at", since.toISOString()),
  ]);
  const now = stamp(new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//sleep-watch//he", "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:שעון שינה", "X-WR-TIMEZONE:Asia/Jerusalem", "REFRESH-INTERVAL;VALUE=DURATION:PT1H"];
  for (const p of plans ?? []) {
    const d = p.data;
    if (!d?.lights_out || !d?.wake) continue;
    lines.push("BEGIN:VEVENT", `UID:sleep-${p.night_of}@sleep-watch`, `DTSTAMP:${now}`,
      `DTSTART:${stamp(fromLocal(d.lights_out))}`, `DTEND:${stamp(fromLocal(d.wake))}`,
      `SUMMARY:${esc("שינה · ציון צפוי " + d.predicted_score)}`, `DESCRIPTION:${esc((d.reasons ?? []).join("\n"))}`,
      "TRANSP:TRANSPARENT", "END:VEVENT");
  }
  for (const e of events ?? []) {
    const start = new Date(e.starts_at);
    const end = e.ends_at ? new Date(e.ends_at) : new Date(start.getTime() + 90 * 60000);
    lines.push("BEGIN:VEVENT", `UID:${e.id}@sleep-watch`, `DTSTAMP:${now}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(e.title + (e.level ? " · " + e.level : ""))}`, `DESCRIPTION:${esc(e.data?.notes ?? "")}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n"), { headers: { "Content-Type": "text/calendar; charset=utf-8" } });
});
