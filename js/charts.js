// Hand drawn SVG charts. Each returns an SVG string.
const n = (v) => Math.round(v * 10) / 10;

function path(points) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join(' ');
}

// Smooth line through points (monotone friendly Catmull Rom).
function smooth(points, maxY = Infinity) {
  if (points.length < 3) return path(points);
  let d = `M${n(points[0][0])} ${n(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(maxY, p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(maxY, p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(p2[0])} ${n(p2[1])}`;
  }
  return d;
}

let uid = 0;

export function sparkline(values, w = 120, h = 36, color = 'var(--accent)') {
  const vals = values.length ? values : [0, 0];
  const max = Math.max(...vals), min = Math.min(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1 || 1)) * (w - 4) + 2, h - 3 - ((v - min) / span) * (h - 6)]);
  const id = `sg${++uid}`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".25"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${smooth(pts, h - 3)} L${w - 2} ${h} L2 ${h} Z" fill="url(#${id})"/>
    <path class="draw" pathLength="1" d="${smooth(pts, h - 3)}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

// series: [{label, inPence, outPence}]
export function areaChart(series, w = 640, h = 220) {
  const pad = { l: 18, r: 18, t: 12, b: 26 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max(1, ...series.flatMap((s) => [s.inPence, s.outPence]));
  const x = (i) => pad.l + (i / Math.max(1, series.length - 1)) * iw;
  const y = (v) => pad.t + ih - (v / max) * ih;
  const base = pad.t + ih;
  const pin = series.map((s, i) => [x(i), y(s.inPence)]);
  const pout = series.map((s, i) => [x(i), y(s.outPence)]);
  const id = `ag${++uid}`;
  const grid = [0.25, 0.5, 0.75, 1].map((f) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${n(pad.t + ih - f * ih)}" y2="${n(pad.t + ih - f * ih)}" stroke="var(--line)" stroke-dasharray="3 5"/>`).join('');
  const labels = series.map((s, i) => `<text x="${n(x(i))}" y="${h - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">${s.label}</text>`).join('');
  return `<svg class="area" viewBox="0 0 ${w} ${h}" role="img" aria-label="Money in and out by month">
    <defs>
      <linearGradient id="${id}i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f08a00" stop-opacity=".35"/><stop offset="1" stop-color="#ffb020" stop-opacity="0"/></linearGradient>
    </defs>
    ${grid}
    <path d="${smooth(pin, base)} L${n(x(series.length - 1))} ${base} L${n(x(0))} ${base} Z" fill="url(#${id}i)"/>
    <path class="draw" pathLength="1" d="${smooth(pin, base)}" fill="none" stroke="#f08a00" stroke-width="2.5" stroke-linecap="round"/>
    <path class="draw" pathLength="1" d="${smooth(pout, base)}" fill="none" stroke="var(--ink)" stroke-width="1.8" stroke-linecap="round" opacity=".55"/>
    ${labels}
  </svg>`;
}

// parts: [{label, pence, color}]
export function donut(parts, size = 180) {
  const total = parts.reduce((a, p) => a + p.pence, 0);
  const r = size / 2 - 14, c = 2 * Math.PI * r;
  let offset = 0;
  const rings = total ? parts.map((p) => {
    const len = (p.pence / total) * c;
    const seg = `<circle r="${n(r)}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${p.color}" stroke-width="22"
      stroke-dasharray="${n(Math.max(0, len - 2))} ${n(c)}" stroke-dashoffset="${n(-offset)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
    offset += len;
    return seg;
  }).join('') : `<circle r="${n(r)}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--line)" stroke-width="22"/>`;
  return `<svg class="donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Spending by category">${rings}</svg>`;
}

// Countdown ring: fills as the date gets closer within a 30 day window.
export function ring(daysLeft, totalDays = 30, size = 120, color = '#ffb020') {
  const r = size / 2 - 8, c = 2 * Math.PI * r;
  const f = daysLeft < 0 ? 1 : Math.max(0.04, 1 - Math.min(daysLeft, totalDays) / totalDays);
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle r="${n(r)}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="8"/>
    <circle class="ring-fill" r="${n(r)}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${n(c)}" stroke-dashoffset="${n(c * (1 - f))}" style="--c:${n(c)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}
