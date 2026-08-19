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

  const hero = `<section class="hero-banner">
    <div class="hero-glow-bg" style="background:radial-gradient(circle, ${rgba(rows[0]?.color || '#ffb02e', .35)}, transparent 65%)"></div>
    <div style="position:relative;display:flex;gap:24px;flex-wrap:wrap;align-items:center;justify-content:space-between">
      <div style="flex:1;min-width:280px">
        <div class="crumb">
          <span class="badge gold">${esc(meta.tournament.label)}</span>
          <span class="badge">${esc(scopeName(scope))} Stage</span>
        </div>
        <h1 style="font-size:clamp(2rem, 3.8vw, 2.75rem);margin:6px 0 10px;letter-spacing:-.01em">PUBG Mobile Esports Analytics</h1>
        <p class="muted prose" style="margin:0;font-size:15px">
          Live tournament telemetry and performance metrics for the <b>${esc(scopeName(scope))}</b> stage:
          <b>${summary.matches}</b> matches, <b>${rows.length}</b> professional squads, and <b>${players.length}</b> competing athletes.
        </p>

        <div class="rules-chips" style="margin:14px 0 14px">
          ${Object.entries(meta.scoring.placement).slice(0, 4).map(([k, v]) =>
            `<span class="rule-chip r${k}"><span class="pos">#${k}</span><span class="pts">${v} pts</span></span>`
          ).join('')}
          <span class="rule-chip kill"><span class="pos">⚡ Kill</span><span class="pts">+${meta.scoring.perKill} pt</span></span>
          <a class="chip" href="#/standings" style="padding:4px 10px;font-size:12px;font-weight:700">Full Rules →</a>
        </div>

        <div class="meta-strip">
          <span class="meta-pill">Matches Completed: <b>${summary.matches}</b></span>
          <span class="meta-pill">Kill Feed Coverage: <b>${Math.round((meta.dataQuality.killLogCoverage || 0) * 100)}%</b></span>
          <span class="meta-pill">Updated: <b>${esc(meta.generatedAt.replace('T', ' ').slice(0, 16))} UTC</b></span>
        </div>
      </div>

      ${rows[0] ? `<a class="hero-leader-card" href="#/teams/${rows[0].id}">
        ${crest(store.team(rows[0].id), 'lg')}
        <div>
          <div class="badge gold" style="font-size:10px;margin-bottom:4px">👑 STAGE LEADER</div>
          <div style="font-family:var(--display);font-size:24px;font-weight:800">${esc(rows[0].name)}</div>
          <div class="tiny muted">${rows[0].wwcd} WWCD · ${rows[0].kills} kills · avg #${num(rows[0].avgRank, 1)}</div>
          <div class="hero-figure">${num(rows[0].finalPoints)}</div>
          <div class="tiny dim up">Total Points</div>
        </div>
      </a>` : ''}
    </div>
  </section>`;

  const tiles = `<div class="tiles">
    ${tile('Total Games', num(summary.matches), `${esc(scopeName(scope))} stage`, 'accent')}
    ${tile('Total Eliminations', num(summary.kills), `${num(summary.killsPerMatch)} per match`)}
    ${tile('Total Combat Damage', num(summary.damage), `${num(summary.damage / Math.max(1, summary.matches), 0)} per match`)}
    ${tile('Avg Match Length', dur(summary.avgDuration), 'drop to final circle')}
    ${tile('Zone Eliminations', num(summary.zoneDeaths), 'players lost to blue zone')}
    ${tile('Feed Accuracy', pct((summary.killLogCoverage || 0) * 100, 0), 'events mapped to kills')}
  </div>`;

  const podium = `<div class="podium">
    ${[1, 0, 2].map(i => {
      const r = top[i];
      if (!r) return '<div></div>';
      const t = store.team(r.id);
      const posLabels = ['1st Place', '2nd Place', '3rd Place'];
      const posBadges = ['gold', 'silver', 'bronze'];
      const pos = posLabels[r.rank - 1] || `${r.rank}th Place`;
      return `<a class="slot p${r.rank}" href="#/teams/${r.id}">
        <div style="position:absolute;inset:-50% 30% 60% -30%;background:radial-gradient(circle,${rgba(r.color, .35)},transparent 70%);filter:blur(30px)"></div>
        <div style="position:relative">
          <span class="badge ${posBadges[r.rank - 1] || ''}" style="margin-bottom:8px">${r.rank === 1 ? '👑 ' : ''}${pos}</span>
          <div style="margin:12px 0 8px">${crest(t, r.rank === 1 ? 'lg' : '')}</div>
          <div style="font-family:var(--display);font-size:${r.rank === 1 ? 23 : 19}px;font-weight:800">${esc(r.name)}</div>
          <div class="tiny muted" style="margin-top:2px">${flagImg(t)} ${esc(r.tag)}</div>
          <div class="num" style="font-size:28px;font-weight:800;margin-top:10px;color:var(--text)">${num(r.finalPoints)}<span class="tiny dim"> pts</span></div>
          <div class="tiny dim" style="margin-top:2px">${r.wwcd} WWCD · ${r.kills} kills · avg #${num(r.avgRank, 1)}</div>
        </div>
      </a>`;
    }).join('')}
  </div>`;

  /* points race */
  const race = raceChart(scope);

  const leaders = panel('Standout Performers', `
    <div class="cards">
      ${[
        ['Top Rated', bestPlayer, p => `${num(p.s.rating, 1)} rating`, p => `${num(p.s.killsPerMatch, 2)} K/M · ${num(p.s.damagePerMatch, 0)} DMG/M`, 'gold'],
        ['Most Kills', topFragger, p => `${p.s.kills} kills`, p => `${num(p.s.kpRate, 1)}% of team kills`, 'bad'],
        ['Most Damage', topDamage, p => `${num(p.s.damage)} dmg`, p => `${num(p.s.damagePerMatch, 0)} per match`, 'good'],
        ['Best Support', topSupport, p => `${p.s.assists} assists`, p => `${p.s.rescues} revives`, 'silver'],
        ['Longest Snipe', longest, p => `${num(p.s.longestKill)} m`, p => `${p.s.kills} kills total`, 'bronze'],
      ].filter(([, p]) => p).map(([label, p, big, sub, badgeCls]) => {
        const t = store.team(p.teamId);
        return `<a class="card" href="#/players/${p.id}">
          <div class="glow" style="background:${rgba(t?.color || '#6f8cff', .5)}"></div>
          <div class="card-head">
            ${avatar(p, t, 'lg')}
            <div style="min-width:0">
              <span class="badge ${badgeCls}" style="margin-bottom:4px;font-size:10px">${esc(label)}</span>
              <div class="name">${esc(p.name)}</div>
              <div class="tiny muted">${esc(p.teamName || '')}</div>
            </div>
          </div>
          <div class="card-stats" style="grid-template-columns:1fr 1fr">
            <div><div class="k">Headline Stat</div><div class="v" style="color:var(--accent)">${big(p)}</div></div>
            <div><div class="k">Context</div><div class="v" style="font-size:12px">${sub(p)}</div></div>
          </div>
        </a>`;
      }).join('')}
    </div>`, { icon: 'users' });

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
