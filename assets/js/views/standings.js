/* Full standings for the active scope, plus the per-match placement grid that
   shows how each team actually got there. */

import { store } from '../store.js';
import { esc, num, panel, rgba, crest, dataTable, scoringRibbon } from '../ui.js';
import { lineChart, heatmap, ramp } from '../charts.js';
import { pageHead, standingsTable, scopeName } from './common.js';

export async function render({ scope }) {
  const rows = store.standingsIn(scope);
  const matches = store.matchesIn(scope);
  const meta = store.meta;

  const matchTeams = await fetch('data/matchteams.json').then(r => r.json());

  const grid = placementGrid(rows, matches, matchTeams);
  const race = lineChart({
    series: rows.slice(0, 16).map(r => ({
      name: r.name, color: r.color, values: r.cumulativePoints,
      width: r.rank <= 3 ? 2.6 : 1.4,
    })),
    labels: matches.map(m => m.short),
    height: 340,
  });

  return {
    html: `${pageHead({
      crumb: `${esc(meta.tournament.label)} · ${esc(scopeName(scope))}`,
      title: 'Tournament Standings',
      sub: `Overall leaderboard, points progression, and per-match performance across all ${matches.length} stage matches.`,
      metaBadges: [
        { text: `${rows.length} Teams`, cls: 'gold' },
        { text: `${matches.length} Matches`, cls: '' },
        { text: `Phase: ${esc(scopeName(scope))}`, cls: '' },
      ],
    })}
    ${scoringRibbon(meta.scoring, {
      stageLabel: scopeName(scope),
      teamsCount: rows.length,
      matchesCount: matches.length,
    })}
    ${panel('Official Leaderboard', standingsTable(scope), {
      icon: 'trophy',
      note: 'Ranked by total points. Top 3 receive gold, silver and bronze broadcast tiers. Click any team row to view roster and game logs.',
    })}
    ${panel('Points race progression', race + legend(rows), {
      icon: 'activity',
      note: 'Cumulative points trajectory after every match in this stage.',
    })}
    ${panel('Match-by-match placement grid', grid, {
      icon: 'target',
      note: 'Every team’s finish in every match — cell color intensity reflects placement points earned. Hover a cell for full match details.',
    })}`,
  };
}

function legend(rows) {
  return `<div class="legend" style="margin-top:10px">${rows.map(r =>
    `<span><span class="sw" style="background:${r.color}"></span>${esc(r.tag)}</span>`).join('')}</div>`;
}

function placementGrid(rows, matches, matchTeams) {
  const cols = matches.map(m => m.short);
  const values = rows.map(r => matches.map(m => {
    const rec = (matchTeams[m.key] || []).find(t => t.id === r.id);
    return rec ? rec.rank : null;
  }));
  const points = rows.map(r => matches.map(m => {
    const rec = (matchTeams[m.key] || []).find(t => t.id === r.id);
    return rec ? rec.points : 0;
  }));
  const maxPoints = Math.max(1, ...points.flat());

  return heatmap({
    rows,
    cols,
    values,
    rowLabel: r => `<a class="ident" href="#/teams/${r.id}" style="gap:6px">
      ${crest(store.team(r.id), 'sm')}<span class="name" style="font-size:12px">${esc(r.tag)}</span></a>`,
    colorFor: (v, ri, ci) => v === null ? 'var(--panel-2)' : ramp(points[ri][ci] / maxPoints, rows[ri].color),
    cellTip: (r, c, v, ri, ci) => {
      const m = matches[ci];
      const rec = (matchTeams[m.key] || []).find(t => t.id === r.id);
      if (!rec) return `${r.name}: did not play`;
      return `<b>${esc(r.name)}</b><br>${esc(m.displayTitle)}<br>#${rec.rank} · ${rec.kills} kills · ${rec.points} pts`;
    },
  });
}
