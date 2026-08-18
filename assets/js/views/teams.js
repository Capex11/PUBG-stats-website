/* Team index: cards for browsing, table for comparing. */

import { store } from '../store.js';
import { esc, num, panel, crest, flagImg, rgba, dataTable, barCell } from '../ui.js';
import { sparkline } from '../charts.js';
import { pageHead, scopeName } from './common.js';

export async function render({ scope }) {
  const teams = store.teamsIn(scope).sort((a, b) => a.s.rank - b.s.rank);
  const maxPoints = Math.max(...teams.map(t => t.s.finalPoints));

  const cards = teams.map(t => `<a class="card" href="#/teams/${t.id}">
    <div class="glow" style="background:${rgba(t.color, .55)}"></div>
    <div class="card-head">
      ${crest(t, 'lg')}
      <div style="min-width:0">
        <div class="tiny up dim">#${t.s.rank} · ${esc(t.tag)}</div>
        <div class="name">${esc(t.name)}</div>
        <div class="tiny muted">${flagImg(t)} ${t.s.matches} matches · ${t.roster.length} players</div>
      </div>
    </div>
    <div class="card-stats">
      <div><div class="k">Points</div><div class="v">${num(t.s.finalPoints)}</div></div>
      <div><div class="k">Kills</div><div class="v">${num(t.s.kills)}</div></div>
      <div><div class="k">WWCD</div><div class="v">${t.s.wwcd}</div></div>
    </div>
    <div style="margin-top:10px;display:flex;align-items:center;gap:8px;position:relative">
      ${sparkline(t.s.cumulativePoints, { color: t.color, width: 150, height: 26 })}
      <span class="tiny dim">avg #${num(t.s.avgRank, 1)}</span>
    </div>
  </a>`).join('');

  const cols = [
    { label: '#', get: t => t.s.rank, cls: 'rank', left: true, fmt: v => v },
    {
      label: 'Team', left: true, get: t => t.name, fmt: (v, t) => `<a class="ident" href="#/teams/${t.id}">
        ${crest(t, 'sm')}<span class="name">${esc(t.name)}</span></a>`,
    },
    { label: 'M', get: t => t.s.matches },
    {
      label: 'Points', get: t => t.s.finalPoints, cls: 'strong',
      fmt: (v, t) => barCell(v, maxPoints, rgba(t.color, .9)),
    },
    { label: 'Pts/M', get: t => t.s.pointsPerMatch, fmt: v => num(v, 2) },
    { label: 'Place', get: t => t.s.placementPoints },
    { label: 'Kills', get: t => t.s.kills },
    { label: 'K/M', get: t => t.s.killsPerMatch, fmt: v => num(v, 2) },
    { label: 'WWCD', get: t => t.s.wwcd },
    { label: 'Top 4', get: t => t.s.top4 },
    { label: 'Avg #', get: t => t.s.avgRank, fmt: v => num(v, 2), title: 'Average placement' },
    { label: 'DMG/M', get: t => t.s.damagePerMatch, fmt: v => num(v, 0) },
    { label: 'K/KO', get: t => t.s.kills / Math.max(1, t.s.knockouts), fmt: v => num(v, 2), title: 'Kills per knockdown the team dealt' },
    { label: 'Revives', get: t => t.s.rescues },
    { label: 'σ pts', get: t => t.s.consistency, fmt: v => num(v, 2), title: 'Standard deviation of points per match — lower is steadier' },
  ];

  return {
    html: `${pageHead({
      crumb: `${esc(store.meta.tournament.label)} · ${esc(scopeName(scope))}`,
      title: 'Teams',
      sub: `${teams.length} teams, ranked by points in this stage.`,
      aside: `<a class="chip" href="#/compare">Compare teams →</a>`,
    })}
    <div class="cards">${cards}</div>
    ${panel('Team stats', dataTable(teams, cols, {
      sortCol: 0, sortDir: 'asc', href: t => `#/teams/${t.id}`,
    }), { note: 'Click any column header to re-sort.' })}`,
  };
}
