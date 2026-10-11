// deno test --allow-net --allow-read --allow-env supabase/functions/tests
import { assert, assertEquals } from "jsr:@std/assert@1";
import { fromLocal, localOf } from "../_shared/util.ts";
import { parseLive } from "../sync/live.ts";
import { dueNotes } from "../notify/rules.ts";

Deno.test("Israel time round trip in summer and winter", () => {
  for (const s of ["2026-07-01T23:30", "2026-01-15T07:05", "2026-10-11T00:15"]) assertEquals(localOf(fromLocal(s)), s);
  assertEquals(fromLocal("2026-07-01T23:30").toISOString(), "2026-07-01T20:30:00.000Z"); // UTC+3
  assertEquals(fromLocal("2026-01-15T07:05").toISOString(), "2026-01-15T05:05:00.000Z"); // UTC+2
});

Deno.test("live numbers come from today's block", () => {
  const t = "--- 20261010 ---\nSteps: 1,301 | Calories: 105 kcal | Exercise: 0 min\nStress: Avg 19\n\n" +
    "--- 20261011 ---\nSteps: 2,649 | Calories: 1,218 kcal | Exercise: 1h 5min\nStress: Avg 23\n";
  assertEquals(parseLive(t), { steps: 2649, calories: 1218, exercise_min: 65, stress: 23 });
});

const plan = { night_of: "2026-10-11", lights_out: "2026-10-11T23:35", sleep_onset: "2026-10-11T23:50", wake: "2026-10-12T08:00" };
function run(nowLocal: string, extra: Record<string, unknown> = {}) {
  return dueNotes({
    now: fromLocal(nowLocal), nowLocal, settings: {}, plan, insights: {}, events: [], activities: [],
    logged: new Set(), ratedToday: false, ...extra,
  } as any);
}

Deno.test("bed reminders fire at the right minute and only inside the window", () => {
  assertEquals(run("2026-10-11T22:30").map((n) => n.id), []);
  assertEquals(run("2026-10-11T22:35").map((n) => n.id), ["bedprep-2026-10-11"]);
  assertEquals(run("2026-10-11T23:40").map((n) => n.id), ["bed-2026-10-11"]);
  assertEquals(run("2026-10-11T23:55").map((n) => n.id), []); // more than 15 min late: skip
});

Deno.test("bed prep lead time and switches come from settings", () => {
  const s = { notify: { bed_prep_min: 30, bedtime: false } };
  assertEquals(run("2026-10-11T23:05", { settings: s }).map((n) => n.id), ["bedprep-2026-10-11"]);
  assertEquals(run("2026-10-11T23:36", { settings: s }).length, 0);
});

Deno.test("tennis reminders two hours and one hour before", () => {
  const ev = { id: "e1", kind: "tennis", title: "טניס עם דני", level: "קשה", starts_at: fromLocal("2026-10-12T19:30").toISOString(),
    created_at: "2026-10-01T00:00:00Z", reminders: [120, 60] };
  const a = run("2026-10-12T17:31", { events: [ev], plan: null });
  assertEquals(a.map((n) => n.id), ["ev-e1-120"]);
  assert(a[0].title.includes("בעוד 2 שעות"));
  assertEquals(run("2026-10-12T18:30", { events: [ev], plan: null }).map((n) => n.id), ["ev-e1-60"]);
});

Deno.test("morning questionnaire 15 minutes after the alarm unless already rated", () => {
  assertEquals(run("2026-10-12T08:16").map((n) => n.id), ["morning-2026-10-12"]);
  assertEquals(run("2026-10-12T08:16", { ratedToday: true }).length, 0);
});

Deno.test("post-workout log prompt", () => {
  const act = { label_id: "a1", data: { end_local: "2026-10-12T21:00", sport_he: "טניס", sport_type: 1005 } };
  assertEquals(run("2026-10-12T21:25", { activities: [act], plan: null }).map((n) => n.id), ["log-a1"]);
  assertEquals(run("2026-10-12T21:25", { activities: [act], plan: null, logged: new Set(["a1"]) }).length, 0);
});

const TOKENS = new URL("../../../.coros_oauth.json", import.meta.url);
// Live check of the COROS client against the real server (read-only), using the login saved on
// this computer. Skipped when the file is missing (e.g. in CI).
Deno.test({
  name: "COROS client talks to the official server",
  ignore: !(await Deno.stat(TOKENS).then(() => true, () => false)),
  sanitizeResources: false, sanitizeOps: false,
  fn: async () => {
    const { Coros } = await import("../_shared/coros.ts");
    const store: Record<string, unknown> = { coros_auth: JSON.parse(await Deno.readTextFile(TOKENS)) };
    const fake = {
      from: () => ({
        select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: store[id] ? { data: store[id] } : null }) }) }),
        upsert: async (row: any) => { store[row.id] = row.data; return {}; },
      }),
    };
    const c = await Coros.open(fake as any);
    const t = await c.text("querySleepOverview", { days: 1 });
    assert(t.includes("Sleep"), t.slice(0, 200));
    const d = await c.text("queryDailyHealthData", { days: 1 });
    assert(parseLive(d).steps !== null);
  },
});
