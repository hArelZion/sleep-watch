// Data layer: Supabase for real use, or ?demo with local sample files kept in memory.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const demo = new URLSearchParams(location.search).has("demo");
let sb = null;
let D = null; // demo store

const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

export const db = {
  async init() {
    if (demo) { D = await (await fetch("demo.json")).json(); return true; }
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await sb.auth.getSession();
    return !!data.session;
  },
  async signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error("ההתחברות נכשלה. בדוק את המייל והסיסמה.");
  },
  async signOut() { if (sb) await sb.auth.signOut(); },

  async control(id) {
    if (demo) return structuredClone(D.control[id] ?? {});
    return must(await sb.from("control").select("data").eq("id", id).maybeSingle())?.data ?? {};
  },
  async saveSettings(s) {
    if (demo) { D.control.settings = s; return; }
    must(await sb.from("control").upsert({ id: "settings", data: s, updated_at: new Date().toISOString() }));
  },
  async nights(limit = 90) {
    if (demo) return D.nights.slice(-limit);
    return must(await sb.from("nights").select("date,data").order("date", { ascending: false }).limit(limit)).reverse();
  },
  async activities(limit = 200) {
    if (demo) return D.activities.slice(-limit);
    return must(await sb.from("activities").select("label_id,date,data").order("date", { ascending: false }).limit(limit)).reverse();
  },
  async fitnessDaily(limit = 120) {
    if (demo) return D.fitness_daily ?? [];
    return must(await sb.from("fitness_daily").select("date,data").order("date", { ascending: false }).limit(limit)).reverse();
  },
  async plan(nightOf) {
    if (demo) return D.plans?.[nightOf] ?? null;
    return must(await sb.from("plans").select("data,source").eq("night_of", nightOf).maybeSingle());
  },
  async savePlan(nightOf, plan) {
    if (demo) { (D.plans ||= {})[nightOf] = { data: plan, source: "app" }; return; }
    must(await sb.from("plans").upsert({ night_of: nightOf, data: plan, source: "app", updated_at: new Date().toISOString() }));
  },
  async ratings(limit = 60) {
    if (demo) return Object.values(D.ratings ?? {}).slice(-limit);
    return must(await sb.from("ratings").select("*").order("date", { ascending: false }).limit(limit)).reverse();
  },
  async saveRating(r) {
    if (demo) { (D.ratings ||= {})[r.date] = r; return; }
    must(await sb.from("ratings").upsert(r));
  },
  async logs() {
    if (demo) return D.logs ?? {};
    return Object.fromEntries(must(await sb.from("activity_logs").select("label_id,data")).map((r) => [r.label_id, r.data]));
  },
  async saveLog(label_id, data) {
    if (demo) { (D.logs ||= {})[label_id] = data; return; }
    must(await sb.from("activity_logs").upsert({ label_id, data, updated_at: new Date().toISOString() }));
  },
  async events(fromIso, toIso) {
    if (demo) return (D.events ?? []).filter((e) => e.starts_at >= fromIso && e.starts_at <= toIso).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return must(await sb.from("events").select("*").gte("starts_at", fromIso).lte("starts_at", toIso).order("starts_at"));
  },
  async saveEvent(e) {
    if (demo) { e.id ||= crypto.randomUUID(); e.created_at ||= new Date().toISOString(); D.events = [...(D.events ?? []).filter((x) => x.id !== e.id), e]; return e; }
    return must(await sb.from("events").upsert(e).select().single());
  },
  async deleteEvent(id) {
    if (demo) { D.events = (D.events ?? []).filter((x) => x.id !== id); return; }
    must(await sb.from("events").delete().eq("id", id));
  },
  async savePushSub(sub) {
    if (demo) return;
    must(await sb.from("push_subs").upsert({ endpoint: sub.endpoint, sub }));
  },
  /** Call an edge function (sync, notify, coros-write) as the signed-in user. */
  async invoke(name, { body = null, method = "POST", query = "" } = {}) {
    if (demo) return { demo: true };
    const { data: s } = await sb.auth.getSession();
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}${query}`, {
      method, headers: { Authorization: `Bearer ${s.session?.access_token}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: body && method !== "GET" ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `שגיאה ${r.status}`);
    return j;
  },
  /** Live updates: calls onChange(table) when the cloud writes new data. */
  subscribe(onChange) {
    if (demo || !sb) return;
    sb.channel("live")
      .on("postgres_changes", { event: "*", schema: "public", table: "control" }, () => onChange("control"))
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, () => onChange("activities"))
      .on("postgres_changes", { event: "*", schema: "public", table: "nights" }, () => onChange("nights"))
      .subscribe();
  },
};
