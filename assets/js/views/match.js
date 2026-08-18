/* One match: podium, team result table, full player scoreboard, kill feed,
   elimination timeline and the weapon/distance breakdown for that game. */

import { store } from '../store.js';
import {
  esc, num, pct, dur, dateOf, timeOf, panel, tile, crest, avatar, rgba,
  dataTable, rankClass, barCell, bindTables, bindTooltips, el, els,
} from '../ui.js';
import { barChart, lineChart } from '../charts.js';
import { pageHead, weaponName, weaponsNamed } from './common.js';
import { icon } from '../icons.js';

export async function render({ params }) {
  const key = params[0];
  const index = store.matchByKey.get(key);
  let m;
  try {
    m = await store.match(key);
  } catch {
    return {
      html: `<div class="empty"><h2>Match not found</h2>
        <p class="muted">No match data for <code>${esc(key)}</code>.</p>
        <p><a href="#/matches">All matches</a></p></div>`,
    };
  }

  const stageGames = store.matchesIn(m.stage);
  const pos = stageGames.findIndex(x => x.key === key);
  const prev = stageGames[pos - 1];
  const next = stageGames[pos + 1];

  const strip = `<nav class="game-strip" aria-label="Jump to another game in this stage">
    ${stageGames.map(g => `<a href="#/matches/${g.key}" class="game-pip${g.key === key ? ' on' : ''}"
      ${g.key === key ? 'aria-current="page"' : ''}
      title="${esc(g.displayTitle)} — won by ${esc(g.winner.name)}">${g.number}</a>`).join('')}
  </nav>`;

  const head = pageHead({
    crumb: `${esc(store.meta.tournament.label)} · ${esc(m.stageLabel)}`,
    title: m.displayTitle,
    sub: `${dateOf(m.startTime)} ${timeOf(m.startTime)} · ${dur(m.duration)} · ${m.teamCount} teams ·
      ${m.playerCount} players · ${m.totalKills} kills${m.map ? ` · ${esc(m.map)}` : ''}`,
    aside: `<div class="chips">
      ${prev ? `<a class="chip" href="#/matches/${prev.key}" rel="prev">${icon('chevronLeft', { size: 14 })} ${esc(prev.displayTitle)}</a>` : ''}
      ${next ? `<a class="chip" href="#/matches/${next.key}" rel="next">${esc(next.displayTitle)} ${icon('chevronRight', { size: 14 })}</a>` : ''}
    </div>`,
  });

  const podium = `<div class="podium">
    ${[1, 0, 2].map(i => {
      const t = m.teams[i];
      if (!t) return '<div></div>';
      const team = store.team(t.id);
      const pos = ['1st', '2nd', '3rd'][t.rank - 1] || `${t.rank}th`;
      const topFrag = t.players[0];
      return `<a class="slot p${t.rank}" href="#/teams/${t.id}">
        <div style="position:absolute;inset:-50% 30% 60% -30%;background:radial-gradient(circle,${rgba(team?.color || '#6f8cff', .3)},transparent 70%);filter:blur(30px)"></div>
        <div style="position:relative">
          <div class="pos">${pos}${t.rank === 1 ? ' · WWCD' : ''}</div>
          <div style="margin:10px 0 6px">${crest(team, t.rank === 1 ? 'lg' : '')}</div>
          <div style="font-family:var(--display);font-size:${t.rank === 1 ? 22 : 18}px;font-weight:700">${esc(t.name)}</div>
          <div class="num" style="font-size:26px;margin-top:6px">${t.points}<span class="tiny dim"> pts</span></div>
          <div class="tiny dim">${t.placementPoints} placement + ${t.kills} kills</div>
          <div class="tiny muted" style="margin-top:6px">top frag ${esc(topFrag?.name || '—')} (${topFrag?.kills ?? 0})</div>
        </div>
      </a>`;
    }).join('')}
  </div>`;

  const tiles = `<div class="tiles">
    ${tile('Kills', m.totalKills, `${num(m.totalKills / m.teamCount, 1)} per team`)}
    ${tile('Damage', num(m.teams.reduce((a, t) => a + t.damage, 0)), 'all teams')}
    ${tile('Knockdowns', num(m.teams.reduce((a, t) => a + t.knockouts, 0)), 'before finishes')}
    ${tile('Length', dur(m.duration), m.fightStartTime ? `first contact ${dur(m.fightStartTime - m.startTime)}` : '')}
    ${m.mvp ? tile('MVP', `<span class="tile-text">${esc(m.mvp.name)}</span>`,
      `${m.mvp.kills} kills · ${num(m.mvp.damage)} dmg`, 'accent') : ''}
    ${tile('Kill feed', `${Math.round((m.killLog.coverage || 0) * 100)}%`, `${m.killLog.events} events logged`)}
  </div>`;

  const maxPoints = Math.max(...m.teams.map(t => t.points));
  const teamCols = [
    { label: '#', get: t => t.rank, cls: 'rank', left: true, fmt: v => v },
    {
      label: 'Team', left: true, get: t => t.name, fmt: (v, t) => {
        const team = store.team(t.id);
        return `<a class="ident" href="#/teams/${t.id}">
          <span class="accent-bar" style="background:${esc(team?.color || '#8b93a7')}"></span>
          ${crest(team, 'sm')}<span class="name">${esc(t.name)}</span></a>`;
      },
    },
    { label: 'Kills', get: t => t.kills },
    { label: 'Place pts', get: t => t.placementPoints },
    {
      label: 'Points', get: t => t.points, cls: 'strong',
      fmt: (v, t) => barCell(v, maxPoints, rgba(store.team(t.id)?.color || '#6f8cff', .9)),
    },
    { label: 'Damage', get: t => t.damage },
    { label: 'KO', get: t => t.knockouts },
    { label: 'A', get: t => t.assists },
    { label: 'REV', get: t => t.rescues },
    { label: 'HS', get: t => t.headshots },
    { label: 'Alive', get: t => t.survivors, title: 'Players alive when the match ended' },
    { label: 'Eliminated', get: t => t.lastSurvival, fmt: v => dur(v), title: 'Time the squad’s last player went down' },
  ];

  const playerRows = m.teams.flatMap(t => t.players.map(p => ({ ...p, team: t })));
  const playerCols = [
    {
      label: 'Player', left: true, get: p => p.name, fmt: (v, p) => {
        const rec = store.player(p.id);
        const team = store.team(p.team.id);
        return `<a class="ident" href="#/players/${p.id}">${avatar(rec, team)}
          <span style="min-width:0"><span class="name">${esc(p.name)}</span>
          <span class="meta">${esc(p.team.name)}</span></span></a>`;
      },
    },
    { label: 'Team #', get: p => p.team.rank, cls: 'rank', fmt: v => v },
    { label: 'Kills', get: p => p.kills, cls: 'strong' },
    { label: 'KP%', get: p => p.kp, fmt: v => num(v, 1), title: 'Share of the squad’s kills' },
    { label: 'Damage', get: p => p.damage },
    { label: 'KO', get: p => p.knockouts },
    { label: 'A', get: p => p.assists },
    { label: 'REV', get: p => p.rescues },
    { label: 'HS', get: p => p.headshots },
    { label: 'Longest', get: p => p.maxKillDistance, fmt: v => `${num(v)} m` },
    { label: 'Survival', get: p => p.survival, fmt: v => dur(v) },
    { label: 'Taken', get: p => p.damageTaken, title: 'Damage taken' },
    { label: 'Heal', get: p => p.heal },
    { label: 'Travel', get: p => p.drive + p.march, fmt: v => `${num(v / 1000, 1)} km` },
    { label: 'End', get: p => p.died ? 0 : 1, fmt: v => v ? '<span class="good">alive</span>' : '<span class="dim">dead</span>' },
  ];

  const feed = killFeed(m);
  const timeline = eliminationTimeline(m);
  const weapons = weaponPanel(m);

  return {
    html: `${head}${strip}${podium}${tiles}
      ${panel('Team results', dataTable(m.teams, teamCols, {
        sortCol: 0, sortDir: 'asc', href: t => `#/teams/${t.id}`,
        rowClass: t => rankClass(t.rank),
        caption: `${m.displayTitle} — team results`,
      }), { icon: 'trophy' })}
      ${panel('Player scoreboard', dataTable(playerRows, playerCols, {
        sortCol: 2, sortDir: 'desc', href: p => `#/players/${p.id}`,
      }), { icon: 'users', note: 'Sorted by kills — click any header to re-sort.' })}
      <div class="grid g-1-2">
        ${panel('Kill feed', feed.html, { icon: 'target', note: feed.note, aside: feed.aside })}
        <div>
          ${panel('Elimination timeline', timeline, { icon: 'clock' })}
          ${weapons}
        </div>
      </div>`,
    mount(root) {
      /* ← / → step through the stage, matching the prev/next chips. */
      const onKey = ev => {
        if (ev.target.matches('input, textarea, select')) return;
        if (ev.key === 'ArrowLeft' && prev) location.hash = `#/matches/${prev.key}`;
        if (ev.key === 'ArrowRight' && next) location.hash = `#/matches/${next.key}`;
      };
      document.addEventListener('keydown', onKey);
      root.addEventListener('pmgo:teardown', () => document.removeEventListener('keydown', onKey));

      const box = el('#feed-list', root);
      if (!box) return;
      els('[data-feed-filter]', root).forEach(btn => btn.addEventListener('click', () => {
        els('[data-feed-filter]', root).forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
        const mode = btn.dataset.feedFilter;
        els('.ev', box).forEach(ev => {
          ev.classList.toggle('hidden', mode !== 'all' && ev.dataset.type !== mode);
        });
      }));
    },
  };
}

