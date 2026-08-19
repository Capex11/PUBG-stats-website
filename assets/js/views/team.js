/* One team: identity, roster, per-match record, trends, placement profile. */

import { store } from '../store.js';
import {
  esc, num, pct, dur, dateOf, panel, tile, crest, avatar, flagImg, rgba,
  dataTable, barCell, bindTables, bindTooltips, skeleton, rankClass,
} from '../ui.js';
import { radarChart, lineChart, barChart, donut, sparkline } from '../charts.js';
import { pageHead, scopeName } from './common.js';
import { icon } from '../icons.js';

export async function render({ params, scope }) {
  const team = store.team(params[0]);
  if (!team) return { html: notFound(params[0]) };
  return build(team, scope);
}

function build(team, scope) {
  const s = team.stages[scope];
  if (!s) {
    return {
      html: `${pageHead({ crumb: 'Team', title: team.name })}
        <div class="empty">${esc(team.name)} did not play in ${esc(scopeName(scope))}.
        Switch the stage selector to see their record.</div>`,
    };
  }
  const matches = store.matchesIn(scope);
  const roster = store.rosterOf(team.id, scope);
  const standing = store.standingsIn(scope).find(r => r.id === team.id);
  const allTeams = store.teamsIn(scope);

  const ordered = allTeams.slice().sort((a, b) => a.s.rank - b.s.rank);
  const at = ordered.findIndex(t => t.id === team.id);
  const prev = ordered[at - 1];
  const next = ordered[at + 1];
  const nav = `<div class="chips" style="margin-bottom:var(--s-4)">
    ${prev ? `<a class="chip" href="#/teams/${prev.id}">${icon('chevronLeft', { size: 14 })} #${prev.s.rank} ${esc(prev.tag)}</a>` : ''}
    ${next ? `<a class="chip" href="#/teams/${next.id}">#${next.s.rank} ${esc(next.tag)} ${icon('chevronRight', { size: 14 })}</a>` : ''}
    ${next || prev ? `<a class="chip" href="#/compare/teams/${team.id}${next ? ',' + next.id : (prev ? ',' + prev.id : '')}">Compare</a>` : ''}
    <a class="chip" href="#/teams">All teams</a>
  </div>`;

  const hero = `<section class="hero-banner">
    <div class="hero-glow-bg" style="background:radial-gradient(circle, ${rgba(team.color, .45)}, transparent 65%)"></div>
    <div style="position:relative;display:flex;gap:24px;align-items:center;flex-wrap:wrap;justify-content:space-between">
      <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
        ${crest(team, 'xl')}
        <div style="min-width:240px">
          <div class="crumb">
            <span class="badge gold">${esc(store.meta.tournament.label)}</span>
            <span class="badge">${esc(scopeName(scope))}</span>
          </div>
          <h1 style="font-size:clamp(2rem, 3.5vw, 2.6rem);margin:4px 0 8px">${esc(team.name)}</h1>
          <div class="chips">
            <span class="badge ${s.rank === 1 ? 'gold' : s.rank === 2 ? 'silver' : s.rank === 3 ? 'bronze' : ''}">Rank #${s.rank} of ${allTeams.length}</span>
            <span class="badge">${esc(team.tag)}</span>
            ${team.flag ? `<span class="badge" title="Region">${flagImg(team)} Region</span>` : ''}
            <span class="badge">${roster.length} Players</span>
          </div>
        </div>
      </div>
      <div style="text-align:right;background:var(--panel-2);padding:14px 20px;border-radius:var(--radius);border:1px solid var(--line-soft)">
        <div class="tiny up dim">Total Stage Points</div>
        <div class="hero-figure" style="font-size:3rem;margin:2px 0">${num(s.finalPoints)}</div>
        <div class="tiny muted">${num(s.placementPoints)} placement + ${num(s.kills)} kills${s.modifier ? ` ${s.modifier > 0 ? '+' : ''}${num(s.modifier)} adj` : ''}</div>
      </div>
    </div>
  </section>`;

  const tiles = `<div class="tiles">
    ${tile('Matches Played', s.matches, `${s.wwcd} WWCD · ${s.top4} top-4`, 'accent')}
    ${tile('Average Placement', `#${num(s.avgRank, 2)}`, `best #${s.bestRank} · worst #${s.worstRank}`)}
    ${tile('Eliminations / Match', num(s.killsPerMatch, 2), `${num(s.kills)} total kills`)}
    ${tile('Damage / Match', num(s.damagePerMatch, 0), `${num(s.damage)} total damage`)}
    ${tile('Points / Match', num(s.pointsPerMatch, 2), `consistency σ ${num(s.consistency, 2)}`)}
    ${tile('Finishing Conversion', num(s.kills / Math.max(1, s.knockouts), 2), `${num(s.knockouts)} knockdowns dealt`)}
    ${tile('Squad Revives', num(s.rescues), `${num(s.assists)} assists`)}
    ${tile('WWCD Win Rate', pct(s.wwcdRate), `top-4 rate ${pct(s.top4Rate)}`)}
  </div>`;

  /* roster table */
  const rosterCols = [
    {
      label: 'Player', left: true, get: p => p.name, fmt: (v, p) => `<a class="ident" href="#/players/${p.id}">
        ${avatar(p, team)}<span style="min-width:0"><span class="name">${esc(p.name)}</span>
        <span class="meta">${p.s.matches} matches</span></span></a>`,
    },
    { label: 'Rating', get: p => p.s.rating, cls: 'strong', fmt: v => num(v, 1) },
    { label: 'Kills', get: p => p.s.kills },
    { label: 'KP%', get: p => p.s.kpRate, fmt: v => num(v, 1), title: 'Share of team kills' },
    { label: 'DMG', get: p => p.s.damage },
    { label: 'DMG/M', get: p => p.s.damagePerMatch, fmt: v => num(v, 0) },
    { label: 'KO', get: p => p.s.knockouts },
    { label: 'A', get: p => p.s.assists },
    { label: 'REV', get: p => p.s.rescues },
    { label: 'HS%', get: p => p.s.hsRate, fmt: v => num(v, 1) },
    { label: 'K/D', get: p => p.s.kd, fmt: v => num(v, 2) },
    { label: 'Surv', get: p => p.s.avgSurvival, fmt: v => dur(v) },
    { label: 'MVP', get: p => p.s.mvps },
  ];

  /* per-match record */
  const rows = [];
  const teamMatchesPromise = fetch('data/matchteams.json').then(r => r.json());

  /* kill share donut */
  /* Donuts stay readable up to five slices; the rest collapse into "others". */
  const ranked = roster.slice().sort((a, b) => b.s.kills - a.s.kills);
  const head = ranked.slice(0, 5);
  const tail = ranked.slice(5);
  const shareSlices = head.map((p, i) => ({
    label: p.name, value: p.s.kills, color: colorShade(team.color, i, Math.max(2, head.length + (tail.length ? 1 : 0))),
  }));
  if (tail.length) {
    shareSlices.push({
      label: `${tail.length} others`,
      value: tail.reduce((a, p) => a + p.s.kills, 0),
      color: colorShade(team.color, head.length, head.length + 1),
    });
  }

  /* placement distribution */
  const matrix = store.analytics.placementMatrix[scope][team.id] || [];
  const placementRows = matrix.map((count, i) => ({
    label: `#${i + 1}`, value: count, color: i === 0 ? '#ffcf5c' : i < 4 ? '#43d17c' : i < 8 ? '#6f8cff' : '#3b4457',
  }));

  /* radar vs field */
  const radar = teamRadar(team, s, allTeams);

  const trends = lineChart({
    series: [
      { name: 'Points', color: team.color, values: s.pointsSeries, width: 2.4 },
      { name: 'Kills', color: '#35d0ba', values: s.killsSeries, width: 1.6 },
    ],
    labels: matches.map(m => m.short),
    height: 250,
  });

  const rankTrend = lineChart({
    series: [{ name: 'Placement', color: '#ffb02e', values: s.rankSeries.map(r => 17 - r), width: 2.2 }],
    labels: matches.map(m => m.short),
    height: 200,
    valueFmt: v => `#${17 - v}`,
  });

  return {
    html: `${nav}${hero}${tiles}
      ${panel('Roster', dataTable(roster, rosterCols, {
      sortCol: 1, href: p => `#/players/${p.id}`, caption: `${team.name} roster`,
    }), { icon: 'users' })}
      <div class="grid g-2-1">
        ${panel('Points and kills by game', trends + `<div class="legend" style="margin-top:8px">
          <span><span class="sw" style="background:${team.color}"></span>Points</span>
          <span><span class="sw" style="background:#35d0ba"></span>Kills</span></div>`,
      { icon: 'trophy', note: 'Points and kills earned in each game of this stage.' })}
        ${panel('Kill share', `<div style="display:flex;justify-content:center">${donut({
        slices: shareSlices, size: 200,
        center: { top: num(s.kills), bottom: 'team kills' },
      })}</div>
        <div class="legend" style="margin-top:12px;justify-content:center">${shareSlices.map(sl =>
        `<span><span class="sw" style="background:${sl.color}"></span>${esc(sl.label)} ${sl.value}</span>`).join('')}</div>`)}
      </div>
      <div class="grid g-1-2">
        ${panel('Strengths vs field', radar.html, { note: radar.note })}
        ${panel('Placement profile', barChart({ rows: placementRows, horizontal: false, height: 210 }) +
          `<div class="tiny dim">How often the team finished in each position across ${s.matches} matches.</div>` +
          `<div style="margin-top:14px">${rankTrend}</div>
          <div class="tiny dim">Placement over time (higher is better).</div>`)}
      </div>
      ${panel('Game log', `<div id="team-log">${skeleton('row', 8)}</div>`, { icon: 'clock' })}`,
    async mount(root) {
      const matchTeams = await teamMatchesPromise;
      const logRows = matches.map(m => {
        const rec = (matchTeams[m.key] || []).find(t => t.id === team.id);
        return rec ? { m, rec } : null;
      }).filter(Boolean);
      const cols = [
        {
          label: 'Match', left: true, get: r => r.m.order, fmt: (v, r) =>
            `<a href="#/matches/${r.m.key}"><b>${esc(r.m.displayTitle)}</b></a>
             <span class="tiny dim"> ${dateOf(r.m.startTime)}</span>`,
        },
        { label: '#', get: r => r.rec.rank, cls: 'rank', fmt: v => v },
        { label: 'Kills', get: r => r.rec.kills },
        { label: 'Place pts', get: r => r.rec.placementPoints },
        { label: 'Points', get: r => r.rec.points, cls: 'strong' },
        { label: 'Damage', get: r => r.rec.damage },
        { label: 'KO', get: r => r.rec.knockouts },
        { label: 'Alive at end', get: r => r.rec.survivors, fmt: v => v ? `${v}` : '<span class="dim">0</span>' },
        { label: 'Last man', get: r => r.rec.lastSurvival, fmt: v => dur(v), title: 'Longest survival time in the squad' },
        {
          label: 'MVP', left: true, get: r => r.m.mvp?.teamId === team.id ? 1 : 0,
          fmt: (v, r) => v ? `<span class="badge gold">${esc(r.m.mvp.name)}</span>` : '<span class="dim">—</span>',
        },
      ];
      root.querySelector('#team-log').innerHTML = dataTable(logRows, cols, {
        sortCol: 0, sortDir: 'asc', href: r => `#/matches/${r.m.key}`,
        rowClass: r => rankClass(r.rec.rank),
      });
      bindTables(root.querySelector('#team-log'));
      bindTooltips(root.querySelector('#team-log'));
    },
  };
}

