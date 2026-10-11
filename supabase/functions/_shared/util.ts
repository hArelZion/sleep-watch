// Shared helpers for the edge functions: database client, auth checks, Israel time.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const TZ = "Asia/Jerusalem";
export const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") ?? "harelzionk@gmail.com";

export function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

/** True for the scheduled cron call (shared secret) or for the owner's signed-in app. */
export async function authorized(req: Request, db: SupabaseClient, allowCron = true): Promise<boolean> {
  const secret = Deno.env.get("CRON_SECRET");
  if (allowCron && secret && req.headers.get("x-cron-secret") === secret) return true;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return false;
  const { data } = await db.auth.getUser(token);
  return data.user?.email === OWNER_EMAIL;
}

export async function control(db: SupabaseClient, id: string): Promise<Record<string, any>> {
  const { data } = await db.from("control").select("data").eq("id", id).maybeSingle();
  return (data?.data as Record<string, any>) ?? {};
}

export async function setControl(db: SupabaseClient, id: string, data: unknown) {
  await db.from("control").upsert({ id, data, updated_at: new Date().toISOString() });
}

// ---- Israel wall-clock time ("YYYY-MM-DDTHH:MM") <-> instants ----

const fmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
});

export function localOf(d: Date): string {
  return fmt.format(d).replace(" ", "T").slice(0, 16);
}

/** "2026-10-11T23:30" (Israel) -> Date. Uses the offset that applies at that moment. */
export function fromLocal(s: string): Date {
  const guess = new Date(s.slice(0, 16) + ":00Z");
  const back = localOf(guess);
  const diff = new Date(back + ":00Z").getTime() - guess.getTime();
  return new Date(guess.getTime() - diff);
}

export const hhmm = (s: string) => s.slice(11, 16);
export const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60000);
