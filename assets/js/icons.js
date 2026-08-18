/* Inline SVG icons (Lucide geometry, stroke-based). No emoji, no icon font:
   they inherit currentColor and stay crisp at any size. */

const PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  moon: '<path d="M21 12.8A8.5 8.5 0 1111.2 3a6.6 6.6 0 009.8 9.8z"/>',
  kill: '<path d="M6 6l12 12M18 6L6 18"/>',
  knock: '<path d="M12 5v11M7 12l5 5 5-5"/>',
  zone: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  sort: '<path d="M8 9l4-4 4 4M8 15l4 4 4-4"/>',
  chevronLeft: '<path d="M15 19l-7-7 7-7"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0z"/><path d="M17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  users: '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16.5 5.3a3.4 3.4 0 010 6.4M18 20a6.6 6.6 0 00-2-4.7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
};

export function icon(name, { size = 16, cls = '' } = {}) {
  const d = PATHS[name];
  if (!d) return '';
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">${d}</svg>`;
}
