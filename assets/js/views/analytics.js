/* Tournament-wide analytics: leaderboards, weapon/range meta, kill timing,
   placement heatmap, head-to-head kill matrix and a production scatter. */

import { store } from '../store.js';
import {
  esc, num, pct, dur, panel, tile, crest, avatar, dataTable,
  bindTables, bindTooltips, el, els, barCell,
} from '../ui.js';
import {
  barChart, lineChart, heatmap, donut, scatter, ramp, barsTable, chartData,
} from '../charts.js';
import { pageHead, weaponName, weaponsNamed, scopeName, killLogNotice } from './common.js';

export async function render({ scope }) {
  const a = store.analytics;
  const summary = a.summary[scope];
  const boards = a.leaderboards[scope];
  const teamBoards = a.teamLeaderboards[scope];
  const weapons = a.weapons[scope];
  const distance = a.distance[scope];
  const timing = a.killTiming[scope];

  const head = pageHead({
    crumb: `${esc(store.meta.tournament.label)} · ${esc(scopeName(scope))}`,
    title: 'Advanced Analytics & Meta Breakdown',
    sub: `Deep-dive telemetry derived from ${summary.matches} matches, including weapon combat ranges, time-to-kill pacing, and team matchup matrices.`,
    metaBadges: [
      { text: `${summary.matches} Matches Analyzed`, cls: 'gold' },
      { text: `${num(summary.kills)} Total Eliminations`, cls: '' },
      { text: `${num(store.meta.counts.killEvents)} Feed Events Processed`, cls: '' },
    ],
  });

  const tiles = `<div class="tiles">
    ${tile('Kills / Match', num(summary.killsPerMatch, 1), `${num(summary.kills)} total kills`, 'accent')}
    ${tile('Damage / Match', num(summary.damage / Math.max(1, summary.matches), 0), `${num(summary.damage)} total damage`)}
    ${tile('Avg Match Duration', dur(summary.avgDuration), 'drop to final circle')}
    ${tile('Median Kill Range', `${num(distance.median)} m`, `p90 ${num(distance.p90)} m · max ${num(distance.max)} m`)}
    ${tile('Knock Conversion', pct(100 * (weapons.playerKills || 0) / Math.max(1, weapons.knocks)), `${num(weapons.knocks)} knockdowns recorded`)}
    ${tile('Blue Zone Deaths', num(summary.zoneDeaths), `${pct(100 * summary.zoneDeaths / Math.max(1, summary.kills))} of all deaths`)}
  </div>`;

  /* ---- leaderboards ---- */
  const boardKeys = Object.keys(boards);
  const boardChips = `<div class="chips" id="lb-chips" role="group" aria-label="Leaderboard metric">
    ${boardKeys.map((k, i) => `<button type="button" class="chip" aria-pressed="${i === 0}"
      data-board="${k}">${esc(boards[k].label)}</button>`).join('')}
  </div>`;

  /* ---- weapons (only once the item IDs have names) ---- */
  const named = weaponsNamed();
  const weaponRows = weapons.rows.slice(0, 14).map(r => ({
    label: weaponName(r.item),
    value: r.events,
    color: '#a97bf0',
    sub: r.medianDistance !== null ? `median ${r.medianDistance} m · p90 ${r.p90Distance} m` : '',
  }));
  const weaponPanel = named
    ? panel('Weapon and item usage', `
        ${barChart({ rows: weaponRows, horizontal: true, height: weaponRows.length * 26 + 8 })}
        ${chartData(['Item', 'Eliminations', 'Median range (m)', 'p90 (m)', 'Longest (m)'],
          weapons.rows.slice(0, 14).map(r => [weaponName(r.item), r.events,
            r.medianDistance ?? '—', r.p90Distance ?? '—', r.maxDistance ?? '—']))}`,
      { icon: 'target', note: 'Named from tools/weapons.json.' })
    : '';

  /* ---- placement heatmap ---- */
  const matrix = a.placementMatrix[scope];
  const teams = store.teamsIn(scope).sort((x, y) => x.s.rank - y.s.rank);
  const heatRows = teams.filter(t => matrix[t.id]);
  const heatValues = heatRows.map(t => matrix[t.id]);
  const heatMax = Math.max(1, ...heatValues.flat());
  const heat = heatmap({
    rows: heatRows,
    cols: Array.from({ length: 16 }, (_, i) => `${i + 1}`),
    values: heatValues,
    rowLabel: t => `<a class="ident" href="#/teams/${t.id}" style="gap:6px">
      ${crest(t, 'sm')}<span class="name" style="font-size:12px">${esc(t.tag)}</span></a>`,
    colorFor: (v, ri) => v ? ramp(v / heatMax, heatRows[ri].color) : 'var(--panel-2)',
    cellTip: (t, c, v) => `<b>${esc(t.name)}</b><br>finished #${c} in ${v} match${v === 1 ? '' : 'es'}`,
  });

  /* ---- head to head ---- */
  const h2h = headToHeadMatrix(scope, teams);

  /* ---- scatter ---- */
  const points = (a.scatter[scope] || []).map(p => {
    const team = store.team(p.teamId);
    return {
      x: p.x, y: p.y, r: p.r, color: team?.color || '#6f8cff',
      label: p.name,
      extra: `${team?.name || ''} · rating ${num(p.rating, 1)}`,
    };
  });

  /* ---- team boards ---- */
  const teamBoardRows = ['points', 'killsPerMatch', 'avgRank', 'consistency'].map(field => {
    const b = teamBoards[field];
    if (!b) return '';
    const rows = b.rows.slice(0, 16).map(r => ({
      label: r.name, value: r.value, color: store.team(r.id)?.color || '#6f8cff',
    }));
    return `<div>
      <div class="tiny up dim" style="margin-bottom:6px">${esc(b.label)}</div>
      ${barChart({ rows, horizontal: true, height: rows.length * 24 + 6, valueFmt: v => num(v, field === 'points' ? 0 : 2) })}
    </div>`;
  }).join('');

  return {
    html: `${head}${tiles}
      ${panel('Player leaderboards', `${boardChips}
        <div id="lb-body" style="margin-top:14px"></div>`, {
        note: 'Top 25 in each metric for this stage.',
      })}
      <div class="${named ? 'grid g2' : ''}">
        ${weaponPanel}
        ${panel('Range and timing', `
          <div class="${named ? '' : 'grid g2'}">
            <div>
              <div class="tiny up dim" style="margin-bottom:6px">Kill distance (m) — ${num(distance.samples)} ranged kills</div>
              ${barChart({
                rows: distance.labels.map((l, i) => ({ label: l, value: distance.counts[i], color: '#6f8cff' })),
                horizontal: false, height: 230,
              })}
              ${barsTable(distance.labels.map((l, i) => ({ label: l + ' m', value: distance.counts[i] })), 'Kills')}
            </div>
            <div>
              <div class="tiny up dim" style="margin-bottom:6px">Kills by share of game elapsed</div>
              ${barChart({
                rows: timing.labels.map((l, i) => ({ label: l.replace('%', ''), value: timing.counts[i], color: '#35d0ba' })),
                horizontal: false, height: 230,
              })}
              ${barsTable(timing.labels.map((l, i) => ({ label: l, value: timing.counts[i] })), 'Kills')}
            </div>
          </div>`,
          { icon: 'target', note: `Mean range ${num(distance.mean, 1)} m, median ${num(distance.median)} m. Early kills sit on the left of the timing chart, final-circle kills on the right.` })}
      </div>
      ${panel('Placement heatmap', heat, {
        note: 'How often each team finished in each position. Rows are ordered by final standing.',
      })}
      ${panel('Head to head kills', h2h.html, { note: h2h.note })}
      ${panel('Production map', scatter({
        points, xLabel: 'Damage per match', yLabel: 'Kills per match', height: 380,
        xFmt: v => num(v, 0), yFmt: v => num(v, 1),
      }), { note: 'Every player in this stage. Bubble size is average survival time — big bubbles low on the chart are anchors, small bubbles high up are entry fraggers.' })}
      ${panel('Team profiles', `<div class="grid g2" style="gap:18px">${teamBoardRows}</div>`)}
      <div>${killLogNotice()}</div>`,
    mount(root) {
      const draw = key => {
        const b = boards[key];
        const rows = b.rows.map((r, i) => ({ ...r, pos: i + 1 }));
        const max = Math.max(...rows.map(r => r.value));
        el('#lb-body', root).innerHTML = dataTable(rows, [
          { label: '#', get: r => r.pos, cls: 'rank', left: true, fmt: v => v },
          {
            label: 'Player', left: true, get: r => r.name, fmt: (v, r) => {
              const p = store.player(r.id);
              const t = store.team(r.teamId);
              return `<a class="ident" href="#/players/${r.id}">${avatar(p, t)}
                <span style="min-width:0"><span class="name">${esc(r.name)}</span>
                <span class="meta">${esc(r.team || '')}</span></span></a>`;
            },
          },
          { label: 'M', get: r => r.matches },
          {
            label: b.label, get: r => r.value, cls: 'strong',
            fmt: (v, r) => barCell(v, max, rgba(store.team(r.teamId)?.color || '#6f8cff', .9),
              x => num(x, Number.isInteger(x) ? 0 : 2)),
          },
        ], { sortCol: 0, sortDir: 'asc', href: r => `#/players/${r.id}` });
        bindTables(el('#lb-body', root));
        bindTooltips(el('#lb-body', root));
      };
      draw(boardKeys[0]);
      els('#lb-chips .chip', root).forEach(chip => chip.addEventListener('click', () => {
        els('#lb-chips .chip', root).forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
        draw(chip.dataset.board);
      }));
      bindTooltips(root);
    },
  };
}

