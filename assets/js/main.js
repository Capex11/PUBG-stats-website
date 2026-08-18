/* App shell: loads the data bundle, renders the chrome, routes on hash change. */

import { store, scopeState } from './store.js';
import {
  el, els, esc, num, bindTables, bindTooltips, crest, avatar, loadingBlock,
} from './ui.js';
import { icon } from './icons.js';

import * as overview from './views/overview.js';
import * as standings from './views/standings.js';
import * as teams from './views/teams.js';
import * as team from './views/team.js';
import * as players from './views/players.js';
import * as player from './views/player.js';
import * as matches from './views/matches.js';
import * as match from './views/match.js';
import * as compare from './views/compare.js';
import * as analytics from './views/analytics.js';

const NAV = [
  { path: '/', label: 'Overview' },
  { path: '/standings', label: 'Standings' },
  { path: '/teams', label: 'Teams' },
  { path: '/players', label: 'Players' },
  { path: '/matches', label: 'Matches' },
  { path: '/compare', label: 'Compare' },
  { path: '/analytics', label: 'Analytics' },
];

const ROUTES = [
  [/^\/?$/, overview],
  [/^\/standings\/?$/, standings],
  [/^\/teams\/?$/, teams],
  [/^\/teams\/([^/]+)$/, team],
  [/^\/players\/?$/, players],
  [/^\/players\/([^/]+)$/, player],
  [/^\/matches\/?$/, matches],
  [/^\/matches\/([^/]+)$/, match],
  [/^\/compare(?:\/(players|teams))?(?:\/([^/]*))?\/?$/, compare],
  [/^\/analytics\/?$/, analytics],
];

let current = null;

function path() {
  const h = location.hash.replace(/^#/, '');
  return h || '/';
}

function renderNav() {
  const p = path();
  el('#nav').innerHTML = NAV.map(n => {
    const active = n.path === '/' ? p === '/' : p.startsWith(n.path);
    return `<a href="#${n.path}"${active ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`;
  }).join('');
}

/* ------------------------------------------------------------------- theme --- */
const THEME_KEY = 'pmgo.theme';

function currentTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function renderTheme() {
  const theme = currentTheme();
  const btn = el('#theme-toggle');
  const next = theme === 'dark' ? 'light' : 'dark';
  btn.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
  btn.setAttribute('aria-label', `Switch to ${next} theme`);
  btn.title = `Switch to ${next} theme`;
}

function setupTheme() {
  renderTheme();
  el('#theme-toggle').addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode */ }
    renderTheme();
  });
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (!localStorage.getItem(THEME_KEY)) renderTheme();
  });
}

function renderScope() {
  const box = el('#scope');
  scopeState.valid(store.scopes);
  box.innerHTML = store.scopes.map(s =>
    `<button type="button" data-scope="${esc(s.key)}" aria-pressed="${s.key === scopeState.key}"
      title="${esc(s.title)} — ${s.matches} games">${esc(s.label)}</button>`).join('');
  els('button', box).forEach(b => b.addEventListener('click', () => {
    if (b.dataset.scope === scopeState.key) return;
    scopeState.set(b.dataset.scope);
    renderScope();
    route();
  }));
}

/* Numbers count up on arrival — the "score animation" of a broadcast overlay,
   skipped entirely when the reader asks for reduced motion. */
function animateNumbers(root) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const targets = els('.tile .value, .hero-figure', root).filter(node => {
    const raw = node.textContent.trim().replace(/,/g, '');
    return /^-?\d+(\.\d+)?$/.test(raw);
  });
  for (const node of targets) {
    const raw = node.textContent.trim().replace(/,/g, '');
    const end = Number(raw);
    const decimals = (raw.split('.')[1] || '').length;
    const start = performance.now();
    const dur = 520;
    const tick = now => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      node.textContent = (end * eased).toLocaleString('en-US', {
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
      });
      if (t < 1) requestAnimationFrame(tick);
    };
    node.textContent = '0';
    requestAnimationFrame(tick);
  }
}

async function route() {
  const p = path();
  renderNav();
  const hit = ROUTES.find(([re]) => re.test(p));
  const view = el('#view');
  if (!hit) {
    view.innerHTML = `<div class="empty"><h2>Page not found</h2>
      <p class="muted">Nothing lives at <code>${esc(p)}</code>.</p>
      <p style="margin-top:var(--s-3)"><a class="chip" href="#/">Back to the overview</a></p></div>`;
    view.setAttribute('aria-busy', 'false');
    return;
  }
  const [re, mod] = hit;
  const params = (p.match(re) || []).slice(1).map(decodeURIComponent);
  const token = Symbol('route');
  current = token;
  view.setAttribute('aria-busy', 'true');
  view.innerHTML = loadingBlock();
  try {
    const out = await mod.render({ params, scope: scopeState.valid(store.scopes) });
    if (current !== token) return;
    // Let the outgoing view drop any document-level listeners it registered.
    view.dispatchEvent(new CustomEvent('pmgo:teardown'));
    view.innerHTML = out.html;
    view.setAttribute('aria-busy', 'false');
    bindTables(view);
    bindTooltips(view);
    out.mount?.(view);
    animateNumbers(view);
    window.scrollTo({ top: 0 });
  } catch (err) {
    console.error(err);
    view.setAttribute('aria-busy', 'false');
    view.innerHTML = `<div class="empty"><h2>Something went wrong</h2>
      <p class="muted">${esc(err.message)}</p>
      <p style="margin-top:var(--s-3)"><a class="chip" href="#/">Back to the overview</a></p></div>`;
  }
}

