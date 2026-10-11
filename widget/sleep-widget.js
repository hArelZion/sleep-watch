// Home-screen widget for the free "Scriptable" app (iOS). Shows readiness, today's training,
// tonight's bedtime and alarm, and the next event. Tapping it opens the app.
// Setup: in Scriptable, new script -> paste this -> fill the 4 values below -> add a Scriptable
// widget (small or medium) to the home screen -> long-press -> Edit widget -> Script: this one.
const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const ANON_KEY = "YOUR-ANON-KEY";
const FEED_TOKEN = "YOUR-SECRET-CODE"; // app -> settings -> "connections to iPhone"
const APP_URL = "https://YOUR-USER.github.io/sleep-app/";

const req = new Request(`${SUPABASE_URL}/rest/v1/rpc/widget_feed`);
req.method = "POST";
req.headers = { apikey: ANON_KEY, "Content-Type": "application/json" };
req.body = JSON.stringify({ token: FEED_TOKEN });
let d = {};
try { d = await req.loadJSON(); } catch (e) { d = { error: true }; }

const hm = (s) => (s ? String(s).slice(11, 16) : "—");
const w = new ListWidget();
const g = new LinearGradient();
g.colors = [new Color("#1b1f5c"), new Color("#0b0d22")];
g.locations = [0, 1];
w.backgroundGradient = g;
w.url = APP_URL;
w.setPadding(14, 14, 14, 14);
const white = Color.white(), dim = new Color("#a9acd0"), amber = new Color("#ffae5c");

const top = w.addStack();
top.layoutHorizontally();
const ready = top.addText(d.readiness ? `${d.readiness}` : "–");
ready.font = Font.heavyRoundedSystemFont(30); ready.textColor = white;
top.addSpacer(6);
const lab = top.addStack(); lab.layoutVertically();
const l1 = lab.addText("מוכנות"); l1.font = Font.mediumSystemFont(11); l1.textColor = dim;
const l2 = lab.addText(d.training ? `אימון ${d.training}` : ""); l2.font = Font.semiboldSystemFont(12); l2.textColor = white;
w.addSpacer(8);

const row = w.addStack();
row.layoutHorizontally();
const a = row.addStack(); a.layoutVertically();
const a1 = a.addText("למיטה"); a1.font = Font.mediumSystemFont(11); a1.textColor = dim;
const a2 = a.addText(hm(d.lights_out)); a2.font = Font.boldRoundedSystemFont(20); a2.textColor = white;
row.addSpacer();
const b = row.addStack(); b.layoutVertically();
const b1 = b.addText("שעון מעורר"); b1.font = Font.mediumSystemFont(11); b1.textColor = dim;
const b2 = b.addText(hm(d.wake)); b2.font = Font.boldRoundedSystemFont(20); b2.textColor = amber;

if (d.next_event && config.widgetFamily !== "small") {
  w.addSpacer(6);
  const t = new Date(d.next_event.starts_at);
  const e = w.addText(`הבא: ${d.next_event.title} · ${t.getDate()}/${t.getMonth() + 1} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`);
  e.font = Font.mediumSystemFont(12); e.textColor = dim; e.lineLimit = 1;
}
if (d.error) { w.addSpacer(4); const x = w.addText("אין חיבור"); x.font = Font.systemFont(10); x.textColor = dim; }
w.refreshAfterDate = new Date(Date.now() + 15 * 60000);
if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
Script.complete();
