/* One player: identity, headline stats, percentile profile, match log, trends,
   and their kill-feed fingerprint (distance + timing) when the feed covers them. */

import { store } from '../store.js';
import {
  esc, num, pct, dur, panel, tile, crest, avatar, rgba, el, els,
  dataTable, rankClass, bindTables, bindTooltips, skeleton,
} from '../ui.js';
import { radarChart, lineChart, donut, barChart } from '../charts.js';
import { pageHead, scopeName, weaponName, weaponsNamed } from './common.js';
import { icon } from '../icons.js';

export async function render({ params, scope }) {
  const player = store.player(params[0]);
  if (!player) {
    return {
      html: `<div class="empty"><h2>Player not found</h2>
        <p class="muted">No player with id <code>${esc(params[0])}</code>.</p>
        <p><a href="#/players">All players</a></p></div>`,
    };
  }
  const s = player.stages[scope];
  const team = store.team(player.teamId);
  if (!s) {
    return {
      html: `${pageHead({ crumb: 'Player', title: player.name })}
        <div class="empty">${esc(player.name)} has no matches in ${esc(scopeName(scope))}.</div>`,
    };
  }

  const field = store.playersIn(scope);
  const rankOf = key => {
    const sorted = field.slice().sort((a, b) => (b.s[key] || 0) - (a.s[key] || 0));
    return sorted.findIndex(p => p.id === player.id) + 1;
  };

  const ranked = field.slice().sort((a, b) => (b.s.rating || 0) - (a.s.rating || 0));
  const at = ranked.findIndex(p => p.id === player.id);
  const prev = ranked[at - 1];
  const next = ranked[at + 1];
  const nav = `<div class="chips" style="margin-bottom:var(--s-4)">
    ${prev ? `<a class="chip" href="#/players/${prev.id}">${icon('chevronLeft', { size: 14 })} ${esc(prev.name)}</a>` : ''}
    ${next ? `<a class="chip" href="#/players/${next.id}">${esc(next.name)} ${icon('chevronRight', { size: 14 })}</a>` : ''}
    <a class="chip" href="#/compare/players/${player.id}${next ? ',' + next.id : (prev ? ',' + prev.id : '')}">Compare</a>
    ${team ? `<a class="chip" href="#/teams/${team.id}">${esc(team.name)}</a>` : ''}
  </div>`;

  const hero = `<section class="hero-banner">
    <div class="hero-glow-bg" style="background:radial-gradient(circle, ${rgba(team?.color || '#6f8cff', .45)}, transparent 65%)"></div>
    <div style="position:relative;display:flex;gap:24px;align-items:center;flex-wrap:wrap;justify-content:space-between">
      <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
        ${avatar(player, team, 'xl')}
        <div style="min-width:240px">
          <div class="crumb">
            <span class="badge gold">${esc(store.meta.tournament.label)}</span>
            <span class="badge">${esc(scopeName(scope))}</span>
          </div>
          <h1 style="font-size:clamp(2rem, 3.5vw, 2.6rem);margin:4px 0 8px">${esc(player.name)}</h1>
          <div class="chips">
            ${team ? `<a class="badge" href="#/teams/${team.id}" style="gap:6px">${crest(team, 'sm')} ${esc(team.name)}</a>` : ''}
            <span class="badge">UID: ${esc(player.uid)}</span>
            <span class="badge">${s.matches} Matches</span>
            ${s.mvps ? `<span class="badge gold">${s.mvps} Match MVP${s.mvps > 1 ? 's' : ''} 🍗</span>` : ''}
          </div>
        </div>
      </div>
      <div style="text-align:right;background:var(--panel-2);padding:14px 20px;border-radius:var(--radius);border:1px solid var(--line-soft)">
        <div class="tiny up dim">Overall Production Rating</div>
        <div class="hero-figure" style="font-size:3rem;margin:2px 0;color:var(--accent)">${num(s.rating, 1)}</div>
        <div class="tiny muted"><span class="badge gold" style="font-size:10px">#${s.ratingRank}</span> in field (${field.length} players)</div>
      </div>
    </div>
  </section>`;

  const tiles = `<div class="tiles">
    ${tile('Total Kills', num(s.kills), `#${rankOf('kills')} in field · ${num(s.killsPerMatch, 2)} / match`, 'accent')}
    ${tile('Combat Damage', num(s.damage), `#${rankOf('damage')} in field · ${num(s.damagePerMatch, 0)} / match`)}
    ${tile('K/D Ratio', num(s.kd, 2), `${s.deaths} deaths in ${s.matches} matches`)}
    ${tile('Team Kill Share', pct(s.kpRate), `#${rankOf('kpRate')} share in field`)}
    ${tile('Knockdowns', num(s.knockouts), `${num(s.kills / Math.max(1, s.knockouts), 2)} kills per knockdown`)}
    ${tile('Assists', num(s.assists), `${num(s.assistsPerMatch, 2)} assists / match`)}
    ${tile('Squad Revives', num(s.rescues), `${s.selfRescues} self-revives`)}
    ${tile('Avg Survival Time', dur(s.avgSurvival), `endgame rate ${pct(s.survivalRate)}`)}
    ${tile('Headshot Ratio', num(s.headshots), `${pct(s.hsRate)} of all kills`)}
    ${tile('Longest Snipe', `${num(s.longestKill)} m`, `#${rankOf('longestKill')} in field`)}
    ${tile('Damage / Kill', num(s.damagePerKill, 0), `${num(s.damageTaken)} dmg taken`)}
    ${tile('Utility Deployed', num(s.throwables), `${s.frags} frags · ${s.smokes} smokes · ${s.molotovs} molotovs`)}
  </div>`;

  const radar = percentileRadar(player, s, field, team);
  const matches = store.matchesIn(scope);
  const labels = matches.map(m => m.short);

  const trend = lineChart({
    series: [
      { name: 'Kills', color: team?.color || '#6f8cff', values: s.killsSeries, width: 2.4 },
      { name: 'Damage / 100', color: '#35d0ba', values: s.damageSeries.map(v => v / 100), width: 1.6 },
    ],
    labels, height: 250,
  });

  const survival = lineChart({
    series: [{ name: 'Survival (min)', color: '#ffb02e', values: s.survivalSeries.map(v => v / 60), width: 2 }],
    labels, height: 200, area: true, valueFmt: v => num(v, 0),
  });

  return {
    html: `${nav}${hero}${tiles}
      <div class="grid g-1-2">
        ${panel('Percentile profile', radar.html, { icon: 'target', note: radar.note })}
        ${panel('Form', trend + `<div class="legend" style="margin-top:8px">
            <span><span class="sw" style="background:${team?.color || '#6f8cff'}"></span>Kills</span>
            <span><span class="sw" style="background:#35d0ba"></span>Damage ÷ 100</span></div>
          <div style="margin-top:16px">${survival}</div>
          <div class="tiny dim">Survival time per match, in minutes.</div>`)}
      </div>
      ${panel('Game log', `<div id="p-log">${skeleton('row', 6)}</div>`, { icon: 'clock' })}
      ${panel('Kill-feed fingerprint', `<div id="p-feed">${skeleton('panel', 1)}</div>`, {
        note: 'Built from in-game kill-feed events credited to this player. The feed is incomplete for some matches, so totals here can be lower than the stat lines above.',
      })}`,
    async mount(root) {
      const log = await fetch('data/playerlog.json').then(r => r.json());
      const rows = (log[player.id] || []).filter(r => r.stage === scope);
      const cols = [
        {
          label: 'Game', left: true, get: r => r.order,
          fmt: (v, r) => `<a href="#/matches/${r.match}"><b>${esc(r.title)}</b></a>
            ${r.mvp ? ' <span class="badge gold">MVP</span>' : ''}`,
        },
        { label: 'Team #', get: r => r.teamRank, cls: 'rank', fmt: v => v },
        { label: 'Kills', get: r => r.kills, cls: 'strong' },
        { label: 'KP%', get: r => r.kp, fmt: v => num(v, 1) },
        { label: 'Damage', get: r => r.damage },
        { label: 'KO', get: r => r.knockouts },
        { label: 'A', get: r => r.assists },
        { label: 'REV', get: r => r.rescues },
        { label: 'HS', get: r => r.headshots },
        { label: 'Longest', get: r => r.longest, fmt: v => `${num(v)} m` },
        { label: 'Survival', get: r => r.survival, fmt: v => dur(v) },
        { label: 'End', get: r => r.died ? 0 : 1, fmt: v => v ? '<span class="good">alive</span>' : '<span class="dim">dead</span>' },
      ];
      const box = el('#p-log', root);
      box.innerHTML = dataTable(rows, cols, {
        sortCol: 0, sortDir: 'asc', href: r => `#/matches/${r.match}`,
        rowClass: r => rankClass(r.teamRank),
      });
      bindTables(box);
      bindTooltips(box);

      renderFeed(root, player, scope);
    },
  };
}