/* ------------------------------------------------------------------ search --- */
function setupSearch() {
  const input = el('#search');
  el('.search-box .icon').innerHTML = icon('search', { size: 15 });
  const box = el('#search-results');
  let items = [];
  let sel = -1;

  const build = () => {
    items = [
      ...store.teams.map(t => ({
        kind: 'team', id: t.id, name: t.name, extra: t.tag,
        html: `${crest(t, 'sm')}<span class="name">${esc(t.name)}</span>`,
        href: `#/teams/${t.id}`,
      })),
      ...store.players.map(p => ({
        kind: 'player', id: p.id, name: p.name, extra: p.teamName,
        html: `${avatar(p, store.team(p.teamId))}<span><span class="name">${esc(p.name)}</span>
          <span class="meta">${esc(p.teamName || '')}</span></span>`,
        href: `#/players/${p.id}`,
      })),
      ...store.matches.map(m => ({
        kind: 'match', id: m.key, name: m.displayTitle, extra: m.winner.name,
        html: `<span><span class="name">${esc(m.displayTitle)}</span>
          <span class="meta">won by ${esc(m.winner.name)}</span></span>`,
        href: `#/matches/${m.key}`,
      })),
    ];
  };

  const close = () => {
    box.classList.add('hidden');
    input.setAttribute('aria-expanded', 'false');
    sel = -1;
  };

  const search = q => {
    const needle = q.trim().toLowerCase();
    if (!needle) return close();
    if (!items.length) build();
    const hits = items
      .map(i => {
        const name = i.name.toLowerCase();
        const extra = String(i.extra || '').toLowerCase();
        let score = -1;
        if (name.startsWith(needle)) score = 0;
        else if (name.includes(needle)) score = 1;
        else if (extra.includes(needle)) score = 2;
        return { i, score };
      })
      .filter(x => x.score >= 0)
      .sort((a, b) => a.score - b.score || a.i.name.length - b.i.name.length)
      .slice(0, 12);
    if (!hits.length) {
      box.innerHTML = `<div class="row dim">Nothing matches “${esc(q)}”. Try a team tag or player name.</div>`;
      box.classList.remove('hidden');
      input.setAttribute('aria-expanded', 'true');
      return;
    }
    box.innerHTML = hits.map((h, n) => `<div class="row" role="option" tabindex="-1"
      aria-selected="${n === sel}" data-href="${h.i.href}">
      ${h.i.html}<span class="kind">${h.i.kind}</span></div>`).join('');
    box.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
    els('.row[data-href]', box).forEach(row => row.addEventListener('mousedown', ev => {
      ev.preventDefault();
      location.hash = row.dataset.href;
      input.value = '';
      close();
    }));
  };

  input.addEventListener('input', () => search(input.value));
  input.addEventListener('focus', () => input.value && search(input.value));
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', ev => {
    const rows = els('.row[data-href]', box);
    if (ev.key === 'Escape') { input.value = ''; close(); input.blur(); }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      sel = Math.max(0, Math.min(rows.length - 1, sel + (ev.key === 'ArrowDown' ? 1 : -1)));
      rows.forEach((r, i) => r.setAttribute('aria-selected', String(i === sel)));
      rows[sel]?.scrollIntoView({ block: 'nearest' });
    }
    if (ev.key === 'Enter' && rows[Math.max(0, sel)]) {
      location.hash = rows[Math.max(0, sel)].dataset.href;
      input.value = '';
      close();
      input.blur();
    }
  });

  document.addEventListener('keydown', ev => {
    if (ev.key === '/' && document.activeElement !== input) {
      ev.preventDefault();
      input.focus();
    }
  });
}

/* -------------------------------------------------------------------- boot --- */
(async function boot() {
  try {
    await store.load();
  } catch (err) {
    el('#view').innerHTML = `<div class="empty">
      <h2>Data not found</h2>
      <p class="muted">Could not load <code>data/meta.json</code> (${esc(err.message)}).</p>
      <p class="muted">Run <code>python tools/fetch_source.py</code> then
        <code>python tools/build.py</code>, and serve the folder over HTTP
        (<code>python -m http.server</code>) — opening index.html from the file
        system blocks fetch().</p></div>`;
    return;
  }
  document.title = `${store.meta.tournament.label} — Esports Analytics`;
  setupTheme();
  renderScope();
  setupSearch();
  window.addEventListener('hashchange', route);
  route();
})();
