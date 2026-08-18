#!/usr/bin/env python3
"""Download team logos / flags / player photos from the asset server, resize them
into web-sized WebP files under assets/img/, and record an asset manifest.

Everything the site ships must live in the repo - GitHub Pages cannot reach the
LAN asset host - so this is a one-way copy. Missing images are reported and the
site falls back to generated initials avatars.

    python tools/fetch_assets.py
"""
from __future__ import annotations

import argparse
import colorsys
import json
import re
import unicodedata
import urllib.parse
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LOGO_PX = 320
FLAG_PX = 160
PHOTO_PX = 480


def log(msg):
    print(msg, flush=True)


def slugify(value):
    value = unicodedata.normalize("NFKD", str(value))
    value = "".join(c for c in value if not unicodedata.combining(c))
    value = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").lower()
    return value or "unknown"


def fetch(url, timeout=45):
    try:
        req = urllib.request.Request(url, headers={"Accept": "image/*"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return None
            ctype = resp.headers.get("Content-Type", "")
            data = resp.read()
            if not ctype.startswith("image/"):
                return None
            return data
    except Exception:  # noqa: BLE001 - any network/HTTP problem means "no image"
        return None


def dominant_color(img):
    """Representative accent colour for a logo: ignores transparency, near-white
    and near-black pixels, prefers saturated tones, then clamps lightness so the
    result stays readable as an accent on a dark UI."""
    small = img.convert("RGBA").resize((64, 64))
    buckets = {}
    for count, (r, g, b, a) in small.getcolors(maxcolors=64 * 64) or []:
        if a < 128:
            continue
        _h, lig, sat = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        if lig > 0.93 or lig < 0.07:
            continue
        key = (r // 24, g // 24, b // 24)
        weight = count * (1 + int(sat * 6) + int((1 - abs(lig - 0.5) * 2) * 3))
        buckets[key] = buckets.get(key, 0) + weight
    if not buckets:
        return "#8b93a7"
    key = max(buckets, key=lambda k: buckets[k])
    r, g, b = (min(255, v * 24 + 12) for v in key)
    hue, lig, sat = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    lig = min(max(lig, 0.45), 0.72)
    sat = min(max(sat, 0.45), 0.95)
    r, g, b = (int(round(c * 255)) for c in colorsys.hls_to_rgb(hue, lig, sat))
    return "#%02x%02x%02x" % (r, g, b)


def tone(img):
    """Is this logo mostly light, mostly dark, or mixed? White-on-transparent
    crests disappear on a light page and vice versa, so the site pads exactly
    those with a contrasting chip."""
    small = img.convert("RGBA").resize((32, 32))
    total = 0
    weighted = 0.0
    for count, (r, g, b, a) in small.getcolors(maxcolors=32 * 32) or []:
        if a < 128:
            continue
        total += count
        weighted += count * (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    if not total:
        return "mixed"
    mean = weighted / total
    if mean > 0.72:
        return "light"
    if mean < 0.26:
        return "dark"
    return "mixed"


def save_web(data, dest, box, want_color=False):
    try:
        img = Image.open(BytesIO(data))
        img.load()
    except Exception as exc:  # noqa: BLE001
        log("    ! undecodable image: %s" % exc)
        return None, None
    if img.mode not in ("RGBA", "RGB"):
        img = img.convert("RGBA")
    color = dominant_color(img) if want_color else None
    shade = tone(img) if want_color else None
    img.thumbnail((box, box), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "WEBP", quality=88, method=6)
    return dest, (color, shade)


def candidates(asset_base, folder, filename, extra_folders=()):
    """URLs to try for one stored image, best guess first.

    The database stores either a bare filename (team icons, served from a fixed
    folder) or "<folder>/<uuid>.png" (player images, uploaded per tournament).
    Folders get renamed and moved between events, so after the recorded path we
    also try every other folder we have seen, then the server root."""
    base = asset_base.rstrip("/")
    quoted = urllib.parse.quote(filename)
    urls = []
    if folder:
        urls.append("%s/%s/%s" % (base, urllib.parse.quote(folder), quoted))
    for other in extra_folders:
        if other and other != folder:
            urls.append("%s/%s/%s" % (base, urllib.parse.quote(other), quoted))
    urls.append("%s/%s" % (base, quoted))
    urls.append("%s/uploads/%s" % (base, quoted))
    return urls


def local_lookup(local_dir, folder, filename):
    """Same lookup against a directory on disk - use --local-dir to point at a
    copy of the server's public/ folder (a share, a backup, a USB drive)."""
    if not local_dir:
        return None
    root = Path(local_dir)
    for candidate in ([root / folder / filename] if folder else []) + [
        root / filename,
        *(p for p in root.glob("*/" + filename)),
    ]:
        if candidate.is_file():
            try:
                return candidate.read_bytes()
            except OSError:
                return None
    return None


def team_of_player(raw):
    """playerName -> teamName, straight from the saved games."""
    mapping = {}
    for gf in sorted((raw / "games").glob("*.json")):
        doc = json.loads(gf.read_text(encoding="utf-8"))
        for p in doc.get("allinfo", {}).get("TotalPlayerList", []):
            mapping[p["playerName"]] = p["teamName"]
    return mapping


def name_variants(name):
    """Spellings an operator might have used for a filename.

    Real examples from this tournament: khk1RFAN is filed as khkIRFAN (digit for
    letter), khkWALOODi as khkWALOOD and GeekKEVIN88 as GeekKEVIN (decorations
    and trailing digits dropped), so try the exact in-game name first and then
    those degradations."""
    folded = "".join(c for c in unicodedata.normalize("NFKD", name)
                     if not unicodedata.combining(c))
    ascii_folded = "".join(c for c in folded if c.isascii())
    dropped = "".join(c for c in name if c.isascii())  # decoration removed, not folded

    bases = [name, folded, ascii_folded, dropped,
             "".join(c for c in ascii_folded if c.isalnum())]
    out = []
    for base in bases:
        if not base:
            continue
        out += [
            base,
            base.rstrip("0123456789"),          # GeekKEVIN88 -> GeekKEVIN
            re.sub(r"\d+[A-Za-z]?$", "", base),  # KhkCASANOVA77K -> KhkCASANOVA
            base.replace("1", "I"),             # khk1RFAN    -> khkIRFAN
            base.replace("I", "1"),
            base.replace("0", "O"),
            base.replace("O", "0"),
            base.upper(),
            base.lower(),
        ]
    seen = []
    for v in out:
        if v and len(v) > 2 and v not in seen:
            seen.append(v)
    return seen


def folder_variants(team_name, aliases, team_doc):
    out = [team_name]
    out += aliases.get(team_name, [])
    tag = (team_doc or {}).get("tag")
    if tag:
        out += [tag, "%s Esports" % tag]
    stripped = (team_name.replace(" Esports", "").replace(" ESPORTS", "")
                .replace("THE ", "").strip())
    out.append(stripped)
    seen = []
    for v in out:
        if v and v not in seen:
            seen.append(v)
    return seen


def photo_paths(template, team_name, player, aliases, overrides, exts, team_doc):
    """Every path worth trying for one player's photo, best guess first."""
    if player in overrides:
        yield overrides[player]
        return
    base_ext = Path(template).suffix or ".png"
    stem = template[: -len(base_ext)] if base_ext else template
    for folder in folder_variants(team_name, aliases, team_doc):
        for nm in name_variants(player):
            for ext in exts:
                yield stem.format(team=folder, player=nm) + ext


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=str(ROOT / "tools" / "config.json"))
    ap.add_argument("--raw", default=str(ROOT / "raw"))
    ap.add_argument("--out", default=str(ROOT / "assets" / "img"))
    ap.add_argument("--asset-base", default=None, help="override assetBase from config")
    ap.add_argument("--force", action="store_true", help="re-download existing files")
    ap.add_argument("--local-dir", default=None,
                    help="also look for images in this directory (e.g. a copy of "
                         "the asset server's public/ folder)")
    args = ap.parse_args()

    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))
    asset_base = args.asset_base or cfg["assetBase"]
    folders = cfg.get("assetFolders", {})
    raw = Path(args.raw)
    out = Path(args.out)

    manifest = {"assetBase": asset_base, "teams": {}, "players": {}, "missing": []}

    # ---- teams -----------------------------------------------------------
    teams = {}
    for f in sorted(raw.glob("stage_*_teams.json")):
        for t in json.loads(f.read_text(encoding="utf-8")):
            teams[t["name"]] = t
    log("teams in tournament: %d" % len(teams))

    for name, team in sorted(teams.items()):
        slug = slugify(name)
        entry = {"slug": slug, "name": name, "tag": team.get("tag"),
                 "logo": None, "flag": None, "color": None, "tone": None}
        for kind, field, folder_key, box in (
            ("logo", "icon", "teamIcon", LOGO_PX),
            ("flag", "flag", "teamFlag", FLAG_PX),
        ):
            fname = team.get(field)
            if not fname:
                manifest["missing"].append(
                    {"type": "team-" + kind, "team": name, "reason": "no filename in DB"})
                continue
            dest = out / "teams" / ("%s-%s.webp" % (slug, kind))
            if dest.exists() and not args.force:
                entry[kind] = "assets/img/teams/" + dest.name
                if kind == "logo":
                    try:
                        with Image.open(dest) as im:
                            im.load()
                            entry["color"] = dominant_color(im)
                            entry["tone"] = tone(im)
                    except Exception:  # noqa: BLE001
                        pass
                continue
            folder_name = folders.get(folder_key, "")
            data = local_lookup(args.local_dir, folder_name, fname)
            used = "local"
            if not data:
                used = None
                for url in candidates(asset_base, folder_name, fname):
                    data = fetch(url)
                    if data:
                        used = url
                        break
            if not data:
                log("  %s: %s MISSING (%s)" % (name, kind, fname))
                manifest["missing"].append({"type": "team-" + kind, "team": name, "file": fname})
                continue
            saved, (color, shade) = save_web(data, dest, box, want_color=(kind == "logo"))
            if saved:
                entry[kind] = "assets/img/teams/" + dest.name
                if color:
                    entry["color"] = color
                if shade:
                    entry["tone"] = shade
                log("  %s: %s ok (%d KB -> %d KB)" % (
                    name, kind, len(data) // 1024, dest.stat().st_size // 1024))
        manifest["teams"][name] = entry

    # ---- players ---------------------------------------------------------
    tournament_players = set()
    for gf in sorted((raw / "games").glob("*.json")):
        doc = json.loads(gf.read_text(encoding="utf-8"))
        for p in doc.get("allinfo", {}).get("TotalPlayerList", []):
            tournament_players.add(p["playerName"])
    log("\nplayers in tournament: %d" % len(tournament_players))

    db_players = []
    players_file = raw / "players.json"
    if players_file.exists():
        db_players = json.loads(players_file.read_text(encoding="utf-8"))
    by_name = {p.get("name"): p for p in db_players}

    all_folders = []
    for rec in db_players:
        for asset in rec.get("assets") or []:
            head = (asset.get("imagePath") or "").rpartition("/")[0]
            if head and head not in all_folders:
                all_folders.append(head)

    # Player shots are filed by name, not by id:
    #   <pathTemplate> = "PMGC 2026/PMGO/player kill/{team}/{player}.png"
    # Operators do not always spell the folder the way the game reports the team
    # (THE HUNTERS -> "HUNT Esports", Nigma Galaxy -> "NGX"), so each team gets a
    # list of candidate folders and each player a list of candidate filenames.
    photo_cfg = cfg.get("playerPhotos") or {}
    template = photo_cfg.get("pathTemplate")
    exts = photo_cfg.get("extensions") or [".png"]
    aliases = photo_cfg.get("teamFolderAliases") or {}
    overrides = photo_cfg.get("playerFileOverrides") or {}
    player_team = team_of_player(raw)

    got = 0
    wanted = {"MVP_PVP": "photo", "FirstBlood": "portrait"}
    for name in sorted(tournament_players):
        rec = by_name.get(name)
        slug = slugify(name)
        entry = {"slug": slug, "name": name, "photo": None, "portrait": None}
        dest = out / "players" / ("%s-photo.webp" % slug)

        if dest.exists() and not args.force:
            entry["photo"] = "assets/img/players/" + dest.name
        elif template:
            team_name = player_team.get(name, "")
            data, used = None, None
            for path in photo_paths(template, team_name, name, aliases, overrides, exts,
                                    teams.get(team_name, {})):
                data = local_lookup(args.local_dir, *path.rsplit("/", 1)) or fetch(
                    asset_base.rstrip("/") + "/" + urllib.parse.quote(path))
                if data:
                    used = path
                    break
            if data:
                saved, _tone = save_web(data, dest, PHOTO_PX)
                if saved:
                    entry["photo"] = "assets/img/players/" + dest.name
                    log("  %s: photo ok (%s)" % (name, used))
            else:
                manifest["missing"].append(
                    {"type": "player-photo", "player": name, "team": team_name,
                     "tried": template.format(team=team_name, player=name)})

        # Fall back to the id-keyed overlay assets recorded in the database.
        for asset in (rec or {}).get("assets") or []:
            kind = wanted.get(asset.get("imageName"))
            path = asset.get("imagePath") or ""
            if not kind or not path or entry.get(kind):
                continue
            kind_dest = out / "players" / ("%s-%s.webp" % (slug, kind))
            if kind_dest.exists() and not args.force:
                entry[kind] = "assets/img/players/" + kind_dest.name
                continue
            folder, _, fname = path.rpartition("/")
            data = local_lookup(args.local_dir, folder, fname)
            if not data:
                for url in candidates(asset_base, folder, fname, all_folders):
                    data = fetch(url)
                    if data:
                        break
            if not data:
                continue
            saved, _tone = save_web(data, kind_dest, PHOTO_PX)
            if saved:
                entry[kind] = "assets/img/players/" + kind_dest.name

        if entry["photo"] or entry["portrait"]:
            got += 1
        manifest["players"][name] = entry

    log("player images downloaded for %d/%d players" % (got, len(tournament_players)))
    if got < len(tournament_players):
        log("  (the site falls back to initials avatars for the rest; re-run this "
            "script once the files are back on the asset server, or pass "
            "--local-dir <path> to copy them from disk)")

    missing_teams = [m for m in manifest["missing"] if m["type"].startswith("team")]
    missing_players = [m for m in manifest["missing"] if m["type"].startswith("player")]
    log("\nmissing: %d team images, %d player images" % (len(missing_teams), len(missing_players)))

    dest = ROOT / "data" / "assets.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    log("manifest -> %s" % dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