function headToHeadMatrix(scope, teams) {
  const h2h = store.analytics.headToHead[scope] || {};
  const rows = teams.filter(t => h2h[t.id]);
  if (!rows.length) {
    return { html: '<div class="empty">No kill-feed data for this stage.</div>', note: '' };
  }
  const values = rows.map(a => teams.map(b => (a.id === b.id ? null : (h2h[a.id] || {})[b.id] || 0)));
  const max = Math.max(1, ...values.flat().filter(v => v !== null));
  return {
    html: heatmap({
      rows,
      cols: teams.map(t => t.tag),
      values,
      rowLabel: t => `<a class="ident" href="#/teams/${t.id}" style="gap:6px">
        ${crest(t, 'sm')}<span class="name" style="font-size:12px">${esc(t.tag)}</span></a>`,
      colorFor: (v, ri) => v === null ? 'var(--panel-3)' : v ? ramp(v / max, rows[ri].color) : 'var(--panel-2)',
      cellTip: (a, b, v) => v === null
        ? `${a.name}`
        : `<b>${esc(a.name)}</b> killed <b>${esc(b)}</b> players ${v} time${v === 1 ? '' : 's'}`,
    }),
    note: 'Rows are the killers, columns the victims. Built from the in-game kill feed, so it covers the matches where the feed was captured.',
  };
}
