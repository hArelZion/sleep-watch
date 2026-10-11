// Fast check for new watch data (every 10 minutes from cron, and the app's "refresh" button).
// Reads a little from COROS, publishes today's live numbers at once (control/live), and when
// something changed starts the full Python job on GitHub (new nights, workouts, insights).
import { Coros } from "../_shared/coros.ts";
import { admin, authorized, control, cors, json, localOf, setControl } from "../_shared/util.ts";
import { parseLive } from "./live.ts";

async function sha(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

async function dispatch(): Promise<boolean> {
  const token = Deno.env.get("GH_TOKEN"), repo = Deno.env.get("GH_REPO");
  if (!token || !repo) return false;
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/daily.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "sleep-watch" },
    body: JSON.stringify({ ref: "main" }),
  });
  return r.status === 204;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  if (!(await authorized(req, db))) return json({ error: "unauthorized" }, 401);
  const force = new URL(req.url).searchParams.has("force");
  try {
    const c = await Coros.open(db);
    const today = localOf(new Date()).slice(0, 10).replaceAll("-", "");
    const [sleep, daily, sport] = await Promise.all([
      c.text("querySleepOverview", { days: 2 }),
      c.text("queryDailyHealthData", { days: 1 }),
      c.text("querySportRecords", { startDate: today, endDate: today }),
    ]);
    const state = await control(db, "sync_state");
    // Steps change all day; only sleep and workouts justify a full re-run.
    const hash = await sha(sleep + sport);
    const changed = hash !== state.hash;
    let dispatched = false;
    const lastDispatch = state.dispatched_at ? Date.parse(state.dispatched_at) : 0;
    if ((changed || force) && Date.now() - lastDispatch > 3 * 60000) dispatched = await dispatch();
    const live = { ...parseLive(daily), updated: new Date().toISOString(), new_data: changed };
    await setControl(db, "live", live);
    await setControl(db, "sync_state", {
      hash, checked_at: new Date().toISOString(),
      dispatched_at: dispatched ? new Date().toISOString() : state.dispatched_at ?? null,
    });
    return json({ changed, dispatched, live });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
