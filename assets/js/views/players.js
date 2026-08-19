/* Player index: filter by team, minimum matches and free text, then sort on any
   column. The table is rebuilt client-side so filtering stays instant. */

import { store } from '../store.js';
import { el, els, esc, num, panel, crest, bindTables, bindTooltips } from '../ui.js';
import { icon } from '../icons.js';
import { pageHead, playersTable, scopeName } from './common.js';

export async function render({ scope }) {
  const teams = store.teamsIn(scope).sort((a, b) => a.s.rank - b.s.rank);
  const all = store.playersIn(scope);

  const controls = `<div class="panel-head" style="margin-bottom:12px">
    <div class="search-box" style="min-width:240px">
      <span class="icon" aria-hidden="true">${icon('search', { size: 15 })}</span>
      <input id="pf-text" type="search" placeholder="Filter players by name or team…" style="width:100%"
        aria-label="Filter players by name or team">
    </div>
    <span class="small dim" id="pf-count"></span>
  </div>
  <div class="chips" id="pf-teams" role="group" aria-label="Filter by team" style="margin-bottom:14px">
    <button type="button" class="chip" aria-pressed="true" data-team="">All teams</button>
    ${teams.map(t => `<button type="button" class="chip" aria-pressed="false"
      data-team="${t.id}">${crest(t, 'sm')} ${esc(t.tag)}</button>`).join('')}
  </div>`;

  return {
    html: `${pageHead({
      crumb: `${esc(store.meta.tournament.label)} · ${esc(scopeName(scope))}`,
      title: 'Player Performance Matrix',
      sub: `Production rating, combat efficiency, survival times, and MVP honors across all ${all.length} competing athletes.`,
      metaBadges: [
        { text: `${all.length} Professional Players`, cls: 'gold' },
        { text: `Field Rating Baseline: 50.0`, cls: '' },
        { text: `Stage: ${esc(scopeName(scope))}`, cls: '' },
      ],
      aside: `<a class="chip on" href="#/compare/players">Head-to-Head Compare →</a>`,
    })}
    <section class="panel">
      ${controls}
      <div id="pf-table">${playersTable(scope, all)}</div>
    </section>`,
    mount(root) {
      const state = { text: '', team: '' };
      const draw = () => {
        const rows = all.filter(p =>
          (!state.team || p.teamId === state.team)
          && (!state.text
            || p.name.toLowerCase().includes(state.text)
            || (p.teamName || '').toLowerCase().includes(state.text)));
        const box = el('#pf-table', root);
        box.innerHTML = playersTable(scope, rows);
        bindTables(box);
        bindTooltips(box);
        el('#pf-count', root).textContent = `${rows.length} of ${all.length} players`;
      };
      el('#pf-text', root).addEventListener('input', ev => {
        state.text = ev.target.value.trim().toLowerCase();
        draw();
      });
      els('#pf-teams .chip', root).forEach(chip => chip.addEventListener('click', () => {
        els('#pf-teams .chip', root).forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
        state.team = chip.dataset.team;
        draw();
      }));
      el('#pf-count', root).textContent = `${all.length} of ${all.length} players`;
    },
  };
}
