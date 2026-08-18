/* Small DOM / formatting helpers. No framework: views return HTML strings and
   attach behaviour afterwards through mount hooks. */

import { icon } from './icons.js';

export const el = (sel, root = document) => root.querySelector(sel);
export const els = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export const num = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v))
  ? '—'
  : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export const pct = (v, d = 1) => (v === null || v === undefined) ? '—' : `${num(v, d)}%`;

export function dur(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function dist(m) {
  if (m === null || m === undefined) return '—';
  return `${num(m)} m`;
}

export function dateOf(epoch) {
  if (!epoch) return '—';
  return new Date(epoch * 1000).toLocaleDateString('en-GB',
    { day: '2-digit', month: 'short', year: 'numeric' });
}

export function timeOf(epoch) {
  if (!epoch) return '';
  return new Date(epoch * 1000).toLocaleTimeString('en-GB',
    { hour: '2-digit', minute: '2-digit' });
}

export function initials(name, max = 2) {
  const clean = String(name || '?').replace(/[^A-Za-z0-9؀-ۿ ]/g, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, max).toUpperCase() || '?';
}

/* Team crest: real logo when we have one, otherwise a coloured initials tile. */
export function crest(team, cls = '') {
  if (!team) return '';
  const size = cls.includes('xl') ? 116 : cls.includes('lg') ? 76 : cls.includes('sm') ? 26 : 40;
  if (team.logo) {
    const tone = team.logoTone ? ` tone-${esc(team.logoTone)}` : '';
    return `<img class="crest ${cls}${tone}" src="${esc(team.logo)}" alt="${esc(team.name)} logo"
      loading="lazy" width="${size}" height="${size}">`;
  }
  const fs = Math.round(size * 0.38);
  return `<span class="crest-fallback ${cls}" style="width:${size}px;height:${size}px;font-size:${fs}px;background:${esc(team.color || '#8b93a7')}" aria-label="${esc(team.name)}">${esc(initials(team.tag || team.name))}</span>`;
}

/* Player avatar: photo when available, otherwise initials in the team colour. */
export function avatar(player, team, cls = '') {
  const size = cls.includes('xl') ? 132 : cls.includes('lg') ? 92 : 38;
  const src = player?.photo || player?.portrait;
  if (src) {
    return `<img class="avatar ${cls}" src="${esc(src)}" alt="${esc(player.name)}" loading="lazy" width="${size}" height="${size}">`;
  }
  const radius = cls.includes('xl') ? '18px' : '50%';
  const fs = Math.round(size * 0.36);
  return `<span class="avatar avatar-fallback ${cls}" style="width:${size}px;height:${size}px;border-radius:${radius};font-size:${fs}px;background:${esc(team?.color || '#3b4457')}" aria-label="${esc(player?.name || '')}">${esc(initials(player?.name))}</span>`;
}

export function flagImg(team) {
  return team?.flag ? `<img class="flag" src="${esc(team.flag)}" alt="" loading="lazy">` : '';
}

export function teamLink(team, opts = {}) {
  if (!team) return '<span class="dim">—</span>';
  const size = opts.size || 'sm';
  return `<a class="ident" href="#/teams/${team.id}">
    ${crest(team, size)}
    <span class="name">${esc(opts.tag ? team.tag : team.name)}</span>
  </a>`;
}

export function playerLink(player, team) {
  if (!player) return '<span class="dim">—</span>';
  return `<a class="ident" href="#/players/${player.id}">
    ${avatar(player, team)}
    <span style="min-width:0">
      <span class="name">${esc(player.name)}</span>
      <span class="meta">${esc(team?.tag || player.teamTag || '')}</span>
    </span>
  </a>`;
}

export function tile(label, value, sub = '', cls = '') {
  return `<div class="tile ${cls}">
    <div class="label">${esc(label)}</div>
    <div class="value">${value}</div>
    ${sub ? `<div class="sub">${sub}</div>` : ''}
  </div>`;
}

export function panel(title, body, opts = {}) {
  const heading = title
    ? `<div class="panel-head">
        <h2>${opts.icon ? `<span class="panel-icon" aria-hidden="true">${icon(opts.icon, { size: 16 })}</span>` : ''}${esc(title)}</h2>
        ${opts.aside || ''}
      </div>`
    : '';
  return `<section class="panel ${opts.cls || ''}"${opts.id ? ` id="${esc(opts.id)}"` : ''}>
    ${heading}
    ${body}
    ${opts.note ? `<p class="panel-note">${opts.note}</p>` : ''}
  </section>`;
}

export function rankClass(rank) {
  return rank <= 3 ? ` r${rank}` : '';
}

/* ---------------------------------------------------------------- tables --- */
/* Declarative sortable table. `cols` entries:
     { key, label, get(row), fmt(v,row), cls, sort, right, width, title }   */
export function dataTable(rows, cols, opts = {}) {
  const id = opts.id || `t${Math.random().toString(36).slice(2, 8)}`;
  const head = cols.map((c, i) => `<th scope="col" class="${c.left ? 'l' : ''}" data-col="${i}">
      <button type="button" title="${esc(c.title || c.label)}">
        <span>${esc(c.label)}</span><span class="arrow" aria-hidden="true"></span>
      </button></th>`).join('');
  const body = rows.map(r => renderRow(r, cols, opts)).join('');
  const tall = rows.length > 18 ? ' tall' : '';
  return `<div class="table-wrap${tall}" tabindex="0" role="region" aria-label="${esc(opts.caption || 'Data table')}">
    <table class="data" id="${id}"
      data-sort="${opts.sortCol ?? ''}" data-dir="${opts.sortDir || 'desc'}">
    ${opts.caption ? `<caption>${esc(opts.caption)}</caption>` : ''}
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function renderRow(r, cols, opts) {
  const cls = [opts.rowClass ? opts.rowClass(r) : '', opts.href ? 'clickable' : ''].join(' ');
  const href = opts.href ? ` data-href="${esc(opts.href(r))}"` : '';
  const cells = cols.map(c => {
    const v = c.get ? c.get(r) : r[c.key];
    const html = c.fmt ? c.fmt(v, r) : num(v);
    return `<td class="${c.cls || ''} ${c.left ? 'l' : ''}" data-v="${sortVal(v)}">${html}</td>`;
  }).join('');
  return `<tr class="${cls}"${href}>${cells}</tr>`;
}

function sortVal(v) {
  if (v === null || v === undefined) return -Infinity;
  return typeof v === 'number' ? v : esc(String(v).toLowerCase());
}

/* Wire sorting + row navigation for every table inside `root`. */
export function bindTables(root = document) {
  els('table.data', root).forEach(table => {
    const initial = table.dataset.sort;
    if (initial !== '') sortTable(table, Number(initial), table.dataset.dir || 'desc', false);
    els('thead th', table).forEach(th => {
      const trigger = el('button', th) || th;
      trigger.addEventListener('click', () => {
        const col = Number(th.dataset.col);
        const same = Number(table.dataset.sort) === col;
        const dir = same && table.dataset.dir === 'desc' ? 'asc' : 'desc';
        sortTable(table, col, dir, true);
      });
    });
    els('tbody tr[data-href]', table).forEach(tr => {
      tr.addEventListener('click', ev => {
        if (ev.target.closest('a')) return;
        location.hash = tr.dataset.href;
      });
    });
  });
}

function sortTable(table, col, dir, mark) {
  const tbody = el('tbody', table);
  const rows = [...tbody.rows];
  const factor = dir === 'desc' ? -1 : 1;
  rows.sort((a, b) => {
    const x = parse(a.cells[col]?.dataset.v);
    const y = parse(b.cells[col]?.dataset.v);
    if (x === y) return 0;
    return (x > y ? 1 : -1) * factor;
  });
  rows.forEach(r => tbody.appendChild(r));
  table.dataset.sort = col;
  table.dataset.dir = dir;
  els('thead th', table).forEach((th, i) => {
    const active = i === col;
    if (active) th.setAttribute('aria-sort', dir === 'desc' ? 'descending' : 'ascending');
    else th.removeAttribute('aria-sort');
    const arrow = el('.arrow', th);
    if (arrow) {
      arrow.innerHTML = active
        ? icon(dir === 'desc' ? 'arrowDown' : 'arrowUp', { size: 12 })
        : '';
    }
  });
}

function parse(v) {
  if (v === undefined) return -Infinity;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}

/* --------------------------------------------------------------- tooltip --- */
const tip = () => document.getElementById('tooltip');

export function bindTooltips(root = document) {
  els('[data-tip]', root).forEach(node => {
    node.addEventListener('mouseenter', ev => showTip(ev, node.dataset.tip));
    node.addEventListener('mousemove', moveTip);
    node.addEventListener('mouseleave', hideTip);
    // Keyboard parity: focusing a data point announces the same values.
    node.addEventListener('focus', () => showAt(node, node.dataset.tip));
    node.addEventListener('blur', hideTip);
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') hideTip();
  }, { once: true });
}

function showAt(node, html) {
  const t = tip();
  t.innerHTML = html;
  t.classList.add('on');
  const box = node.getBoundingClientRect();
  const own = t.getBoundingClientRect();
  t.style.left = `${Math.min(box.left, window.innerWidth - own.width - 8)}px`;
  t.style.top = `${Math.max(8, box.bottom + 8)}px`;
}

function showTip(ev, html) {
  const t = tip();
  t.innerHTML = html;
  t.classList.add('on');
  moveTip(ev);
}

function moveTip(ev) {
  const t = tip();
  const pad = 14;
  let x = ev.clientX + pad;
  let y = ev.clientY + pad;
  const r = t.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}

function hideTip() { tip().classList.remove('on'); }

/* ------------------------------------------------------------------ misc --- */
export function chipRow(items, active, name) {
  return `<div class="chips" data-chips="${esc(name)}" role="group">${items.map(i =>
    `<button type="button" class="chip" aria-pressed="${i.key === active}" data-key="${esc(i.key)}">${esc(i.label)}</button>`
  ).join('')}</div>`;
}

export function bindChips(root, name, handler) {
  const box = el(`[data-chips="${name}"]`, root);
  if (!box) return;
  els('.chip', box).forEach(chip => chip.addEventListener('click', () => {
    els('.chip', box).forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
    handler(chip.dataset.key);
  }));
}

/* Skeleton placeholders — keep the page height stable while data loads. */
export function skeleton(kind = 'panel', count = 1) {
  const cls = { panel: 'sk-panel', tile: 'sk-tile', row: 'sk-row', line: 'sk-line', title: 'sk-title' }[kind];
  return Array.from({ length: count }, () => `<div class="skeleton ${cls}"></div>`).join('');
}

export function loadingBlock() {
  return `<div class="skeleton sk-title"></div>
    <div class="tiles" style="margin-bottom:var(--s-5)">${skeleton('tile', 6)}</div>
    <div class="grid g2">${skeleton('panel', 2)}</div>
    <span class="sr-only">Loading…</span>`;
}

export { icon };

/* A track on the left, the value on the right — never overlapping, so long
   bars cannot swallow their own number. */
export function barCell(value, max, color, fmt) {
  const w = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `<span class="bar-cell">
    <span class="track"><i style="width:${w.toFixed(1)}%;background:${esc(color)}"></i></span>
    <span class="num">${fmt ? fmt(value) : num(value)}</span>
  </span>`;
}

export function mix(hex, amount) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = c => Math.round(c + (255 - c) * amount);
  const d = c => Math.round(c * (1 + amount));
  const fn = amount >= 0 ? f : d;
  return `rgb(${fn(r)},${fn(g)},${fn(b)})`;
}

export function rgba(hex, alpha) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
