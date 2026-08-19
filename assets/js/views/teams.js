/* Team index: cards for browsing, table for comparing. */

import { store } from '../store.js';
import { esc, num, panel, crest, flagImg, rgba, dataTable, barCell } from '../ui.js';
import { sparkline } from '../charts.js';
import { pageHead, scopeName } from './common.js';

export async function render({ scope }) {
  const teams = store.teamsIn(scope).sort((a, b) => a.s.rank - b.s.rank);
  const maxPoints = Math.max(...teams.map(t => t.s.finalPoints));

  const cards = teams.map(t => {
    const rankBadgeCls = t.s.rank === 1 ? 'gold' : t.s.rank === 2 ? 'silver' : t.s.rank === 3 ? 'bronze' : '';
    return `<a class="card" href="#/teams/${t.id}">
      <div class="glow" style="background:${rgba(t.color, .55)}"></div>
      <div class="card-head">
        ${crest(t, 'lg')}
        <div style="min-width:0">
          <span class="badge ${rankBadgeCls}" style="margin-bottom:4px">#${t.s.rank} · ${esc(t.tag)}</span>
          <div class="name" style="font-size:18px">${esc(t.name)}</div>
          <div class="tiny muted" style="margin-top:2px">${flagImg(t)} ${t.s.matches} matches · ${t.roster.length} players</div>
        </div>
      </div>
      <div class="card-stats">
        <div><div class="k">Points</div><div class="v" style="color:var(--accent)">${num(t.s.finalPoints)}</div></div>
        <div><div class="k">Kills</div><div class="v">${num(t.s.kills)}</div></div>
        <div><div class="k">WWCD</div><div class="v">${t.s.wwcd ? `<span class="gold">${t.s.wwcd} 🍗</span>` : '0'}</div></div>
      </div>
      <div style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;position:relative">
        ${sparkline(t.s.cumulativePoints, { color: t.color, width: 140, height: 26 })}
        <span class="badge" style="font-size:11px">Avg #${num(t.s.avgRank, 1)}</span>
      </div>
    </a>`;
  }).join('');

  const cols = [
    {
      label: '#', get: t => t.s.rank, cls: 'rank', left: true,
      fmt: v => {
        if (v === 1) return `<span class="badge gold" style="min-width:30px;justify-content:center;font-weight:800">#1</span>`;
        if (v === 2) return `<span class="badge silver" style="min-width:30px;justify-content:center;font-weight:800">#2</span>`;
        if (v === 3) return `<span class="badge bronze" style="min-width:30px;justify-content:center;font-weight:800">#3</span>`;
        return `<span style="padding-left:6px">#${v}</span>`;
      },
    },
    {
      label: 'Team', left: true, get: t => t.name, fmt: (v, t) => `<a class="ident" href="#/teams/${t.id}">
        <span class="accent-bar" style="background:${esc(t.color)}"></span>
        ${crest(t, 'sm')}<span class="name">${esc(t.name)}</span></a>`,
    },
    { label: 'M', get: t => t.s.matches },
    {
      label: 'Points', get: t => t.s.finalPoints, cls: 'strong',
      fmt: (v, t) => barCell(v, maxPoints, rgba(t.color, .95)),
    },
    { label: 'Pts/M', get: t => t.s.pointsPerMatch, fmt: v => num(v, 2) },
    { label: 'Place', get: t => t.s.placementPoints },
    { label: 'Kills', get: t => t.s.kills },
    { label: 'K/M', get: t => t.s.killsPerMatch, fmt: v => num(v, 2) },
    {
      label: 'WWCD', get: t => t.s.wwcd,
      fmt: v => v ? `<span class="badge gold" style="padding:1px 6px;font-size:11px">${v} 🍗</span>` : '<span class="dim">0</span>',
    },
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
      title: 'Squads & Teams',
      sub: `Performance profiles, combat metrics, and rosters for all ${teams.length} competing esports organizations.`,
      metaBadges: [
        { text: `${teams.length} Squads`, cls: 'gold' },
        { text: `Ranked by Points`, cls: '' },
        { text: `Phase: ${esc(scopeName(scope))}`, cls: '' },
      ],
      aside: `<a class="chip on" href="#/compare/teams">Head-to-Head Compare →</a>`,
    })}
    <div class="cards">${cards}</div>
    ${panel('Team Comprehensive Statistics', dataTable(teams, cols, {
      sortCol: 0, sortDir: 'asc', href: t => `#/teams/${t.id}`,
    }), { icon: 'trophy', note: 'Click any column header to re-sort.' })}`,
  };
}
