// Minimal MCP client for the official COROS server, using the OAuth login stored in
// control/coros_auth (written by tools/seed_cloud.py and refreshed by the Python job too).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { control, setControl } from "./util.ts";

const SERVER = Deno.env.get("COROS_MCP_URL") ?? "https://mcpeu.coros.com/mcp";

type Auth = { tokens: Record<string, any>; client_info: Record<string, any> };

async function refresh(db: SupabaseClient, auth: Auth): Promise<Auth> {
  const issuer = (auth.client_info.issuer ?? new URL(SERVER).origin).replace(/\/$/, "");
  let tokenUrl = `${issuer}/token`;
  for (const path of ["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"]) {
    const r = await fetch(issuer + path);
    if (r.ok) { tokenUrl = (await r.json()).token_endpoint ?? tokenUrl; break; }
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: auth.tokens.refresh_token,
    client_id: auth.client_info.client_id,
    resource: SERVER,
  });
  const r = await fetch(tokenUrl, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  if (!r.ok) throw new Error(`COROS login refresh failed (${r.status}). Log in again on the computer.`);
  const t = await r.json();
  const next = { ...auth, tokens: { ...auth.tokens, ...t, refresh_token: t.refresh_token ?? auth.tokens.refresh_token } };
  await setControl(db, "coros_auth", next);
  return next;
}

function parseBody(text: string, contentType: string | null): any {
  if (contentType?.includes("text/event-stream")) {
    const data = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
    for (const d of data.reverse()) { try { const j = JSON.parse(d); if (j.result || j.error) return j; } catch { /* skip */ } }
    return {};
  }
  return text ? JSON.parse(text) : {};
}

export class Coros {
  private session: string | null = null;
  private id = 0;
  constructor(private db: SupabaseClient, private auth: Auth) {}

  static async open(db: SupabaseClient): Promise<Coros> {
    const auth = (await control(db, "coros_auth")) as Auth;
    if (!auth.tokens?.access_token) throw new Error("No COROS login in the cloud yet (run tools/seed_cloud.py).");
    const c = new Coros(db, auth);
    await c.rpc("initialize", {
      protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "sleep-watch-edge", version: "1" },
    });
    await c.post({ jsonrpc: "2.0", method: "notifications/initialized" });
    return c;
  }

  private async post(msg: unknown, retry = true): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${this.auth.tokens.access_token}`,
      "MCP-Protocol-Version": "2025-06-18",
    };
    if (this.session) headers["Mcp-Session-Id"] = this.session;
    const r = await fetch(SERVER, { method: "POST", headers, body: JSON.stringify(msg) });
    if (r.status === 401 && retry) {
      this.auth = await refresh(this.db, this.auth);
      return this.post(msg, false);
    }
    const sid = r.headers.get("mcp-session-id");
    if (sid) this.session = sid;
    return r;
  }

  private async rpc(method: string, params: unknown): Promise<any> {
    const r = await this.post({ jsonrpc: "2.0", id: ++this.id, method, params });
    const j = parseBody(await r.text(), r.headers.get("content-type"));
    if (j.error) throw new Error(`COROS ${method}: ${j.error.message ?? JSON.stringify(j.error)}`);
    return j.result;
  }

  /** Call a tool and return its text (COROS wraps text in a JSON string; unwrap it). */
  async text(name: string, args: Record<string, unknown> = {}): Promise<string> {
    const res = await this.rpc("tools/call", { name, arguments: args });
    const t = (res?.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
    try { const u = JSON.parse(t); if (typeof u === "string") return u; } catch { /* plain text */ }
    if (res?.isError) throw new Error(`COROS ${name}: ${t.slice(0, 200)}`);
    return t;
  }
}
