// Small shared helpers: DOM, dates (Israel wall clock), formatting, toast and bottom sheet.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const pad = (n) => String(n).padStart(2, "0");
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localIso = (d) => `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return isoDate(new Date(y, m - 1, d + n)); };
export const hm = (iso) => (iso ? String(iso).slice(11, 16) : "—");
export const dm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
export const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
export const weekdayOf = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).getDay(); };
export const num = (v) => (v === "" || v == null ? null : Number(v));
export const round = (v, d = 0) => (v == null || Number.isNaN(v) ? "–" : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString("he-IL"));

export function fmtDur(min) {
  if (min == null) return "–";
  const m = Math.round(min);
  return m >= 60 ? `${Math.floor(m / 60)}:${pad(m % 60)} שע׳` : `${m} דק׳`;
}
export function nightOfNow() { const now = new Date(); const t = isoDate(now); return now.getHours() >= 12 ? t : addDays(t, -1); }
export function ago(iso) {
  if (!iso) return "";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "עודכן עכשיו";
  if (min < 60) return `עודכן לפני ${min} דק׳`;
  const h = Math.round(min / 60);
  return h < 24 ? `עודכן לפני ${h} שע׳` : `עודכן ${dm(iso)}`;
}
export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? "לילה טוב" : h < 12 ? "בוקר טוב" : h < 17 ? "צהריים טובים" : h < 21 ? "ערב טוב" : "לילה טוב";
}

export function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2800);
}

/** Bottom sheet. html = inner content; returns the sheet element. Closes on scrim tap / Escape. */
export function openSheet(html) {
  const sheet = $("#sheet"), scrim = $("#scrim");
  sheet.innerHTML = `<div class="grabber" aria-hidden="true"></div>${html}`;
  sheet.hidden = false; scrim.hidden = false;
  scrim.onclick = closeSheet;
  document.onkeydown = (e) => { if (e.key === "Escape") closeSheet(); };
  sheet.querySelector("input,button,select,textarea")?.focus({ preventScroll: true });
  return sheet;
}
export function closeSheet() { $("#sheet").hidden = true; $("#scrim").hidden = true; document.onkeydown = null; }

export const slider = (id, q, value = 7) => `<div class="rate"><div class="row spread"><label for="${id}">${q}</label><span class="val" id="${id}Val">${value}</span></div>
  <input id="${id}" type="range" min="1" max="10" step="0.5" value="${value}" aria-describedby="${id}Val"></div>`;
export function bindSlider(root, id) { const i = $(`#${id}`, root); i.oninput = () => ($(`#${id}Val`, root).textContent = i.value); }
const svg = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  tennis: svg('<circle cx="12" cy="12" r="8.5"/><path d="M5.5 6.5c3 3 3 8 0 11M18.5 6.5c-3 3-3 8 0 11"/>'),
  sport: svg('<path d="M3 12h4l3-7 4 14 3-7h4"/>'),
  moon: svg('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>'),
  watch: svg('<rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 6V3h6v3M9 18v3h6v-3M12 9.5V12l1.5 1.5"/>'),
};
export const sportIcon = (sportType) => (sportType === 1005 ? ICON.tennis : ICON.sport);
export const sw =(id, label, on, hint = "") => `<label class="switch" for="${id}"><span>${label}${hint ? `<br><span class="small muted">${hint}</span>` : ""}</span><input type="checkbox" role="switch" id="${id}" ${on ? "checked" : ""}></label>`;
