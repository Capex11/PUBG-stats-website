/* Head-to-head comparison of two players or two teams: metric bars, radar
   overlay, per-game trends and (for teams) the direct kill count between them.
   The pair lives in the URL so a comparison can be shared. */

import { store } from '../store.js';
import {
  esc, num, pct, dur, panel, crest, avatar, rgba, el, els, bindTooltips,
} from '../ui.js';
import { radarChart, lineChart, barChart, seriesTable } from '../charts.js';
import { icon } from '../icons.js';
import { pageHead, scopeName } from './common.js';

const COLORS = ['#ffb02e', '#6f8cff'];
const MAX = 2;

const PLAYER_METRICS = [
  { key: 'rating', label: 'Rating index', d: 1, short: 'RATING' },
  { key: 'kills', label: 'Kills', d: 0, short: 'KILLS' },
  { key: 'killsPerMatch', label: 'Kills / match', d: 2, short: 'K/M' },
  { key: 'damage', label: 'Damage', d: 0, short: 'DMG' },
  { key: 'damagePerMatch', label: 'Damage / match', d: 0, short: 'DMG/M' },
  { key: 'kd', label: 'K/D', d: 2, short: 'K/D' },
  { key: 'kpRate', label: 'Team kill share %', d: 1, short: 'KP%' },
  { key: 'knockouts', label: 'Knockdowns', d: 0, short: 'KO' },
  { key: 'knockConversion', label: 'Kills per knockdown', d: 2, short: 'K/KO', scale: 0.01 },
  { key: 'assists', label: 'Assists', d: 0, short: 'ASSIST' },
  { key: 'rescues', label: 'Revives', d: 0, short: 'REV' },
  { key: 'hsRate', label: 'Headshot %', d: 1, short: 'HS%' },
  { key: 'avgSurvival', label: 'Avg survival', d: 0, fmt: dur, short: 'SURV' },
  { key: 'survivalRate', label: 'Survived to the end %', d: 1, short: 'ALIVE%' },
  { key: 'longestKill', label: 'Longest kill (m)', d: 0, short: 'RANGE' },
  { key: 'damagePerKill', label: 'Damage / kill', d: 0, short: 'DMG/K', lowerBetter: true },
  { key: 'mvps', label: 'Match MVPs', d: 0, short: 'MVP' },
];

const TEAM_METRICS = [
  { key: 'finalPoints', label: 'Points', d: 0, short: 'PTS' },
  { key: 'pointsPerMatch', label: 'Points / match', d: 2, short: 'PTS/M' },
  { key: 'placementPoints', label: 'Placement points', d: 0, short: 'PLACE' },
  { key: 'kills', label: 'Kills', d: 0, short: 'KILLS' },
  { key: 'killsPerMatch', label: 'Kills / match', d: 2, short: 'K/M' },
  { key: 'wwcd', label: 'WWCD', d: 0, short: 'WWCD' },
  { key: 'top4', label: 'Top-4 finishes', d: 0, short: 'TOP4' },
  { key: 'avgRank', label: 'Average placement', d: 2, short: 'AVG#', lowerBetter: true },
  { key: 'damagePerMatch', label: 'Damage / match', d: 0, short: 'DMG/M' },
  { key: 'knockConversion', label: 'Kills per knockdown', d: 2, short: 'K/KO', scale: 0.01 },
  { key: 'rescues', label: 'Revives', d: 0, short: 'REV' },
  { key: 'consistency', label: 'Points std. dev.', d: 2, short: 'σ', lowerBetter: true },
];

