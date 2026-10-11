// Small SVG charts drawn to scale, colored with the theme tokens.
const f1 = (x) => (Math.round(x * 10) / 10).toString();

/** Vertical bars. items: [{label, value, color?, title?}] */
export function bars(items, { height = 150, max = null, min = 0, ticks = [], unit = "" } = {}) {
  if (!items.length) return "";
  const W = 340, padL = 26, padB = 18, top = 8;
  const hi = max ?? Math.max(...items.map((i) => i.value ?? 0), ...ticks, 1);
  const y = (v) => height - padB - ((Math.max(v, min) - min) / (hi - min || 1)) * (height - padB - top);
  const bw = (W - padL) / items.length;
  const grid = ticks.map((t) => `<line class="grid" x1="${padL}" x2="${W}" y1="${f1(y(t))}" y2="${f1(y(t))}"/><text x="0" y="${f1(y(t) + 3.5)}">${t}</text>`).join("");
  const rects = items.map((it, i) => {
    if (it.value == null) return "";
    const x = padL + i * bw + 1.5, h = Math.max(height - padB - y(it.value), 1);
    return `<rect x="${f1(x)}" y="${f1(y(it.value))}" width="${f1(Math.max(bw - 3, 1))}" height="${f1(h)}" rx="${Math.min(4, bw / 3)}" fill="${it.color ?? "var(--night)"}"><title>${it.title ?? `${it.label}: ${it.value}${unit}`}</title></rect>`;
  }).join("");
  const first = items[0].label, last = items.at(-1).label;
  return `<svg viewBox="0 0 ${W} ${height}" role="img" direction="ltr">${grid}${rects}
    <text x="${padL}" y="${height - 4}">${first}</text><text x="${W}" y="${height - 4}" text-anchor="end">${last}</text></svg>`;
}

/** Line chart; series: [{values:[number|null], color, label}], labels: x labels (first/last shown). */
export function lines(series, labels, { height = 150, ticks = [], min = null, max = null, area = false } = {}) {
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!all.length) return "";
  const W = 340, padL = 28, padB = 18, top = 8;
  const lo = min ?? Math.min(...all, ...ticks), hi = max ?? Math.max(...all, ...ticks);
  const n = Math.max(...series.map((s) => s.values.length));
  const x = (i) => padL + (i / Math.max(n - 1, 1)) * (W - padL - 4);
  const y = (v) => height - padB - ((v - lo) / (hi - lo || 1)) * (height - padB - top);
  const grid = ticks.map((t) => `<line class="grid" x1="${padL}" x2="${W}" y1="${f1(y(t))}" y2="${f1(y(t))}"/><text x="0" y="${f1(y(t) + 3.5)}">${t}</text>`).join("");
  const paths = series.map((s) => {
    let d = "", started = false;
    s.values.forEach((v, i) => { if (v == null) { started = false; return; } d += `${started ? "L" : "M"}${f1(x(i))},${f1(y(v))}`; started = true; });
    const lastI = s.values.findLastIndex((v) => v != null);
    const fill = area && lastI > 0 ? `<path d="${d}L${f1(x(lastI))},${height - padB}L${f1(x(s.values.findIndex((v) => v != null)))},${height - padB}Z" fill="${s.color}" opacity=".14"/>` : "";
    const end = lastI >= 0 ? `<circle cx="${f1(x(lastI))}" cy="${f1(y(s.values[lastI]))}" r="4" fill="${s.color}" stroke="var(--glass-strong)" stroke-width="2"/>` : "";
    return `${fill}<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>${end}`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${height}" role="img" direction="ltr">${grid}${paths}
    <text x="${padL}" y="${height - 4}">${labels[0] ?? ""}</text><text x="${W}" y="${height - 4}" text-anchor="end">${labels.at(-1) ?? ""}</text></svg>`;
}

/** Progress ring (0..1) with a value in the middle. */
export function ring(frac, color, inner, size = 118) {
  const r = 48, c = 2 * Math.PI * r, off = c * (1 - Math.min(Math.max(frac, 0), 1));
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 118 118"><circle class="track" cx="59" cy="59" r="${r}"/>
    <circle class="arc" cx="59" cy="59" r="${r}" stroke="${color}" stroke-dasharray="${f1(c)}" stroke-dashoffset="${f1(off)}"/></svg>
    <div class="val">${inner}</div></div>`;
}

/** Horizontal stacked bar of heart-rate zones (minutes). */
export function zonesBar(mins) {
  const colors = ["var(--light)", "var(--sport)", "var(--night)", "var(--warn)", "var(--bad)"];
  const total = mins.reduce((a, b) => a + b, 0) || 1;
  return `<div class="stages" role="img" aria-label="זמן באזורי דופק">${mins.map((m, i) => m > 0 ? `<span style="width:${(m / total) * 100}%;background:${colors[i]}" title="${m} דק׳"></span>` : "").join("")}</div>`;
}
export const ZONE_COLORS = ["var(--light)", "var(--sport)", "var(--night)", "var(--warn)", "var(--bad)"];

/** Court heat map from points in metres around the session's centre. */
export function courtMap(xy) {
  if (!xy?.length) return "";
  const W = 200, H = 320, cell = 10;
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  const span = Math.max(30, ...xs.map(Math.abs), ...ys.map(Math.abs)) * 1.05;
  const sx = (x) => W / 2 + (x / span) * (W / 2), sy = (y) => H / 2 - (y / span) * (H / 2);
  const grid = {};
  for (const [x, y] of xy) { const k = `${Math.floor(sx(x) / cell)},${Math.floor(sy(y) / cell)}`; grid[k] = (grid[k] || 0) + 1; }
  const peak = Math.max(...Object.values(grid));
  const cells = Object.entries(grid).map(([k, n]) => {
    const [cx, cy] = k.split(",").map(Number);
    return `<rect x="${cx * cell}" y="${cy * cell}" width="${cell}" height="${cell}" rx="3" fill="var(--accent)" opacity="${f1(0.15 + 0.85 * (n / peak))}"/>`;
  }).join("");
  // No court outline: the watch doesn't know which way the court faces, so only density is shown.
  const scale = `<line x1="10" x2="${f1(10 + (10 / span) * (W / 2))}" y1="${H - 10}" y2="${H - 10}" stroke="var(--muted)" stroke-width="2"/>
    <text x="10" y="${H - 15}" font-size="10" fill="var(--muted)">10 מ׳</text>`;
  return `<svg class="court" viewBox="0 0 ${W} ${H}" role="img" aria-label="מפת תנועה במגרש">${cells}${scale}</svg>`;
}
