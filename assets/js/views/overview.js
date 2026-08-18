/* Landing page: where the tournament stands, who is carrying, what happened. */

import { store } from '../store.js';
import {
  esc, num, pct, dur, dateOf, crest, avatar, flagImg, tile, panel, rgba,
} from '../ui.js';
import { lineChart, barChart, donut, seriesTable, barsTable } from '../charts.js';
import { pageHead, standingsTable, matchList, scopeName, statPill } from './common.js';

export async function render({ scope }) {
  const meta = store.meta;
  const summary = store.analytics.summary[scope];
  const rows = store.standingsIn(scope);
  const players = store.playersIn(scope);
  const top = rows.slice(0, 3);

  const bestPlayer = players.slice().sort((a, b) => (b.s.rating || 0) - (a.s.rating || 0))[0];
  const topFragger = players.slice().sort((a, b) => b.s.kills - a.s.kills)[0];
  const topDamage = players.slice().sort((a, b) => b.s.damage - a.s.damage)[0];
  const topSupport = players.slice().sort((a, b) =>
    (b.s.assists + b.s.rescues * 2) - (a.s.assists + a.s.rescues * 2))[0];
  const longest = players.slice().sort((a, b) => b.s.longestKill - a.s.longestKill)[0];

  const hero = `<section class="panel" style="position:relative;overflow:hidden">
    <div style="position:absolute;inset:-60% 50% 40% -20%;background:radial-gradient(circle,${rgba(rows[0]?.color || '#ffb02e', .25)},transparent 65%);filter:blur(40px)"></div>
    <div style="position:relative;display:flex;gap:22px;flex-wrap:wrap;align-items:center">
      <div style="flex:1;min-width:260px">
        <div class="crumb">${esc(meta.tournament.label)} · ${esc(scopeName(scope))}</div>
        <h1 style="font-size:34px;margin:2px 0 8px">PUBG Mobile esports analytics</h1>
        <p class="muted prose" style="margin:0">
          Every game of the ${esc(scopeName(scope))} stage broken down:
          ${summary.matches} games, ${rows.length} teams, ${players.length} players.
          Scoring is ${Object.entries(meta.scoring.placement).slice(0, 3).map(([k, v]) => `#${k} = ${v}`).join(' · ')}
          … plus ${meta.scoring.perKill} point per kill.
          Switch stage with the ${store.scopes.map(x => esc(x.label)).join(' / ')} buttons above.
        </p>
        <p class="tiny dim" style="margin-top:var(--s-3)">
          ${meta.counts.matches} games across ${meta.stages.map(x => esc(x.label)).join(' and ')} ·
          kill-feed coverage ${Math.round((meta.dataQuality.killLogCoverage || 0) * 100)}% ·
          data generated ${esc(meta.generatedAt.replace('T', ' ').replace('Z', ' UTC'))}
        </p>
      </div>
      ${rows[0] ? `<a href="#/teams/${rows[0].id}" style="display:flex;gap:16px;align-items:center;background:var(--hero-tint);border-radius:var(--radius);padding:14px 18px">
        ${crest(store.team(rows[0].id), 'lg')}
        <div>
          <div class="tiny up dim">${esc(scopeName(scope))} leader</div>
          <div style="font-family:var(--display);font-size:24px;font-weight:700">${esc(rows[0].name)}</div>
          <div class="tiny muted">${rows[0].wwcd} WWCD · ${rows[0].kills} kills · avg #${num(rows[0].avgRank, 1)}</div>
          <div class="hero-figure">${num(rows[0].finalPoints)}</div>
          <div class="tiny dim up">points</div>
        </div>
      </a>` : ''}
    </div>
  </section>`;

  const tiles = `<div class="tiles">
    ${tile('Games', num(summary.matches), `${esc(scopeName(scope))} stage`)}
    ${tile('Total kills', num(summary.kills), `${num(summary.killsPerMatch)} per match`)}
    ${tile('Total damage', num(summary.damage), `${num(summary.damage / Math.max(1, summary.matches), 0)} per match`)}
    ${tile('Avg match length', dur(summary.avgDuration), 'start to final circle')}
    ${tile('Zone deaths', num(summary.zoneDeaths), 'players lost to the blue zone', '')}
    ${tile('Kill-feed coverage', pct((summary.killLogCoverage || 0) * 100, 0), 'events matched to kills')}
  </div>`;

  const podium = `<div class="podium">
    ${[1, 0, 2].map(i => {
      const r = top[i];
      if (!r) return '<div></div>';
      const t = store.team(r.id);
      const pos = ['1st', '2nd', '3rd'][r.rank - 1] || `${r.rank}th`;
      return `<a class="slot p${r.rank}" href="#/teams/${r.id}">
        <div style="position:absolute;inset:-50% 30% 60% -30%;background:radial-gradient(circle,${rgba(r.color, .3)},transparent 70%);filter:blur(30px)"></div>
        <div style="position:relative">
          <div class="pos">${pos}</div>
          <div style="margin:10px 0 6px">${crest(t, r.rank === 1 ? 'lg' : '')}</div>
          <div style="font-family:var(--display);font-size:${r.rank === 1 ? 22 : 18}px;font-weight:700">${esc(r.name)}</div>
          <div class="tiny muted">${flagImg(t)} ${esc(r.tag)}</div>
          <div class="num" style="font-size:26px;margin-top:8px">${num(r.finalPoints)}<span class="tiny dim"> pts</span></div>
          <div class="tiny dim">${r.wwcd} WWCD · ${r.kills} kills · avg #${num(r.avgRank, 1)}</div>
        </div>
      </a>`;
    }).join('')}
  </div>`;

  /* points race */
  const race = raceChart(scope);

  const leaders = panel('Standout players', `
    <div class="cards">
      ${[
        ['Top rated', bestPlayer, p => `${num(p.s.rating, 1)} rating`, p => `${num(p.s.killsPerMatch, 2)} K/M · ${num(p.s.damagePerMatch, 0)} DMG/M`],
        ['Most kills', topFragger, p => `${p.s.kills} kills`, p => `${num(p.s.kpRate, 1)}% of team kills`],
        ['Most damage', topDamage, p => `${num(p.s.damage)} dmg`, p => `${num(p.s.damagePerMatch, 0)} per match`],
        ['Best support', topSupport, p => `${p.s.assists} assists`, p => `${p.s.rescues} revives`],
        ['Longest kill', longest, p => `${num(p.s.longestKill)} m`, p => `${p.s.kills} kills total`],
      ].filter(([, p]) => p).map(([label, p, big, sub]) => {
        const t = store.team(p.teamId);
        return `<a class="card" href="#/players/${p.id}">
          <div class="glow" style="background:${rgba(t?.color || '#6f8cff', .5)}"></div>
          <div class="card-head">
            ${avatar(p, t, 'lg')}
            <div style="min-width:0">
              <div class="tiny up dim">${esc(label)}</div>
              <div class="name">${esc(p.name)}</div>
              <div class="tiny muted">${esc(p.teamName || '')}</div>
            </div>
          </div>
          <div class="card-stats" style="grid-template-columns:1fr 1fr">
            <div><div class="k">Headline</div><div class="v">${big(p)}</div></div>
            <div><div class="k">Context</div><div class="v" style="font-size:12.5px">${sub(p)}</div></div>
          </div>
        </a>`;
      }).join('')}
    </div>`);

  const killShape = killShapePanel(scope);

  return {
    html: `${hero}${tiles}${podium}
      <div class="grid g-2-1">
        ${panel('Points race', race.html, { icon: 'trophy', note: race.note, aside: race.aside })}
        ${panel('Latest games', matchList(scope, 9), {
          icon: 'clock',
          aside: `<a class="chip" href="#/matches">All games</a>`,
        })}
      </div>
      ${leaders}
      <div>
        ${panel('Standings', standingsTable(scope), {
          icon: 'trophy',
          aside: `<a class="chip" href="#/standings">Placement grid and points race</a>`,
          note: 'Click any team for their roster, game log and trends.',
        })}
      </div>
      <div>${killShape}</div>`,
    mount(root) { race.mount?.(root); },
  };
}

/* Cumulative points per team across the scope's matches. */
function raceChart(scope) {
  const rows = store.standingsIn(scope);
  const matches = store.matchesIn(scope);
  const labels = matches.map(m => m.short);
  const show = rows.slice(0, 8);
  const series = show.map(r => ({
    name: r.name,
    color: r.color,
    values: r.cumulativePoints,
    width: r.rank <= 3 ? 2.6 : 1.6,
  }));
  const legend = `<div class="legend" style="margin-top:10px" role="group" aria-label="Show or hide a team">
    ${show.map(r => `<button type="button" aria-pressed="true" data-team="${r.id}">
      <span class="sw" style="background:${r.color}"></span>${esc(r.tag)}</button>`).join('')}
  </div>
  ${seriesTable(labels, series, 'Game')}`;
  return {
    html: lineChart({ series, labels, height: 300, area: false }) + legend,
    note: 'Cumulative points after every match — top eight teams of this stage. Click a team to mute it.',
    aside: '',
    mount(root) {
      root.querySelectorAll('.legend [data-team]').forEach((btn, i) => {
        btn.addEventListener('click', () => {
          const off = btn.getAttribute('aria-pressed') === 'true';
          btn.setAttribute('aria-pressed', String(!off));
          const paths = root.querySelectorAll(`svg.chart path[data-series="${i}"]`);
          paths.forEach(p => { p.style.opacity = off ? '.12' : '1'; });
        });
      });
    },
  };
}

/* Where kills come from: distance profile + timing. */
function killShapePanel(scope) {
  const d = store.analytics.distance[scope];
  const timing = store.analytics.killTiming[scope];
  const w = store.analytics.weapons[scope];
  const distRows = d.labels.map((l, i) => ({
    label: l, value: d.counts[i], color: '#6f8cff',
  }));
  const timeRows = timing.labels.map((l, i) => ({
    label: l.replace('%', ''), value: timing.counts[i], color: '#35d0ba',
  }));
  return panel('Shape of the fighting', `
    <div class="grid g2" style="gap:14px">
      <div>
        <div class="tiny up dim" style="margin-bottom:6px">Kill distance (m)</div>
        ${barChart({ rows: distRows, horizontal: false, height: 190 })}
        <div class="tiny dim">median ${num(d.median)} m · p90 ${num(d.p90)} m · longest ${num(d.max)} m</div>
        ${barsTable(distRows.map(r => ({ label: r.label + ' m', value: r.value })), 'Kills')}
      </div>
      <div>
        <div class="tiny up dim" style="margin-bottom:6px">When kills happen (% of match elapsed)</div>
        ${barChart({ rows: timeRows, horizontal: false, height: 190 })}
        <div class="tiny dim">${num(w.knocks)} knockdowns · ${num(w.playerKills)} eliminations · ${num(w.zoneDeaths)} zone deaths</div>
        ${barsTable(timeRows.map(r => ({ label: r.label + '% elapsed', value: r.value })), 'Kills')}
      </div>
    </div>`, { note: 'From the in-game kill feed. See Analytics for the full breakdown.' });
}
