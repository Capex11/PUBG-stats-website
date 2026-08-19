/* Shared building blocks used by more than one view. */

import { store } from '../store.js';
import {
  esc, num, pct, dur, dateOf, crest, avatar, flagImg, dataTable, rankClass,
  barCell, rgba, teamLink,
} from '../ui.js';
import { sparkline } from '../charts.js';

export function pageHead({ crumb, title, sub, metaBadges = [], aside = '' }) {
  const badgesHtml = metaBadges.length
    ? `<div class="chips" style="margin-top:8px">${metaBadges.map(b =>
        typeof b === 'string' ? `<span class="badge">${b}</span>` : `<span class="badge ${b.cls || ''}">${b.text}</span>`
      ).join('')}</div>`
    : '';

  return `<div class="page-head">
    <div class="titles">
      ${crumb ? `<div class="crumb">${crumb}</div>` : ''}
      <h1>${esc(title)}</h1>
      ${sub ? `<p>${sub}</p>` : ''}
      ${badgesHtml}
    </div>
    ${aside}
  </div>`;
}

export function scopeName(scope) {
  return store.stageLabel(scope);
}

/* ------------------------------------------------------------- standings --- */
export function standingsTable(scope, opts = {}) {
  const rows = store.standingsIn(scope);
  if (!rows.length) return '<div class="empty">No standings for this stage.</div>';
  const maxPts = Math.max(...rows.map(r => r.finalPoints));
  const hasModifier = rows.some(r => r.modifier);
  const limit = opts.limit ? rows.slice(0, opts.limit) : rows;

  const cols = [
    {
      label: '#', get: r => r.rank, cls: 'rank', left: true,
      fmt: v => {
        if (v === 1) return `<span class="badge gold" style="min-width:30px;justify-content:center;font-weight:800">#1</span>`;
        if (v === 2) return `<span class="badge silver" style="min-width:30px;justify-content:center;font-weight:800">#2</span>`;
        if (v === 3) return `<span class="badge bronze" style="min-width:30px;justify-content:center;font-weight:800">#3</span>`;
        return `<span style="padding-left:6px">#${v}</span>`;
      },
    },
    {
      label: 'Team', left: true, get: r => r.name, fmt: (v, r) => {
        const t = store.team(r.id);
        return `<a class="ident" href="#/teams/${r.id}">
          <span class="accent-bar" style="background:${esc(r.color)}"></span>
          ${crest(t, 'sm')}
          <span style="min-width:0">
            <span class="name">${esc(r.name)}</span>
            <span class="meta">${flagImg(t)} ${esc(r.tag)}</span>
          </span></a>`;
      },
    },
    { label: 'M', get: r => r.matches, title: 'Matches played' },
    {
      label: 'WWCD', get: r => r.wwcd, title: 'Winner winner chicken dinner',
      fmt: v => v ? `<span class="badge gold" style="padding:2px 8px;font-size:11px">${v} 🍗</span>` : '<span class="dim">0</span>',
    },
    { label: 'Place', get: r => r.placementPoints, title: 'Placement points' },
    { label: 'Kills', get: r => r.kills },
    ...(hasModifier ? [{ label: 'Adj', get: r => r.modifier, title: 'Manual point adjustment', fmt: v => v ? `<span class="${v > 0 ? 'good' : 'bad'}">${v > 0 ? '+' : ''}${num(v)}</span>` : '<span class="dim">—</span>' }] : []),
    {
      label: 'Points', get: r => r.finalPoints, cls: 'strong',
      fmt: (v, r) => barCell(v, maxPts, rgba(r.color, .95), x => num(x)),
    },
    { label: 'Avg #', get: r => r.avgRank, title: 'Average placement', fmt: v => num(v, 2) },
    { label: 'Top 4', get: r => r.top4, title: 'Top-4 finishes' },
    { label: 'Damage', get: r => r.damage },
    {
      label: 'Form', get: r => 0, title: 'Points per match through the stage',
      fmt: (v, r) => sparkline(r.pointsSeries, { color: r.color, width: 78, height: 24 }) || '<span class="dim">—</span>',
    },
  ];

  return dataTable(limit, cols, {
    sortCol: 0, sortDir: 'asc',
    rowClass: r => rankClass(r.rank),
    href: r => `#/teams/${r.id}`,
  });
}

/* --------------------------------------------------------------- players --- */
export const PLAYER_COLS = {
  core: [
    { key: 'kills', label: 'K', title: 'Kills' },
    { key: 'damage', label: 'DMG', title: 'Total damage' },
    { key: 'knockouts', label: 'KO', title: 'Knockdowns' },
    { key: 'assists', label: 'A', title: 'Assists' },
    { key: 'rescues', label: 'REV', title: 'Revives' },
  ],
  rates: [
    { key: 'killsPerMatch', label: 'K/M', d: 2, title: 'Kills per match' },
    { key: 'damagePerMatch', label: 'DMG/M', d: 0, title: 'Damage per match' },
    { key: 'kd', label: 'K/D', d: 2 },
    { key: 'kpRate', label: 'KP%', d: 1, title: 'Share of team kills' },
    { key: 'hsRate', label: 'HS%', d: 1, title: 'Headshot kills / kills' },
    { key: 'avgSurvival', label: 'SURV', d: 0, fmt: v => dur(v), title: 'Average survival time' },
  ],
};