function killFeed(m) {
  if (!m.events.length) {
    return {
      html: '<div class="empty">No kill feed was captured for this match.</div>',
      note: '', aside: '',
    };
  }
  const rows = m.events.map(e => {
    const causerTeam = store.teams.find(t => t.name === e.causerTeam);
    const victimTeam = store.teams.find(t => t.name === e.victimTeam);
    const who = e.zone ? '<span class="dim">Blue zone</span>' : esc(e.causer || '?');
    const verb = e.type === 'kill' ? 'eliminated' : 'knocked down';
    return `<div class="ev ${e.type}" data-type="${e.type}">
      <span class="t">${dur(e.t)}</span>
      <span class="who" style="color:${causerTeam?.color || 'inherit'}">${who}</span>
      <span class="verb">${icon(e.type === 'kill' ? 'kill' : 'knock', { size: 13 })}<span class="sr-only">${verb}</span></span>
      <span class="who" style="color:${victimTeam?.color || 'inherit'}">${esc(e.victim || '?')}</span>
      <span class="weapon">${e.distance !== null ? `${num(e.distance)} m` : ''}${
        e.item && weaponsNamed() ? ` · ${esc(weaponName(e.item))}` : ''}</span>
    </div>`;
  }).join('');
  return {
    html: `<div class="feed" id="feed-list">${rows}</div>`,
    note: `${m.killLog.kills} eliminations and ${m.events.length - m.killLog.kills - (m.killLog.zoneDeaths || 0)} knockdowns logged, earliest first.`,
    aside: `<div class="chips" role="group" aria-label="Filter the kill feed">
      <button type="button" class="chip" aria-pressed="true" data-feed-filter="all">All</button>
      <button type="button" class="chip" aria-pressed="false" data-feed-filter="kill">Eliminations</button>
      <button type="button" class="chip" aria-pressed="false" data-feed-filter="knock">Knockdowns</button>
    </div>`,
  };
}

