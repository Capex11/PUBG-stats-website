/* Hand-rolled SVG charts. No chart library: every function returns an SVG
   string, so views can build markup in one pass and stay dependency-free.
   Interactive bits use data-tip (see ui.bindTooltips). */

import { esc, num, rgba } from './ui.js';

/* Colours come from CSS tokens via classes (.chart text, .grid-line, .frame) so
   both themes work without re-rendering. Series colours are passed in. */

function scale(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = (d1 - d0) || 1;
  return v => r0 + ((v - d0) / span) * (r1 - r0);
}

function ticks(min, max, count = 5) {
  if (min === max) return [min];
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const norm = raw / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const out = [];
  for (let v = start; v <= end + step * 0.01; v += step) {
    out.push(Number(v.toFixed(6)));
  }
  return out.length ? out : [min, max];
}

/* ------------------------------------------------------------------- line --- */
export function lineChart({ series, labels, height = 260, yLabel = '', area = false,
  valueFmt = v => num(v, 0), pad = {}, width = 1000 }) {
  const p = { t: 20, r: 24, b: 28, l: 48, ...pad };
  const w = width;
  const h = height;
  const all = series.flatMap(s => s.values.filter(v => v !== null && v !== undefined));
  if (!all.length) return emptyChart(h, 'No data');
  const min = Math.min(0, ...all);
  const max = Math.max(...all);
  const yt = ticks(min, max, 5);
  const x = scale([0, Math.max(1, labels.length - 1)], [p.l, w - p.r]);
  const y = scale([yt[0], yt[yt.length - 1]], [h - p.b, p.t]);

  const grid = yt.map(t => `<line class="grid-line" x1="${p.l}" x2="${w - p.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>
    <text x="${p.l - 8}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end">${valueFmt(t)}</text>`).join('');

  // Keep at least ~34 user units between tick labels so they never collide.
  const gap = (w - p.l - p.r) / Math.max(1, labels.length - 1);
  const step = Math.max(1, Math.ceil(34 / Math.max(1, gap)));
  const xlab = labels.map((l, i) => (i % step === 0)
    ? `<text x="${x(i).toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="11">${esc(l)}</text>` : '').join('');

  const paths = series.map((s, si) => {
    const pts = s.values.map((v, i) => (v === null || v === undefined) ? null : [x(i), y(v)]).filter(Boolean);
    if (!pts.length) return '';
    const d = pts.map((pt, i) => `${i ? 'L' : 'M'}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join('');
    const fill = area
      ? `<path d="${d}L${pts[pts.length - 1][0].toFixed(1)},${y(yt[0]).toFixed(1)}L${pts[0][0].toFixed(1)},${y(yt[0]).toFixed(1)}Z" fill="${rgba(s.color, .13)}"/>`
      : '';
    const dots = s.values.map((v, i) => (v === null || v === undefined) ? '' :
      `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${labels.length > 24 ? 2.4 : 3.4}"
        fill="${s.color}" data-tip="<b>${esc(s.name)}</b><br>${esc(labels[i] || '')}: ${valueFmt(v)}"/>`).join('');
    return `${fill}<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}"
      stroke-linejoin="round" stroke-linecap="round" data-series="${si}"/>${dots}`;
  }).join('');

  // Uniform scaling only: width drives, height follows the viewBox ratio, so
  // labels and strokes keep their proportions at any container width.
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img"
      aria-label="${esc(yLabel || 'line chart')}">
    ${grid}${xlab}${paths}
  </svg>`;
}

/* -------------------------------------------------------------------- bar --- */
export function barChart({ rows, height, horizontal = true, valueFmt = v => num(v, 0), max, width }) {
  if (!rows.length) return emptyChart(160, 'No data');
  const top = max ?? Math.max(...rows.map(r => r.value));
  if (horizontal) {
    const rowH = 26;
    const h = height || rows.length * rowH + 8;
    const w = width || 620;
    const labelW = Math.round(w * 0.33);
    const bars = rows.map((r, i) => {
      const bw = Math.max(1, ((r.value / (top || 1)) * (w - labelW - 90)));
      const y = i * rowH + 4;
      return `<g data-tip="<b>${esc(r.label)}</b><br>${esc(r.sub || '')}${r.sub ? '<br>' : ''}${valueFmt(r.value)}">
        <text x="${labelW - 10}" y="${y + 15}" text-anchor="end" font-size="12">${esc(r.label)}</text>
        <rect x="${labelW}" y="${y + 3}" width="${bw.toFixed(1)}" height="${rowH - 12}" rx="4" fill="${r.color || '#6f8cff'}" opacity=".85"/>
        <text x="${labelW + bw + 8}" y="${y + 15}" class="value-label" font-size="12">${valueFmt(r.value)}</text>
      </g>`;
    }).join('');
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">${bars}</svg>`;
  }
  const w = width || Math.max(560, rows.length * 52);
  const h = height || 240;
  const longLabels = rows.some(r => String(r.label).length > 5);
  const pad = { t: 12, b: longLabels ? 46 : 32, l: 38, r: 8 };
  const bw = (w - pad.l - pad.r) / rows.length;
  const y = scale([0, top], [h - pad.b, pad.t]);
  const yt = ticks(0, top, 4);
  const grid = yt.map(t => `<line class="grid-line" x1="${pad.l}" x2="${w - pad.r}" y1="${y(t)}" y2="${y(t)}"/>
    <text x="${pad.l - 7}" y="${y(t) + 4}" text-anchor="end" font-size="11">${valueFmt(t)}</text>`).join('');
  const bars = rows.map((r, i) => {
    const x = pad.l + i * bw;
    const bh = Math.max(1, (h - pad.b) - y(r.value));
    return `<g data-tip="<b>${esc(r.label)}</b><br>${valueFmt(r.value)}">
      <rect x="${(x + bw * .15).toFixed(1)}" y="${y(r.value).toFixed(1)}" width="${(bw * .7).toFixed(1)}"
        height="${bh.toFixed(1)}" rx="3" fill="${r.color || '#6f8cff'}" opacity=".9"/>
      <text x="${(x + bw / 2).toFixed(1)}" y="${h - (longLabels ? 22 : 12)}" text-anchor="${longLabels ? 'end' : 'middle'}"
        font-size="11" ${longLabels ? `transform="rotate(-38 ${(x + bw / 2).toFixed(1)} ${h - 22})"` : ''}>${esc(r.label)}</text>
    </g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">${grid}${bars}</svg>`;
}

/* ------------------------------------------------------------------ radar --- */
export function radarChart({ axes, series, size = 300 }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 46;
  const n = axes.length;
  const angle = i => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (i, v) => [cx + Math.cos(angle(i)) * r * v, cy + Math.sin(angle(i)) * r * v];

  const rings = [0.25, 0.5, 0.75, 1].map(f => {
    const pts = axes.map((_, i) => point(i, f).map(v => v.toFixed(1)).join(',')).join(' ');
    return `<polygon points="${pts}" fill="none" class="${f === 1 ? 'frame' : 'grid-line'}" stroke-width="1"/>`;
  }).join('');

  const spokes = axes.map((a, i) => {
    const [x, y] = point(i, 1);
    const [lx, ly] = point(i, 1.19);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="frame"/>
      <text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="middle" font-size="10">${esc(a.short || a.label)}</text>`;
  }).join('');

  const shapes = series.map(s => {
    const pts = s.values.map((v, i) => point(i, Math.max(0.02, Math.min(1, v))).map(x => x.toFixed(1)).join(',')).join(' ');
    const dots = s.values.map((v, i) => {
      const [x, y] = point(i, Math.max(0.02, Math.min(1, v)));
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${s.color}"
        data-tip="<b>${esc(s.name)}</b><br>${esc(axes[i].label)}: ${esc(s.display?.[i] ?? '')}"/>`;
    }).join('');
    return `<polygon points="${pts}" fill="${rgba(s.color, .16)}" stroke="${s.color}" stroke-width="2"/>${dots}`;
  }).join('');

  return `<svg class="chart" viewBox="0 0 ${size} ${size}" role="img" style="max-width:${size}px;margin:0 auto">
    ${rings}${spokes}${shapes}
  </svg>`;
}

/* ----------------------------------------------------------------- donut --- */
export function donut({ slices, size = 190, thickness = 26, center = '' }) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const r = size / 2 - thickness / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  let a0 = -Math.PI / 2;
  const arcs = slices.map(s => {
    const a1 = a0 + (s.value / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p0 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r];
    const p1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
    a0 = a1;
    return `<path d="M${p0[0].toFixed(1)},${p0[1].toFixed(1)} A${r},${r} 0 ${large} 1 ${p1[0].toFixed(1)},${p1[1].toFixed(1)}"
      fill="none" stroke="${s.color}" stroke-width="${thickness}"
      data-tip="<b>${esc(s.label)}</b><br>${num(s.value)} (${((s.value / total) * 100).toFixed(1)}%)"/>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${size} ${size}" role="img" style="max-width:${size}px">
    ${arcs}
    ${center ? `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="20" font-weight="700"
        style="fill:var(--text)">${esc(center.top || center)}</text>
      ${center.bottom ? `<text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="10">${esc(center.bottom)}</text>` : ''}` : ''}
  </svg>`;
}

/* --------------------------------------------------------------- scatter --- */
export function scatter({ points, xLabel, yLabel, height = 320, xFmt = v => num(v, 0),
  yFmt = v => num(v, 1), width = 760 }) {
  if (!points.length) return emptyChart(height, 'No data');
  const w = width;
  const p = { t: 16, r: 18, b: 40, l: 52 };
  const xs = points.map(pt => pt.x);
  const ys = points.map(pt => pt.y);
  const xt = ticks(Math.min(...xs), Math.max(...xs), 5);
  const yt = ticks(Math.min(...ys), Math.max(...ys), 5);
  const x = scale([xt[0], xt[xt.length - 1]], [p.l, w - p.r]);
  const y = scale([yt[0], yt[yt.length - 1]], [height - p.b, p.t]);
  const rs = points.map(pt => pt.r || 1);
  const rmin = Math.min(...rs);
  const rmax = Math.max(...rs);
  const rad = v => 3.5 + ((v - rmin) / ((rmax - rmin) || 1)) * 5;

  const grid = [
    ...yt.map(t => `<line class="grid-line" x1="${p.l}" x2="${w - p.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>
      <text x="${p.l - 8}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end">${yFmt(t)}</text>`),
    ...xt.map(t => `<text x="${x(t).toFixed(1)}" y="${height - 22}" text-anchor="middle">${xFmt(t)}</text>`),
  ].join('');

  const dots = points.map(pt => `<circle cx="${x(pt.x).toFixed(1)}" cy="${y(pt.y).toFixed(1)}"
    r="${rad(pt.r || 1).toFixed(1)}" fill="${rgba(pt.color || '#6f8cff', .75)}" stroke="${pt.color || '#6f8cff'}"
    data-tip="<b>${esc(pt.label)}</b><br>${esc(xLabel)}: ${xFmt(pt.x)}<br>${esc(yLabel)}: ${yFmt(pt.y)}${pt.extra ? `<br>${esc(pt.extra)}` : ''}"/>`).join('');

  return `<svg class="chart" viewBox="0 0 ${w} ${height}" role="img">
    ${grid}${dots}
    <text x="${w / 2}" y="${height - 4}" text-anchor="middle">${esc(xLabel)}</text>
    <text x="12" y="${p.t + 4}" font-size="10">${esc(yLabel)}</text>
  </svg>`;
}

/* ------------------------------------------------------------- sparkline --- */
export function sparkline(values, { color = '#35d0ba', width = 90, height = 26, invert = false } = {}) {
  const vals = values.filter(v => v !== null && v !== undefined);
  if (vals.length < 2) return '';
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const x = scale([0, values.length - 1], [1, width - 1]);
  const y = invert ? scale([min, max], [2, height - 2]) : scale([min, max], [height - 2, 2]);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/>
  </svg>`;
}

/* --------------------------------------------------------------- heatmap --- */
export function heatmap({ rows, cols, values, colorFor, cellTip, rowLabel }) {
  const head = `<div class="heat" style="grid-template-columns:150px repeat(${cols.length}, minmax(0,1fr))">
    <div></div>${cols.map(c => `<div class="tiny dim center">${esc(c)}</div>`).join('')}`;
  const body = rows.map((r, ri) => `
    <div class="tiny nowrap" style="overflow:hidden;text-overflow:ellipsis">${rowLabel ? rowLabel(r) : esc(r)}</div>
    ${cols.map((c, ci) => {
      const v = values[ri][ci];
      return `<div class="cell" style="background:${colorFor(v, ri, ci)}"
        data-tip="${esc(cellTip ? cellTip(r, c, v, ri, ci) : `${v}`)}">${v || ''}</div>`;
    }).join('')}`).join('');
  return `${head}${body}</div>`;
}

/* ---------------------------------------------------------------- stacked --- */
export function stackedBars({ rows, keys, colors, height = 22, valueFmt = v => num(v) }) {
  return rows.map(r => {
    const total = keys.reduce((a, k) => a + (r[k] || 0), 0) || 1;
    const segs = keys.map((k, i) => {
      const v = r[k] || 0;
      if (!v) return '';
      return `<i style="width:${((v / total) * 100).toFixed(2)}%;background:${colors[i]}"
        data-tip="<b>${esc(r.label)}</b><br>${esc(k)}: ${valueFmt(v)}"></i>`;
    }).join('');
    return `<div style="display:grid;grid-template-columns:150px 1fr 60px;gap:10px;align-items:center;margin-bottom:6px">
      <div class="small nowrap" style="overflow:hidden;text-overflow:ellipsis">${r.labelHtml || esc(r.label)}</div>
      <div style="display:flex;height:${height}px;border-radius:5px;overflow:hidden;background:#1a212e">${segs}</div>
      <div class="num small right">${valueFmt(total)}</div>
    </div>`;
  }).join('');
}

function emptyChart(h, msg) {
  return `<div class="empty" style="height:${h}px;display:flex;align-items:center;justify-content:center">${esc(msg)}</div>`;
}

/* Colour ramp for heat cells: 0 -> transparent, 1 -> accent. */
export function ramp(t, hex = '#ffb02e') {
  const clamped = Math.max(0, Math.min(1, t));
  return rgba(hex, 0.08 + clamped * 0.75);
}

/* ------------------------------------------------------------- data table --- */
/* Charts must never be the only way to read a number: pair any chart with this
   collapsible table (WCAG "provide a non-visual equivalent"). */
export function chartData(headers, rows, { summary = 'Show data table', caption = '' } = {}) {
  if (!rows.length) return '';
  return `<details class="chart-data">
    <summary>${esc(summary)}</summary>
    <div class="table-wrap" style="margin-top:8px">
      <table class="data">
        ${caption ? `<caption>${esc(caption)}</caption>` : ''}
        <thead><tr>${headers.map((h, i) =>
          `<th scope="col" class="${i === 0 ? 'l' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${r.map((c, i) =>
          `<td class="${i === 0 ? 'l' : ''}">${typeof c === 'number' ? num(c, Number.isInteger(c) ? 0 : 2) : esc(c)}</td>`
        ).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
  </details>`;
}

/* Convenience: table for a labelled bar chart. */
export function barsTable(rows, valueLabel = 'Value') {
  return chartData(['Item', valueLabel], rows.map(r => [r.label, r.value]));
}

/* Convenience: table for a multi-series line chart. */
export function seriesTable(labels, series, firstHeader = 'Game') {
  return chartData(
    [firstHeader, ...series.map(s => s.name)],
    labels.map((l, i) => [l, ...series.map(s => s.values[i] ?? null)]),
  );
}