export async function render({ params, scope }) {
  const mode = params[0] === 'teams' ? 'teams' : 'players';
  const ids = (params[1] || '').split(',').filter(Boolean);
  const pool = (mode === 'teams' ? store.teamsIn(scope) : store.playersIn(scope))
    .slice()
    .sort((a, b) => (mode === 'teams'
      ? a.s.rank - b.s.rank
      : (b.s.rating || 0) - (a.s.rating || 0)));
  const picked = ids.map(id => pool.find(x => x.id === id)).filter(Boolean).slice(0, MAX);

  const head = pageHead({
    crumb: `${esc(store.meta.tournament.label)} · ${esc(scopeName(scope))}`,
    title: 'Head-to-Head Comparison',
    sub: mode === 'teams'
      ? 'Direct side-by-side metric comparison, radar overlay, and head-to-head combat records for two competing squads.'
      : 'Side-by-side production breakdown, percentile radar, and combat efficiency profiles between two athletes.',
    metaBadges: [
      { text: `Mode: ${mode.toUpperCase()}`, cls: 'gold' },
      { text: `Stage: ${esc(scopeName(scope))}`, cls: '' },
    ],
    aside: `<div class="chips">
      <a class="chip ${mode === 'players' ? 'on' : ''}" href="#/compare/players/${esc(mode === 'players' ? ids.join(',') : '')}">Players</a>
      <a class="chip ${mode === 'teams' ? 'on' : ''}" href="#/compare/teams/${esc(mode === 'teams' ? ids.join(',') : '')}">Teams</a>
    </div>`,
  });

  const slots = `<div class="grid g2">
    ${[0, 1].map(i => slotHtml(picked[i], i, mode)).join('')}
  </div>`;

  const picker = `<section class="panel">
    <div class="panel-head">
      <h3>Add ${mode === 'teams' ? 'a team' : 'a player'}</h3>
      <div class="search-box" style="min-width:220px">
        <span class="icon" aria-hidden="true">${icon('search', { size: 15 })}</span>
        <input id="cmp-search" type="search" placeholder="Filter…" style="width:100%"
          aria-label="Filter the list below">
      </div>
    </div>
    <div class="chips" id="cmp-pool">
      ${pool.map(x => `<button class="chip" data-id="${x.id}"
        data-name="${esc((x.name + ' ' + (x.teamName || x.tag || '')).toLowerCase())}">
        ${mode === 'teams' ? crest(x, 'sm') : avatar(x, store.team(x.teamId))}
        ${esc(mode === 'teams' ? x.name : x.name)}</button>`).join('')}
    </div>
  </section>`;

  if (picked.length < 2) {
    return {
      html: `${head}${slots}${picker}
        <div class="notice">Pick two ${mode === 'teams' ? 'teams' : 'players'} to see the head to head.</div>`,
      mount: root => bindPicker(root, mode, ids),
    };
  }

  const metrics = mode === 'teams' ? TEAM_METRICS : PLAYER_METRICS;
  const bars = metricBars(picked, metrics, mode);
  const radar = compareRadar(picked, pool, mode);
  const trends = compareTrends(picked, scope, mode);
  const h2h = mode === 'teams' ? teamHeadToHead(picked, scope) : '';
  const verdict = verdictLine(picked, mode === 'teams' ? TEAM_METRICS : PLAYER_METRICS);

  return {
    html: `${head}${slots}${verdict}${picker}
      <div class="grid g-2-1">
        ${panel('Metric by metric', bars, {
          note: 'Best value in each row is highlighted. Bars are relative to the best of the selected ' + mode + '.',
        })}
        ${panel('Profile overlay', radar.html, { note: radar.note })}
      </div>
      ${panel('Form side by side', trends)}
      ${h2h}`,
    mount(root) {
      bindPicker(root, mode, ids);
      bindTooltips(root);
    },
  };
}

