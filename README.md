# PMGO Analytics

A static PUBG Mobile esports analytics site for the PMGO competition — standings,
team and player profiles, per-game breakdowns with kill feeds, a head-to-head
comparison tool, and tournament-wide analytics.

Everything is plain HTML/CSS/JS with pre-generated JSON, so it can be served by
GitHub Pages with no backend. The LAN-only broadcast API is touched **only** by
the scripts in `tools/`, never by the site itself.

```
tools/fetch_source.py   →  raw/     →  tools/build.py    →  data/
tools/fetch_assets.py   →  assets/img/  +  data/assets.json
```

## Quick start

```bash
python tools/serve.py            # http://127.0.0.1:8899
```

The site reads `data/*.json`, so it must be served over HTTP — opening
`index.html` from the file system blocks `fetch()`.

## Refreshing the data

Run these on a machine that can reach the broadcast backend
(`http://192.168.30.7:1080` for the API, `:4000` for images — see `tools/config.json`):

```bash
python tools/fetch_source.py     # pull tournament, stages, games, teams, players → raw/
python tools/fetch_assets.py     # download + resize logos, flags, player photos → assets/img/
python tools/build.py            # compute every stat and analytic → data/
```

`fetch_source.py` writes the raw API documents to `raw/` unchanged; `build.py`
only ever reads `raw/`, so rebuilding is offline and reproducible.

To point the pipeline at a different tournament, change `tournamentId` in
`tools/config.json` (list the options with `curl http://192.168.30.7:1080/api/tournaments`).

### Scoring

`tools/config.json` holds the points table (1st = 10, 2nd = 6, 3rd = 5, 4th = 4,
5th = 3, 6th = 2, 7th–8th = 1, plus 1 per kill). The build cross-checks every
computed standing against the server's own `/api/tourResult` numbers and prints a
warning per mismatch — as of the last run all 32 team-stage rows match exactly,
including the manual point adjustments stored in the dashboard.

### Weapon names

The game reports numeric `ItemID`s in the kill feed, not weapon names. Until
`tools/weapons.json` gives those ids names, every weapon breakdown stays hidden
— raw ids tell a reader nothing and guessing them would be worse. `build.py`
regenerates `tools/weapons.json` hints (observed usage counts and median kill
distance per id) to help identify them; fill in `name` and `class`, re-run
`build.py`, and the weapon panels reappear on the analytics, match and player
pages automatically.

### Player photos

Player shots live on the asset server by **name**, not by id:

```
http://192.168.30.7:4000/PMGC 2026/PMGO/player kill/<team folder>/<player>.png
```

`tools/config.json` → `playerPhotos` holds that template plus the fix-ups the
real folder tree needs:

- `teamFolderAliases` — folders that do not match the in-game team name
  (`THE HUNTERS` → `HUNT Esports`, `Nigma Galaxy` → `NGX`, `KHK Esports` →
  `KHK ESPRORTS`).
- filename degradations are tried automatically: accent-stripped
  (`khkWALOODī` → `khkWALOOD`), digit-for-letter (`khk1RFAN` → `khkIRFAN`),
  and trailing digits dropped (`GeekKEVIN88` → `GeekKEVIN`,
  `KhkCASANOVA77K` → `khkCASANOVA`).
- `playerFileOverrides` — `{"in-game name": "full/path/on/server.png"}` for
  anything the guesses cannot reach. Three Nigma Galaxy players are filed under
  unrelated names and are mapped there:

  ```json
  "ngxKOOPS02":  "PMGC 2026/PMGO/player kill/NGX/koopsz.png",
  "ngxLORDū":    "PMGC 2026/PMGO/player kill/NGX/lord0233.png",
  "ngxSaTaN33ň": "PMGC 2026/PMGO/player kill/NGX/satan_0e.png"
  ```

77 of 79 players resolve. These two have no file on the server yet — add them
(or add an override) and re-run `fetch_assets.py`:

| Player | Team |
| --- | --- |
| mstrMORSHē | MASTER TEAM |
| RAADōLabubu | RA'AD |

Players without a photo fall back to initials avatars in their team colour.

```bash
python tools/fetch_assets.py                                    # incremental
python tools/fetch_assets.py --force                            # re-download all
python tools/fetch_assets.py --local-dir "\server\public"   # copy from disk
python tools/build.py
```

## Deploying to GitHub Pages

The site lives at the repository root, so:

1. Push the repo to GitHub.
2. Settings → Pages → Source: *Deploy from a branch* → branch `main`, folder `/ (root)`.

`.nojekyll` is committed so Jekyll does not touch the asset folders. All paths in
the site are relative and routing is hash-based, so it works from a project
sub-path (`https://<user>.github.io/<repo>/`) without configuration.

`raw/` (5 MB of source dumps) and `PMGO/` (the original match exports) can be
committed for provenance or left out — nothing at runtime reads them.

## What is in the site

| Page | Contents |
| --- | --- |
| Overview | Stage snapshot, podium, points race, standout players, full standings |
| Standings | Full table with placement points, kills, adjustments, form, placement grid |
| Teams | Team cards and a sortable table of every team metric |
| Team | Roster, per-game record, kill share, strengths vs the field, game log |
| Players | Filterable, sortable table of all players with the rating index |
| Player | Headline stats, percentile radar, form, game log, kill-feed fingerprint |
| Matches | Every game of the stage with winner, MVP and length |
| Match | Podium, team results, 64-player scoreboard, kill feed, elimination timeline |
| Compare | Two players or two teams head to head: metrics, radar, form, direct kills |
| Analytics | Leaderboards, weapon/range/timing meta, placement heatmap, head-to-head matrix, production map |

### Rating index

A transparent composite: each player's per-game production is z-scored across
everyone in the stage, weighted (kills 0.28, damage 0.24, kill share 0.12,
survival 0.12, assists 0.10, knockdowns 0.08, revives 0.06), then mapped so 50 is
the field average and 15 points is one standard deviation. The weights live in
`RATING_WEIGHTS` in `tools/build.py` and are published in `data/meta.json`.

### Data quality

Player and team stat lines come from the end-of-match payload and are complete.
The kill feed (weapons, distances, timings, head-to-head) is captured live and is
incomplete for some games — one game (League Game 4) has no kill feed at all.
Coverage is shown on the overview and analytics pages, and any view built from
the feed says so.

## Front-end notes

- No framework and no build step: ES modules, hash router, hand-rolled SVG charts.
- Dark and light themes from one set of CSS tokens; follows the OS preference
  until the reader picks one.
- Accessibility: skip link, visible focus rings, `aria-sort` on sortable
  headers, keyboard-reachable tooltips, a data table behind every chart,
  `prefers-reduced-motion` respected, 44px touch targets on small screens.
- Data loads as one small bundle (`meta`, `teams`, `players`, `standings`,
  `matches`, `analytics` ≈ 350 KB) with per-game detail fetched on demand.
- Visual direction follows the data-dense dashboard pattern: team colours as the
  accent, tabular figures everywhere, heatmaps for distribution, drill-down from
  every card and table row.
