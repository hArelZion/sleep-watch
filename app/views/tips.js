// Stage 9: all tips with their evidence; each can be hidden from the home screen.
import { TIPS, EVIDENCE_HE } from "../tips.js";
import { esc, toast } from "../util.js";

const WHEN_HE = { morning: "בבוקר", afternoon: "בצהריים", evening: "בערב", "before-match": "לפני משחק", "after-match": "אחרי משחק" };

export function renderTips(app, ctx) {
  const { st, db } = ctx;
  const hidden = new Set(st.settings.hidden_tips || []);
  const groups = Object.keys(WHEN_HE).map((w) => [w, TIPS.filter((t) => t.when === w)]);
  app.innerHTML = `<section class="card glass"><h2>טיפים לערנות ולשינה</h2>
    <p class="small muted">כל טיפ מסומן לפי חוזק הראיות במחקר. טיפ מוסתר לא יופיע במסך "היום".</p></section>
    ${groups.map(([w, list]) => `<section class="card glass"><h3>${WHEN_HE[w]}</h3>
      ${list.map((t) => `<div class="stack" style="padding:6px 0"><div class="row spread"><b>${esc(t.title)}</b><span class="evidence ${t.evidence}">${EVIDENCE_HE[t.evidence]}</span></div>
        <p class="muted">${esc(t.text)}</p><div class="row spread"><span class="small muted">${esc(t.source)}</span>
        <button class="small ghost" data-tip="${t.id}">${hidden.has(t.id) ? "הצג" : "הסתר"}</button></div></div><div class="divider"></div>`).join("")}
    </section>`).join("")}`;
  app.querySelectorAll("[data-tip]").forEach((b) => (b.onclick = async () => {
    const id = b.dataset.tip;
    hidden.has(id) ? hidden.delete(id) : hidden.add(id);
    st.settings.hidden_tips = [...hidden];
    try { await db.saveSettings(st.settings); renderTips(app, ctx); toast(hidden.has(id) ? "הוסתר" : "יוצג שוב"); } catch (e) { toast(e.message); }
  }));
}