/* Where this player's kills come from, from the precomputed kill-feed digest. */
async function renderFeed(root, player, scope) {
  const all = await fetch('data/playerfeed.json').then(r => r.json());
  const f = all[player.id]?.[scope];
  const box = el('#p-feed', root);
  if (!f || !f.kills) {
    box.innerHTML = '<div class="empty">No kill-feed events credited to this player in this stage.</div>';
    return;
  }
  const distRows = f.distLabels.map((label, i) => ({ label, value: f.dist[i], color: '#6f8cff' }));
  const timeRows = f.timing.map((v, i) => ({ label: `${i * 10}`, value: v, color: '#35d0ba' }));
  const victimRows = Object.entries(f.victims)
    .sort((a, b) => b[1] - a[1])
    .map(([id, v]) => {
      const t = store.team(id);
      return { label: t?.name || id, value: v, color: t?.color || '#8b93a7' };
    });
  const named = weaponsNamed();
  const itemRows = !named ? [] : Object.entries(f.items)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, v]) => ({ label: weaponName(id), value: v, color: '#a97bf0' }));

  box.innerHTML = `<div class="tiles" style="margin-bottom:14px">
      ${tile('Feed kills', num(f.kills), `${num(f.knocks)} knockdowns`)}
      ${tile('Median distance', f.median === null ? '—' : `${num(f.median)} m`,
             f.p90 === null ? '' : `p90 ${num(f.p90)} m`)}
      ${tile('Longest in feed', f.max === null ? '—' : `${num(f.max)} m`, `${f.samples} ranged kills`)}
    </div>
    <div class="grid g2">
      <div><div class="tiny up dim" style="margin-bottom:6px">Kill distance (m)</div>
        ${barChart({ rows: distRows, horizontal: false, height: 180 })}</div>
      <div><div class="tiny up dim" style="margin-bottom:6px">Match progress (%)</div>
        ${barChart({ rows: timeRows, horizontal: false, height: 180 })}</div>
      <div><div class="tiny up dim" style="margin-bottom:6px">Victims by team</div>
        ${barChart({ rows: victimRows.slice(0, 6), horizontal: true, height: Math.max(110, victimRows.slice(0, 6).length * 26) })}</div>
      ${itemRows.length ? `<div><div class="tiny up dim" style="margin-bottom:6px">Weapons used</div>
        ${barChart({ rows: itemRows, horizontal: true, height: Math.max(110, itemRows.length * 26) })}</div>` : ''}
    </div>`;
  bindTooltips(box);
}