function teamRadar(team, s, allTeams) {
  const axes = [
    { label: 'Points / match', short: 'PTS', get: t => t.s.pointsPerMatch },
    { label: 'Kills / match', short: 'KILLS', get: t => t.s.killsPerMatch },
    { label: 'Damage / match', short: 'DMG', get: t => t.s.damagePerMatch },
    { label: 'Placement (inverted)', short: 'PLACE', get: t => 17 - (t.s.avgRank || 16) },
    { label: 'Knock → kill %', short: 'CONV', get: t => t.s.knockConversion },
    { label: 'Revives / match', short: 'REV', get: t => t.s.rescues / Math.max(1, t.s.matches) },
    { label: 'Steadiness', short: 'STEADY', get: t => -(t.s.consistency || 0) },
  ];
  const norm = axes.map(a => {
    const vals = allTeams.map(a.get);
    return { min: Math.min(...vals), max: Math.max(...vals) };
  });
  const values = axes.map((a, i) => {
    const v = a.get({ s });
    const { min, max } = norm[i];
    return max === min ? 0.5 : (v - min) / (max - min);
  });
  const display = axes.map(a => {
    const v = a.get({ s });
    return a.short === 'PLACE' ? `#${num(17 - v, 2)}` : num(v, 2);
  });
  const avgValues = axes.map((a, i) => {
    const vals = allTeams.map(a.get);
    const mean = vals.reduce((x, y) => x + y, 0) / vals.length;
    const { min, max } = norm[i];
    return max === min ? 0.5 : (mean - min) / (max - min);
  });
  return {
    html: radarChart({
      axes,
      size: 320,
      series: [
        { name: 'Field average', color: '#6d7a91', values: avgValues, display: axes.map(() => 'avg') },
        { name: team.name, color: team.color, values, display },
      ],
    }) + `<div class="legend" style="justify-content:center;margin-top:8px">
      <span><span class="sw" style="background:${team.color}"></span>${esc(team.name)}</span>
      <span><span class="sw" style="background:#6d7a91"></span>Field average</span></div>`,

  };
}

function colorShade(hex, i, n) {
  const t = n <= 1 ? 0 : i / (n - 1);
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  const f = c => Math.round(c + (230 - c) * t * 0.72);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function notFound(id) {
  return `<div class="empty"><h2>Team not found</h2>
    <p class="muted">No team with id <code>${esc(id)}</code>.</p>
    <p><a href="#/teams">All teams</a></p></div>`;
}
