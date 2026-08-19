/* Match index, grouped by stage. Matches are numbered continuously inside a
   stage (Game 1 … Game 18) — the broadcast day split is not shown. */

import { store } from '../store.js';
import { esc, num, dur, dateOf, panel, crest, avatar, rgba } from '../ui.js';
import { pageHead, scopeName } from './common.js';

export async function render({ scope }) {
  const list = store.matchesIn(scope);
  const groups = new Map();
  for (const m of list) {
    if (!groups.has(m.stage)) groups.set(m.stage, []);
    groups.get(m.stage).push(m);
  }

  const totalKills = list.reduce((a, m) => a + m.totalKills, 0);

  const blocks = [...groups.values()].map(ms => {
    const first = ms[0];
    const last = ms[ms.length - 1];
    const kills = ms.reduce((a, m) => a + m.totalKills, 0);
    return panel(first.stageLabel, `<div class="cards">${ms.map(matchCard).join('')}</div>`, {
      icon: 'clock',
      aside: `<span class="badge gold">${ms.length} games</span>
        <span class="badge">${num(kills)} kills</span>
        <span class="badge">${esc(dateOf(first.startTime))} – ${esc(dateOf(last.startTime))}</span>`,
    });
  }).join('');

  return {
    html: `${pageHead({
      crumb: `${esc(store.meta.tournament.label)} · ${esc(scopeName(scope))}`,
      title: 'Match Central',
      sub: `Game archives, scoreboards, elimination timelines, and play-by-play telemetry across all stage games.`,
      metaBadges: [
        { text: `${list.length} Total Matches`, cls: 'gold' },
        { text: `${num(totalKills)} Total Kills`, cls: '' },
        { text: `Phase: ${esc(scopeName(scope))}`, cls: '' },
      ],
    })}${blocks}`,
  };
}

function matchCard(m) {
  const w = store.team(m.winner.id);
  const mvpTeam = m.mvp ? store.team(m.mvp.teamId) : null;
  const mvp = m.mvp ? store.player(m.mvp.id) : null;
  return `<a class="card" href="#/matches/${m.key}">
    <div class="glow" style="background:${rgba(w?.color || '#6f8cff', .45)}"></div>
    <div class="card-head" style="justify-content:space-between">
      <div>
        <div class="tiny up dim">${esc(m.stageLabel)}${m.map ? ` · ${esc(m.map)}` : ''}</div>
        <div class="name" style="font-size:18px">Game ${m.number}</div>
      </div>
      ${crest(w, '')}
    </div>
    <div style="position:relative;margin-top:12px;display:flex;align-items:center;gap:9px;min-width:0">
      <span class="badge gold" style="font-size:10px;padding:2px 7px">WWCD 🍗</span>
      <span class="small" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700">${esc(m.winner.name)}</span>
      <span class="tiny dim nowrap" style="font-weight:700">${m.winner.points} pts</span>
    </div>
    ${mvp ? `<div style="position:relative;margin-top:9px;display:flex;align-items:center;gap:8px;min-width:0">
      ${avatar(mvp, mvpTeam)}
      <span class="small" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(mvp.name)}</span>
      <span class="badge gold" style="font-size:10px;padding:1px 6px">MVP · ${m.mvp.kills}K</span>
    </div>` : ''}
    <div class="card-stats">
      <div><div class="k">Eliminations</div><div class="v" style="color:var(--accent)">${m.totalKills}</div></div>
      <div><div class="k">Duration</div><div class="v">${dur(m.duration)}</div></div>
      <div><div class="k">Log Quality</div><div class="v">${Math.round((m.killLog.coverage || 0) * 100)}%</div></div>
    </div>
  </a>`;
}