function percentileRadar(player, s, field, team) {
  const axes = [
    { label: 'Kills / match', short: 'K/M', key: 'killsPerMatch', d: 2 },
    { label: 'Damage / match', short: 'DMG', key: 'damagePerMatch', d: 0 },
    { label: 'Team kill share', short: 'KP%', key: 'kpRate', d: 1 },
    { label: 'Knockdowns / match', short: 'KO', key: 'knockoutsPerMatch', d: 2 },
    { label: 'Assists / match', short: 'ASSIST', key: 'assistsPerMatch', d: 2 },
    { label: 'Revives / match', short: 'REV', key: 'rescuesPerMatch', d: 2 },
    { label: 'Avg survival', short: 'SURV', key: 'avgSurvival', d: 0 },
    { label: 'Headshot %', short: 'HS%', key: 'hsRate', d: 1 },
  ];
  const values = [];
  const display = [];
  for (const a of axes) {
    const vals = field.map(p => p.s[a.key] || 0).sort((x, y) => x - y);
    const v = s[a.key] || 0;
    const below = vals.filter(x => x < v).length;
    values.push(vals.length ? below / (vals.length - 1 || 1) : 0.5);
    display.push(`${num(v, a.d)} (${Math.round((below / (vals.length - 1 || 1)) * 100)}th pct)`);
  }
  return {
    html: radarChart({
      axes, size: 330,
      series: [
        { name: 'Median player', color: '#6d7a91', values: axes.map(() => 0.5), display: axes.map(() => '50th pct') },
        { name: player.name, color: team?.color || '#6f8cff', values, display },
      ],
    }) + `<div class="legend" style="justify-content:center;margin-top:8px">
      <span><span class="sw" style="background:${team?.color || '#6f8cff'}"></span>${esc(player.name)}</span>
      <span><span class="sw" style="background:#6d7a91"></span>Median player</span></div>`,
    note: 'Each axis is this player’s percentile among everyone who played in this stage.',
  };
}