export function playersTable(scope, list, opts = {}) {
  const rows = (list || store.playersIn(scope));
  if (!rows.length) return '<div class="empty">No players in this scope.</div>';
  const maxRating = Math.max(...rows.map(r => r.s.rating || 0));

  const cols = [
    {
      label: 'Player', left: true, get: r => r.name, fmt: (v, r) => {
        const t = store.team(r.teamId);
        return `<a class="ident" href="#/players/${r.id}">
          ${avatar(r, t)}
          <span style="min-width:0">
            <span class="name">${esc(r.name)}</span>
            <span class="meta">${esc(r.teamName || '')}</span>
          </span></a>`;
      },
    },
    {
      label: 'Rating', get: r => r.s.rating, cls: 'strong', title:
        'Rating index: weighted z-score of per-match production (50 = field average)',
      fmt: (v, r) => barCell(v, maxRating, rgba(store.team(r.teamId)?.color || '#6f8cff', .95), x => num(x, 1)),
    },
    { label: 'M', get: r => r.s.matches, title: 'Matches played' },
    ...PLAYER_COLS.core.map(c => ({ label: c.label, title: c.title, get: r => r.s[c.key] })),
    ...PLAYER_COLS.rates.map(c => ({
      label: c.label, title: c.title, get: r => r.s[c.key],
      fmt: c.fmt || (v => num(v, c.d ?? 0)),
    })),
    {
      label: 'MVP', get: r => r.s.mvps, title: 'Match MVPs (most kills in a match)',
      fmt: v => v ? `<span class="badge gold" style="padding:1px 7px;font-size:11px">${v} MVP</span>` : '<span class="dim">0</span>',
    },
  ];

  return dataTable(rows, cols, {
    sortCol: opts.sortCol ?? 1,
    sortDir: 'desc',
    href: r => `#/players/${r.id}`,
  });
}

/* --------------------------------------------------------------- matches --- */
export function matchRow(m) {
  const w = store.team(m.winner.id);
  return `<a class="ident" href="#/matches/${m.key}" style="gap:10px;padding:10px 14px;border-radius:var(--radius-sm);background:var(--panel-2);border:1px solid var(--line-soft);transition:all .15s var(--ease)">
    <span class="badge gold nowrap">Game ${m.number}</span>
    ${crest(w, 'sm')}
    <span class="name" style="flex:1;min-width:0;font-weight:600">${esc(m.winner.name)}</span>
    <span class="tiny dim nowrap">${m.totalKills} kills · ${dur(m.duration)}</span>
  </a>`;
}

export function matchList(scope, limit) {
  const list = store.matchesIn(scope).slice().reverse().slice(0, limit || 999);
  if (!list.length) return '<div class="empty">No matches.</div>';
  return `<div style="display:flex;flex-direction:column;gap:6px">${list.map(matchRow).join('')}</div>`;
}

/* -------------------------------------------------------------- misc bits --- */
export function statPill(label, value, sub) {
  return `<div>
    <div class="tiny dim up">${esc(label)}</div>
    <div class="num" style="font-size:17px;font-weight:600">${value}</div>
    ${sub ? `<div class="tiny dim">${sub}</div>` : ''}
  </div>`;
}

export function teamChip(t) {
  return `<a class="chip" href="#/teams/${t.id}" style="border-color:${rgba(t.color, .5)}">
    ${crest(t, 'sm')} ${esc(t.tag)}</a>`;
}

export function killLogNotice() {
  const q = store.meta.dataQuality;
  const missing = q.matchesWithoutKillLog || [];
  return `<div class="notice">
    <b>How this is measured.</b> ${esc(q.killLogNote)}
    Coverage across the tournament is ${Math.round((q.killLogCoverage || 0) * 100)}%${
      missing.length ? `, and ${missing.length} match${missing.length > 1 ? 'es have' : ' has'} no kill feed at all
      (${missing.map(k => `<a href="#/matches/${k}">${esc(store.matchByKey.get(k)?.title || k)}</a>`).join(', ')})` : ''}.
  </div>`;
}

/* Weapon labels come from tools/weapons.json, a hand-editable ItemID -> name
   map. Until it is filled in, the game's raw numeric IDs carry no meaning for a
   reader, so weapon breakdowns stay hidden rather than showing bare numbers.
   Fill the file in and rebuild and they appear everywhere automatically. */
export function weaponsNamed() {
  return Object.keys(store.meta.weapons || {}).length > 0;
}

export function weaponName(id) {
  const w = store.meta.weapons?.[id];
  if (w?.name) return w.class ? `${w.name} (${w.class})` : w.name;
  if (w?.class) return `${w.class} ${id}`;
  return `Item ${id}`;
}