function slotHtml(item, i, mode) {
  if (!item) {
    return `<div class="compare-slot"><div class="dim small center" style="margin:auto">
      ${i === 0 ? 'Side A' : 'Side B'} — pick one below</div></div>`;
  }
  const color = COLORS[i];
  const team = mode === 'teams' ? item : store.team(item.teamId);
  const s = item.s;
  return `<div class="compare-slot filled" style="border-color:${rgba(color, .6)}">
    <div class="ident">
      ${mode === 'teams' ? crest(item, 'lg') : avatar(item, team, 'lg')}
      <div style="min-width:0">
        <div class="tiny up" style="color:${color}">${i === 0 ? 'Side A' : 'Side B'}</div>
        <a href="#/${mode === 'teams' ? 'teams' : 'players'}/${item.id}"
          style="font-family:var(--display);font-size:18px;font-weight:700">${esc(item.name)}</a>
        <div class="tiny muted">${esc(mode === 'teams' ? `${s.matches} matches · rank #${s.rank}` : (item.teamName || ''))}</div>
      </div>
    </div>
    <div class="chips">
      <button class="chip" data-remove="${item.id}">Remove</button>
    </div>
  </div>`;
}

function metricBars(picked, metrics, mode) {
  const cols = `grid-template-columns:170px repeat(${picked.length}, minmax(0,1fr))`;
  const header = `<div class="compare-row" style="${cols}">
    <div class="tiny up dim">Metric</div>
    ${picked.map((p, i) => `<div class="metric" style="color:${COLORS[i]};font-weight:700">${esc(p.tag || p.name)}</div>`).join('')}
  </div>`;
  const rows = metrics.map(mt => {
    const vals = picked.map(p => (p.s[mt.key] ?? 0) * (mt.scale ?? 1));
    const tied = vals.every(v => v === vals[0]);
    const best = tied ? null : (mt.lowerBetter ? Math.min(...vals) : Math.max(...vals));
    const scaleMax = Math.max(...vals.map(Math.abs)) || 1;
    return `<div class="compare-row" style="${cols}">
      <div class="small muted">${esc(mt.label)}</div>
      ${vals.map((v, i) => `<div>
        <div class="num center ${best !== null && v === best ? 'win' : ''}" style="font-size:14px">
          ${mt.fmt ? mt.fmt(v) : num(v, mt.d)}</div>
        <div class="cbar" style="margin-top:4px">
          <i style="width:${((Math.abs(v) / scaleMax) * 100).toFixed(1)}%;background:${COLORS[i]}"></i>
        </div>
      </div>`).join('')}
    </div>`;
  }).join('');
  return header + rows;
}

function compareRadar(picked, pool, mode) {
  const metrics = (mode === 'teams' ? TEAM_METRICS : PLAYER_METRICS)
    .filter(m => !['kills', 'damage', 'knockouts', 'assists', 'rescues', 'finalPoints', 'placementPoints', 'mvps', 'top4'].includes(m.key))
    .slice(0, 8);
  const axes = metrics.map(m => ({ label: m.label, short: m.short }));
  const series = picked.map((p, i) => {
    const values = metrics.map(m => {
      const vals = pool.map(x => x.s[m.key] ?? 0).sort((a, b) => a - b);
      const v = p.s[m.key] ?? 0;
      const below = vals.filter(x => x < v).length;
      const pctile = vals.length > 1 ? below / (vals.length - 1) : 0.5;
      return m.lowerBetter ? 1 - pctile : pctile;
    });
    const display = metrics.map(m => {
      const v = (p.s[m.key] ?? 0) * (m.scale ?? 1);
      return m.fmt ? m.fmt(v) : num(v, m.d);
    });
    return { name: p.name, color: COLORS[i], values, display };
  });
  return {
    html: radarChart({ axes, series, size: 330 })
      + `<div class="legend" style="justify-content:center;margin-top:8px">
        ${picked.map((p, i) => `<span><span class="sw" style="background:${COLORS[i]}"></span>${esc(p.name)}</span>`).join('')}
      </div>`,
    note: `Percentile against all ${mode} in this stage — outer edge is the best in the field. Metrics where lower is better are inverted.`,
  };
}

function compareTrends(picked, scope, mode) {
  const matches = store.matchesIn(scope);
  const labels = matches.map(m => m.short);
  const key = mode === 'teams' ? 'pointsSeries' : 'killsSeries';
  const second = mode === 'teams' ? 'killsSeries' : 'damageSeries';
  const scale = mode === 'teams' ? 1 : 1 / 100;
  return `<div class="grid g2" style="gap:16px">
    <div>
      <div class="tiny up dim" style="margin-bottom:6px">${mode === 'teams' ? 'Points per match' : 'Kills per match'}</div>
      ${lineChart({
        series: picked.map((p, i) => ({ name: p.name, color: COLORS[i], values: p.s[key] })),
        labels, height: 240,
      })}
    </div>
    <div>
      <div class="tiny up dim" style="margin-bottom:6px">${mode === 'teams' ? 'Kills per match' : 'Damage per match ÷ 100'}</div>
      ${lineChart({
        series: picked.map((p, i) => ({
          name: p.name, color: COLORS[i], values: (p.s[second] || []).map(v => v * scale),
        })),
        labels, height: 240,
      })}
    </div>
  </div>
  <div class="legend" style="margin-top:10px">
    ${picked.map((p, i) => `<span><span class="sw" style="background:${COLORS[i]}"></span>${esc(p.name)}</span>`).join('')}
  </div>
  ${seriesTable(labels, picked.map((p, i) => ({ name: p.name, values: p.s[key] })))}`;
}

function teamHeadToHead(picked, scope) {
  const h2h = store.analytics.headToHead[scope] || {};
  const rows = [];
  for (const a of picked) {
    for (const b of picked) {
      if (a.id === b.id) continue;
      rows.push({
        label: `${a.tag} → ${b.tag}`,
        value: (h2h[a.id] || {})[b.id] || 0,
        color: a.color,
        sub: `${a.name} kills on ${b.name}`,
      });
    }
  }
  if (!rows.some(r => r.value)) {
    return panel('Direct kills', '<div class="empty">No kill-feed events between these teams.</div>');
  }
  return panel('Direct kills', barChart({
    rows: rows.sort((x, y) => y.value - x.value),
    horizontal: true,
    height: rows.length * 26 + 8,
  }), { note: 'Kills taken directly off each other, from the in-game kill feed.' });
}

function bindPicker(root, mode, ids) {
  const go = list => {
    location.hash = `#/compare/${mode}/${list.filter(Boolean).slice(0, MAX).join(',')}`;
  };
  els('#cmp-pool .chip', root).forEach(chip => chip.addEventListener('click', () => {
    const id = chip.dataset.id;
    if (ids.includes(id)) return;
    // With both sides filled, the newest pick pushes out the older one.
    go(ids.length >= MAX ? [ids[ids.length - 1], id] : [...ids, id]);
  }));
  els('[data-remove]', root).forEach(btn => btn.addEventListener('click', () => {
    go(ids.filter(x => x !== btn.dataset.remove));
  }));
  const search = el('#cmp-search', root);
  search?.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    els('#cmp-pool .chip', root).forEach(chip => {
      chip.classList.toggle('hidden', !!q && !chip.dataset.name.includes(q));
    });
  });
}

/* One-line summary so the answer is readable without scanning every row. */
function verdictLine(picked, metrics) {
  const [a, b] = picked;
  let winsA = 0;
  let winsB = 0;
  for (const m of metrics) {
    const va = a.s[m.key] ?? 0;
    const vb = b.s[m.key] ?? 0;
    if (va === vb) continue;
    const aBetter = m.lowerBetter ? va < vb : va > vb;
    if (aBetter) winsA += 1;
    else winsB += 1;
  }
  const lead = winsA === winsB ? null : (winsA > winsB ? a : b);
  return `<div class="notice">
    <b style="color:${COLORS[0]}">${esc(a.name)}</b> leads ${winsA} of ${winsA + winsB} metrics,
    <b style="color:${COLORS[1]}">${esc(b.name)}</b> leads ${winsB}.
    ${lead ? `Overall edge: <b>${esc(lead.name)}</b>.` : 'They split it evenly.'}
  </div>`;
}