function eliminationTimeline(m) {
  const rows = m.teams.slice().sort((a, b) => a.lastSurvival - b.lastSurvival).map(t => {
    const team = store.team(t.id);
    return {
      label: t.name,
      value: t.lastSurvival,
      color: rgba(team?.color || '#6f8cff', .9),
      sub: `#${t.rank} · ${t.kills} kills`,
    };
  });
  return barChart({
    rows, horizontal: true, height: rows.length * 26 + 8,
    valueFmt: v => dur(v),
  }) + '<div class="tiny dim">When each squad lost its last player — the bar for the winners runs to the end of the match.</div>';
}

function weaponPanel(m) {
  const counts = new Map();
  const dists = [];
  for (const e of m.events) {
    if (e.zone || e.type !== 'kill') continue;
    if (e.item) counts.set(e.item, (counts.get(e.item) || 0) + 1);
    if (e.distance !== null) dists.push(e.distance);
  }
  if (!dists.length) return '';
  const named = weaponsNamed();
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([id, n]) => ({ label: weaponName(id), value: n, color: '#a97bf0' }));
  const bins = [[0, 25], [25, 50], [50, 100], [100, 200], [200, 300], [300, 1e9]];
  const distRows = bins.map(([a, b]) => ({
    label: b > 1e8 ? '300+' : `${a}-${b}`,
    value: dists.filter(d => d >= a && d < b).length,
    color: '#6f8cff',
  }));
  const distBlock = `<div><div class="tiny up dim" style="margin-bottom:6px">Elimination distance (m)</div>
      ${barChart({ rows: distRows, horizontal: false, height: 180 })}</div>`;
  return panel(named ? 'Weapons and range' : 'Range', named
    ? `<div class="grid g2" style="gap:14px">
        <div><div class="tiny up dim" style="margin-bottom:6px">Weapons used for eliminations</div>
          ${barChart({ rows, horizontal: true, height: rows.length * 26 + 8 })}</div>
        ${distBlock}
      </div>`
    : distBlock, { icon: 'target', note: 'How far apart players were when the finishing blow landed.' });
}
