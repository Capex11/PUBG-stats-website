#!/usr/bin/env python3
"""Pull every PMGO source document out of the Esport-AHW backend into raw/.

The website itself is static: this script is the only thing that touches the
LAN-only API. Run it whenever the tournament data changes, then run build.py.

    python tools/fetch_source.py [--config tools/config.json]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def log(msg: str) -> None:
    print(msg, flush=True)


def get_json(base: str, path: str, timeout: int = 120, retries: int = 3):
    url = base.rstrip("/") + path
    last = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001 - network shapes vary
            last = exc
            if attempt < retries:
                time.sleep(1.5 * attempt)
    raise RuntimeError(f"GET {url} failed after {retries} tries: {last}")


def safe_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._ -]+", "_", name).strip() or "unnamed"


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=str(ROOT / "tools" / "config.json"))
    ap.add_argument("--out", default=str(ROOT / "raw"))
    args = ap.parse_args()

    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))
    api = cfg["apiBase"]
    tid = cfg["tournamentId"]
    out = Path(args.out)
    games_dir = out / "games"

    log(f"api    : {api}")
    log(f"tourney: {tid}")

    tournament = get_json(api, f"/api/tournaments/{tid}")
    write_json(out / "tournament.json", tournament)
    log(f"tournament: {tournament.get('title')!r}")

    stages = get_json(api, f"/api/tournaments/{tid}/stages")
    stages = sorted(stages, key=lambda s: s.get("number") or 0)
    write_json(out / "stages.json", stages)

    manifest = {
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "apiBase": api,
        "assetBase": cfg["assetBase"],
        "tournamentId": tid,
        "stages": [],
    }

    for stage in stages:
        sid = stage["_id"]
        title = stage.get("title") or stage.get("name") or sid
        log(f"\nstage {stage.get('number')}: {title} ({sid})")
        details = get_json(api, f"/api/stages/{sid}/details", timeout=300)
        games, teams = (details + [[], []])[:2] if isinstance(details, list) else ([], [])
        write_json(out / f"stage_{safe_name(title)}_teams.json", teams)
        log(f"  teams: {len(teams)}")

        entries = []
        for game in games:
            gtitle = game.get("title") or game.get("externalGameId")
            fname = f"{safe_name(gtitle)}.json"
            write_json(games_dir / fname, game)
            entries.append(
                {
                    "file": f"games/{fname}",
                    "id": game.get("_id"),
                    "externalGameId": game.get("externalGameId"),
                    "title": gtitle,
                    "gameStartTime": game.get("gameStartTime"),
                    "createdAt": game.get("createdAt"),
                    "teamCount": game.get("teamCount"),
                    "playerCount": game.get("playerCount"),
                    "killEvents": len(game.get("killinfo") or []),
                }
            )
            log(f"  game {gtitle}: {game.get('playerCount')} players, "
                f"{len(game.get('killinfo') or [])} kill events")

        # Server-side standings (carries manual point modifiers) - best effort.
        standings = None
        modifiers = None
        try:
            standings = get_json(api, f"/api/tourResult/from-stage/{sid}", timeout=300)
        except Exception as exc:  # noqa: BLE001
            log(f"  ! standings unavailable: {exc}")
        try:
            modifiers = get_json(api, f"/api/tourResult/modifiers/{sid}")
        except Exception as exc:  # noqa: BLE001
            log(f"  ! modifiers unavailable: {exc}")
        if standings is not None:
            write_json(out / f"standings_{safe_name(title)}.json", standings)
        if modifiers is not None:
            write_json(out / f"modifiers_{safe_name(title)}.json", modifiers)

        manifest["stages"].append(
            {
                "id": sid,
                "number": stage.get("number"),
                "title": title,
                "teamsFile": f"stage_{safe_name(title)}_teams.json",
                "standingsFile": f"standings_{safe_name(title)}.json" if standings is not None else None,
                "modifiersFile": f"modifiers_{safe_name(title)}.json" if modifiers is not None else None,
                "games": entries,
            }
        )

    log("\nglobal collections")
    for path, name in (("/api/teams", "teams.json"), ("/api/players/unique", "players.json")):
        try:
            data = get_json(api, path, timeout=300)
            write_json(out / name, data)
            log(f"  {name}: {len(data)} records")
        except Exception as exc:  # noqa: BLE001
            log(f"  ! {path} failed: {exc}")

    write_json(out / "manifest.json", manifest)
    total = sum(len(s["games"]) for s in manifest["stages"])
    log(f"\ndone - {len(manifest['stages'])} stages, {total} games -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
