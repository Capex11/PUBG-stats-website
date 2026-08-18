#!/usr/bin/env python3
"""Turn the raw tournament dumps in raw/ into the static JSON the website reads.

Nothing here talks to the network: raw/ (written by fetch_source.py) plus
data/assets.json (written by fetch_assets.py) are the only inputs, so the
build is reproducible and can run in CI or offline.

    python tools/build.py

Outputs (data/):
    meta.json        tournament, stages, scoring rules, data-quality notes
    teams.json       one record per team: roster + per-stage aggregates
    players.json     one record per player: per-stage aggregates + rating
    standings.json   per-stage and combined standings
    matches.json     match index
    match/<key>.json per-match detail: teams, scoreboard, kill log, timeline
    analytics.json   leaderboards, distributions, matrices, trends
"""
from __future__ import annotations

import argparse
import json
import math
import re
import statistics
import time
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Fallback accent colours for logos too monochrome to sample a colour from.
PALETTE = [
    "#e2503f", "#f2a33c", "#4ec9b0", "#5aa2f0", "#a97bf0", "#f06fa0",
    "#61c46b", "#e8c34a", "#4fb3d9", "#c98cf0", "#f08a5d", "#7fd6a0",
    "#d95f8b", "#6b8df0", "#c9d94f", "#4fd9c9",
]
GREY = "#8b93a7"

# Player stat fields summed straight out of the game payload.
SUM_FIELDS = [
    "killNum", "damage", "knockouts", "assists", "rescueTimes", "headShotNum",
    "survivalTime", "heal", "inDamage", "driveDistance", "marchDistance",
    "killNumInVehicle", "killNumByGrenade", "gotAirDropNum", "PoisonTotalDamage",
    "useSmokeGrenadeNum", "useFragGrenadeNum", "useBurnGrenadeNum",
    "useFlashGrenadeNum", "UseSelfRescueTime", "UseEmergencyCallTime",
]
MAX_FIELDS = ["maxKillDistance"]


def log(msg):
    print(msg, flush=True)


def slugify(value):
    value = unicodedata.normalize("NFKD", str(value))
    value = "".join(c for c in value if not unicodedata.combining(c))
    value = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").lower()
    return value


def rnd(value, digits=2):
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return round(float(value), digits)


def safe_div(a, b, default=0.0):
    return (a / b) if b else default


def write_json(path, data, indent=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"), indent=indent)
    return path.stat().st_size


# --------------------------------------------------------------------------- #
# loading
# --------------------------------------------------------------------------- #
def load_raw(raw):
    manifest = json.loads((raw / "manifest.json").read_text(encoding="utf-8"))
    stages = []
    for st in manifest["stages"]:
        teams = json.loads((raw / st["teamsFile"]).read_text(encoding="utf-8"))
        standings = None
        if st.get("standingsFile") and (raw / st["standingsFile"]).exists():
            standings = json.loads((raw / st["standingsFile"]).read_text(encoding="utf-8"))
        modifiers = []
        if st.get("modifiersFile") and (raw / st["modifiersFile"]).exists():
            modifiers = json.loads((raw / st["modifiersFile"]).read_text(encoding="utf-8"))
        games = []
        for entry in st["games"]:
            doc = json.loads((raw / entry["file"]).read_text(encoding="utf-8"))
            games.append((entry, doc))
        stages.append({"stage": st, "teams": teams, "standings": standings,
                       "modifiers": modifiers, "games": games})
    return manifest, stages


# --------------------------------------------------------------------------- #
# per-match parsing
# --------------------------------------------------------------------------- #
def parse_match(entry, doc, stage_key, stage_label, order, cfg, team_ids, player_ids):
    info = doc.get("allinfo") or {}
    summary = doc.get("allinfoSummary") or {}
    players = info.get("TotalPlayerList") or []
    placement = {int(k): v for k, v in cfg["scoring"]["placement"].items()}
    per_kill = cfg["scoring"]["perKill"]

    start = int(info.get("GameStartTime") or doc.get("gameStartTime") or 0)
    fight = int(info.get("FightingStartTime") or 0) or None
    end = int(info.get("FinishedStartTime") or 0) or None
    duration = (end - start) if (start and end and end > start) else None

    title = entry.get("title") or doc.get("title") or "match"
    key = slugify(title)

    # ---- team blocks -----------------------------------------------------
    by_team = defaultdict(list)
    for p in players:
        by_team[p["teamName"]].append(p)

    teams = []
    for name, roster in by_team.items():
        rank = min(p["rank"] for p in roster)
        kills = sum(p["killNum"] for p in roster)
        pp = placement.get(rank, 0)
        team_kills = kills
        rows = []
        for p in sorted(roster, key=lambda x: (-x["killNum"], -x["damage"])):
            rows.append({
                "id": player_ids[p["uId"]],
                "name": p["playerName"],
                "uid": str(p["uId"]),
                "kills": p["killNum"],
                "damage": p["damage"],
                "knockouts": p["knockouts"],
                "assists": p["assists"],
                "rescues": p["rescueTimes"],
                "headshots": p["headShotNum"],
                "survival": p["survivalTime"],
                "maxKillDistance": p["maxKillDistance"],
                "heal": p["heal"],
                "damageTaken": p["inDamage"],
                "grenadeKills": p["killNumByGrenade"],
                "vehicleKills": p["killNumInVehicle"],
                "drive": p["driveDistance"],
                "march": p["marchDistance"],
                "zoneDamage": p["PoisonTotalDamage"],
                "died": bool(p.get("liveState") == 5 or p.get("health", 0) == 0),
                "kp": rnd(100 * safe_div(p["killNum"], team_kills), 1),
            })
        teams.append({
            "id": team_ids[name],
            "name": name,
            "teamId": roster[0]["teamId"],
            "rank": rank,
            "kills": kills,
            "placementPoints": pp,
            "points": pp + kills * per_kill,
            "damage": sum(p["damage"] for p in roster),
            "knockouts": sum(p["knockouts"] for p in roster),
            "assists": sum(p["assists"] for p in roster),
            "rescues": sum(p["rescueTimes"] for p in roster),
            "headshots": sum(p["headShotNum"] for p in roster),
            "survivors": sum(1 for p in roster
                             if not (p.get("liveState") == 5 or p.get("health", 0) == 0)),
            "lastSurvival": max(p["survivalTime"] for p in roster),
            "players": rows,
        })
    teams.sort(key=lambda t: t["rank"])

    # ---- kill log --------------------------------------------------------
    name_to_team = {p["playerName"]: p["teamName"] for p in players}
    uid_to_name = {str(p["uId"]): p["playerName"] for p in players}
    events = []
    for e in doc.get("killinfo") or []:
        causer = e.get("CauserName") or ""
        victim = e.get("VictimName") or ""
        cuid = str(e.get("CauserUID") or "0")
        vuid = str(e.get("VictimUID") or "0")
        item = str(e.get("ItemID") or "-1")
        dist = e.get("Distance")
        try:
            t = int(e.get("CurGameTime") or 0)
        except (TypeError, ValueError):
            t = 0
        zone = causer.lower() in ("playzone", "bluezone", "") or cuid == "0"
        events.append({
            "t": t,
            "type": "kill" if str(e.get("ResultHealthStatus")) == "2" else "knock",
            "causer": causer if not zone else None,
            "causerTeam": name_to_team.get(causer) if not zone else None,
            "causerUid": cuid if cuid != "0" else None,
            "victim": victim or uid_to_name.get(vuid),
            "victimTeam": name_to_team.get(victim or uid_to_name.get(vuid, "")),
            "victimUid": vuid if vuid != "0" else None,
            "item": item if item != "-1" else None,
            "distance": dist if isinstance(dist, (int, float)) and dist >= 0 else None,
            "zone": zone,
        })
    events.sort(key=lambda x: x["t"])

    logged_kills = sum(1 for e in events if e["type"] == "kill" and not e["zone"])
    logged_zone = sum(1 for e in events if e["type"] == "kill" and e["zone"])
    real_kills = sum(t["kills"] for t in teams)

    # MVP: kills first, damage as tiebreak, then survival.
    mvp = None
    flat = [(p, t) for t in teams for p in t["players"]]
    if flat:
        p, t = max(flat, key=lambda pt: (pt[0]["kills"], pt[0]["damage"], pt[0]["survival"]))
        mvp = {"id": p["id"], "name": p["name"], "team": t["name"], "teamId": t["id"],
               "kills": p["kills"], "damage": p["damage"]}

    winner = teams[0]
    return {
        "key": key,
        "title": title,
        "stage": stage_key,
        "stageLabel": stage_label,
        "order": order,
        "number": order,
        "displayTitle": "%s Game %d" % (stage_label, order),
        "short": "%s%d" % (stage_label[0].upper(), order),
        "day": _day_from_title(title),
        "game": _game_from_title(title),
        "externalGameId": doc.get("externalGameId"),
        "startTime": start or None,
        "fightStartTime": fight,
        "endTime": end,
        "duration": duration,
        "map": (summary.get("MapName") or "").strip() or None,
        "weather": (summary.get("WeatherName") or "").strip() or None,
        "teamCount": len(teams),
        "playerCount": len(players),
        "totalKills": real_kills,
        "killLog": {"events": len(events), "kills": logged_kills,
                    "zoneDeaths": logged_zone,
                    "coverage": rnd(min(1.0, safe_div(logged_kills, real_kills)), 3)},
        "winner": {"id": winner["id"], "name": winner["name"], "kills": winner["kills"],
                   "points": winner["points"]},
        "mvp": mvp,
        "teams": teams,
        "events": events,
    }


def _day_from_title(title):
    m = re.search(r"\bD(\d+)\b", title, re.I)
    return int(m.group(1)) if m else None


def _game_from_title(title):
    m = re.search(r"\bG(\d+)\b", title, re.I)
    return int(m.group(1)) if m else None


# --------------------------------------------------------------------------- #
# aggregation
# --------------------------------------------------------------------------- #
def blank_team_agg():
    return {
        "matches": 0, "wwcd": 0, "top2": 0, "top4": 0, "top8": 0,
        "placementPoints": 0, "kills": 0, "points": 0,
        "damage": 0, "knockouts": 0, "assists": 0, "rescues": 0, "headshots": 0,
        "ranks": [], "pointsSeries": [], "killsSeries": [], "rankSeries": [],
        "damageSeries": [],
    }


def finish_team_agg(agg, modifier=0.0):
    m = agg["matches"]
    ranks = agg["ranks"]
    pts = agg["pointsSeries"]
    out = {
        "matches": m,
        "wwcd": agg["wwcd"],
        "top2": agg["top2"],
        "top4": agg["top4"],
        "top8": agg["top8"],
        "placementPoints": agg["placementPoints"],
        "kills": agg["kills"],
        "points": agg["points"],
        "modifier": rnd(modifier, 2),
        "finalPoints": rnd(agg["points"] + modifier, 2),
        "damage": agg["damage"],
        "knockouts": agg["knockouts"],
        "assists": agg["assists"],
        "rescues": agg["rescues"],
        "headshots": agg["headshots"],
        "avgRank": rnd(statistics.fmean(ranks) if ranks else None),
        "bestRank": min(ranks) if ranks else None,
        "worstRank": max(ranks) if ranks else None,
        "pointsPerMatch": rnd(safe_div(agg["points"], m)),
        "killsPerMatch": rnd(safe_div(agg["kills"], m)),
        "damagePerMatch": rnd(safe_div(agg["damage"], m)),
        "wwcdRate": rnd(100 * safe_div(agg["wwcd"], m), 1),
        "top4Rate": rnd(100 * safe_div(agg["top4"], m), 1),
        "consistency": rnd(statistics.pstdev(pts) if len(pts) > 1 else 0.0),
        "knockConversion": rnd(100 * safe_div(agg["kills"], agg["knockouts"]), 1),
        "pointsSeries": pts,
        "killsSeries": agg["killsSeries"],
        "rankSeries": agg["rankSeries"],
        "damageSeries": agg["damageSeries"],
        "cumulativePoints": _cumulative(pts),
    }
    return out


def _cumulative(series):
    total = 0
    out = []
    for v in series:
        total += v
        out.append(total)
    return out


def blank_player_agg():
    agg = {f: 0 for f in SUM_FIELDS}
    agg.update({f: 0 for f in MAX_FIELDS})
    agg.update({"matches": 0, "deaths": 0, "teamKills": 0, "mvps": 0,
                "killsSeries": [], "damageSeries": [], "survivalSeries": []})
    return agg


def finish_player_agg(agg):
    m = agg["matches"]
    kills = agg["killNum"]
    return {
        "matches": m,
        "kills": kills,
        "deaths": agg["deaths"],
        "damage": agg["damage"],
        "knockouts": agg["knockouts"],
        "assists": agg["assists"],
        "rescues": agg["rescueTimes"],
        "headshots": agg["headShotNum"],
        "survival": agg["survivalTime"],
        "heal": agg["heal"],
        "damageTaken": agg["inDamage"],
        "grenadeKills": agg["killNumByGrenade"],
        "vehicleKills": agg["killNumInVehicle"],
        "airdrops": agg["gotAirDropNum"],
        "zoneDamage": agg["PoisonTotalDamage"],
        "drive": agg["driveDistance"],
        "march": agg["marchDistance"],
        "throwables": (agg["useFragGrenadeNum"] + agg["useSmokeGrenadeNum"]
                       + agg["useBurnGrenadeNum"] + agg["useFlashGrenadeNum"]),
        "frags": agg["useFragGrenadeNum"],
        "smokes": agg["useSmokeGrenadeNum"],
        "molotovs": agg["useBurnGrenadeNum"],
        "flashes": agg["useFlashGrenadeNum"],
        "selfRescues": agg["UseSelfRescueTime"],
        "longestKill": agg["maxKillDistance"],
        "mvps": agg["mvps"],
        "killsPerMatch": rnd(safe_div(kills, m)),
        "damagePerMatch": rnd(safe_div(agg["damage"], m)),
        "assistsPerMatch": rnd(safe_div(agg["assists"], m)),
        "knockoutsPerMatch": rnd(safe_div(agg["knockouts"], m)),
        "rescuesPerMatch": rnd(safe_div(agg["rescueTimes"], m)),
        "avgSurvival": rnd(safe_div(agg["survivalTime"], m)),
        "kd": rnd(safe_div(kills, agg["deaths"], float(kills))),
        "hsRate": rnd(100 * safe_div(agg["headShotNum"], kills), 1),
        "kpRate": rnd(100 * safe_div(kills, agg["teamKills"]), 1),
        "damagePerKill": rnd(safe_div(agg["damage"], kills)),
        "knockConversion": rnd(100 * safe_div(kills, agg["knockouts"]), 1),
        "survivalRate": rnd(100 * safe_div(m - agg["deaths"], m), 1),
        "killsSeries": agg["killsSeries"],
        "damageSeries": agg["damageSeries"],
        "survivalSeries": agg["survivalSeries"],
    }


RATING_WEIGHTS = [
    ("killsPerMatch", 0.28),
    ("damagePerMatch", 0.24),
    ("kpRate", 0.12),
    ("avgSurvival", 0.12),
    ("assistsPerMatch", 0.10),
    ("knockoutsPerMatch", 0.08),
    ("rescuesPerMatch", 0.06),
]


def apply_ratings(scoped_players):
    """Rating index: weighted z-score of per-match production, mapped so the
    field average is 50 and one standard deviation is 15 points."""
    if not scoped_players:
        return
    stats = {}
    for field, _w in RATING_WEIGHTS:
        vals = [p[field] or 0 for p in scoped_players]
        mean = statistics.fmean(vals)
        sd = statistics.pstdev(vals) if len(vals) > 1 else 0.0
        stats[field] = (mean, sd)
    raw = []
    for p in scoped_players:
        z = 0.0
        for field, weight in RATING_WEIGHTS:
            mean, sd = stats[field]
            if sd:
                z += weight * ((p[field] or 0) - mean) / sd
        raw.append(z)
    sd_raw = statistics.pstdev(raw) if len(raw) > 1 else 0.0
    mean_raw = statistics.fmean(raw)
    for p, z in zip(scoped_players, raw):
        p["rating"] = rnd(50 + 15 * ((z - mean_raw) / sd_raw) if sd_raw else 50.0, 1)
    ranked = sorted(scoped_players, key=lambda p: -(p["rating"] or 0))
    for i, p in enumerate(ranked, 1):
        p["ratingRank"] = i


# --------------------------------------------------------------------------- #
# analytics
# --------------------------------------------------------------------------- #
LEADERBOARDS = [
    ("kills", "Total kills", "kills", True),
    ("damage", "Total damage", "damage", True),
    ("rating", "Rating index", "rating", True),
    ("killsPerMatch", "Kills / match", "killsPerMatch", True),
    ("damagePerMatch", "Damage / match", "damagePerMatch", True),
    ("knockouts", "Knockdowns", "knockouts", True),
    ("assists", "Assists", "assists", True),
    ("rescues", "Revives", "rescues", True),
    ("headshots", "Headshot kills", "headshots", True),
    ("hsRate", "Headshot %", "hsRate", True),
    ("kpRate", "Team kill share %", "kpRate", True),
    ("kd", "K/D", "kd", True),
    ("avgSurvival", "Avg survival (s)", "avgSurvival", True),
    ("longestKill", "Longest kill (m)", "longestKill", True),
    ("grenadeKills", "Grenade kills", "grenadeKills", True),
    ("damagePerKill", "Damage / kill", "damagePerKill", True),
    ("survivalRate", "Survival %", "survivalRate", True),
]


def build_leaderboards(players, scope, min_matches):
    out = {}
    pool = [p for p in players if (p["stages"].get(scope) or {}).get("matches", 0) >= min_matches]
    for key, label, field, desc in LEADERBOARDS:
        rows = []
        for p in pool:
            s = p["stages"][scope]
            val = s.get(field)
            if val is None:
                continue
            rows.append({"id": p["id"], "name": p["name"], "team": p["teamName"],
                         "teamId": p["teamId"], "value": val,
                         "matches": s["matches"]})
        rows.sort(key=lambda r: -r["value"] if desc else r["value"])
        out[key] = {"label": label, "field": field, "rows": rows[:25]}
    return out


def build_analytics(matches, teams, players, stage_keys, weapons):
    scopes = list(stage_keys)
    analytics = {"scopes": scopes, "leaderboards": {}, "teamLeaderboards": {},
                 "weapons": {}, "distance": {}, "killTiming": {},
                 "placementMatrix": {}, "headToHead": {}, "scatter": {},
                 "matchFlow": {}, "summary": {}}

    for scope in scopes:
        analytics["leaderboards"][scope] = build_leaderboards(players, scope, 1)

        # team leaderboards
        tl = {}
        for field, label in (("points", "Points"), ("kills", "Kills"),
                             ("placementPoints", "Placement points"),
                             ("damagePerMatch", "Damage / match"),
                             ("killsPerMatch", "Kills / match"),
                             ("avgRank", "Avg placement"), ("wwcd", "WWCD"),
                             ("consistency", "Points std. dev."),
                             ("knockConversion", "Knock->kill %")):
            rows = []
            for t in teams:
                s = t["stages"].get(scope)
                if not s or not s["matches"] or s.get(field) is None:
                    continue
                rows.append({"id": t["id"], "name": t["name"], "tag": t["tag"],
                             "value": s[field], "matches": s["matches"]})
            reverse = field not in ("avgRank", "consistency")
            rows.sort(key=lambda r: r["value"], reverse=reverse)
            tl[field] = {"label": label, "rows": rows}
        analytics["teamLeaderboards"][scope] = tl

        scoped = [m for m in matches if m["stage"] == scope]

        # weapon / item usage from the kill log
        counter = Counter()
        dist_by_item = defaultdict(list)
        zone_deaths = 0
        knocks = kills = kills_players = 0
        distances = []
        timing = Counter()
        h2h = defaultdict(Counter)
        for m in scoped:
            for e in m["events"]:
                if e["type"] == "kill":
                    kills += 1
                else:
                    knocks += 1
                if e["zone"]:
                    if e["type"] == "kill":
                        zone_deaths += 1
                    continue
                if e["type"] == "kill":
                    kills_players += 1
                if e["item"]:
                    counter[e["item"]] += 1
                    if e["distance"] is not None:
                        dist_by_item[e["item"]].append(e["distance"])
                if e["distance"] is not None:
                    distances.append(e["distance"])
                if e["type"] == "kill" and m["duration"]:
                    bucket = min(9, int(safe_div(e["t"], m["duration"]) * 10))
                    timing[bucket] += 1
                if (e["type"] == "kill" and e["causerTeam"] and e["victimTeam"]
                        and e["causerTeam"] != e["victimTeam"]):
                    h2h[e["causerTeam"]][e["victimTeam"]] += 1

        weapon_rows = []
        for item, n in counter.most_common():
            ds = sorted(dist_by_item.get(item) or [])
            weapon_rows.append({
                "item": item,
                "name": weapons.get(item, {}).get("name") or None,
                "class": weapons.get(item, {}).get("class") or None,
                "events": n,
                "medianDistance": ds[len(ds) // 2] if ds else None,
                "p90Distance": ds[int(len(ds) * 0.9)] if ds else None,
                "maxDistance": ds[-1] if ds else None,
            })
        analytics["weapons"][scope] = {
            "rows": weapon_rows,
            "totalEvents": sum(counter.values()),
            "knocks": knocks,
            "kills": kills,
            "playerKills": kills_players,
            "zoneDeaths": zone_deaths,
        }

        # kill distance histogram
        bins = [0, 25, 50, 100, 150, 200, 300, 400, 600, 10000]
        labels = ["0-25", "25-50", "50-100", "100-150", "150-200", "200-300",
                  "300-400", "400-600", "600+"]
        hist = [0] * (len(bins) - 1)
        for d in distances:
            for i in range(len(bins) - 1):
                if bins[i] <= d < bins[i + 1]:
                    hist[i] += 1
                    break
        distances_sorted = sorted(distances)
        analytics["distance"][scope] = {
            "labels": labels, "counts": hist, "samples": len(distances),
            "median": distances_sorted[len(distances_sorted) // 2] if distances_sorted else None,
            "mean": rnd(statistics.fmean(distances) if distances else None, 1),
            "p90": distances_sorted[int(len(distances_sorted) * 0.9)] if distances_sorted else None,
            "max": distances_sorted[-1] if distances_sorted else None,
        }
        analytics["killTiming"][scope] = {
            "labels": ["%d-%d%%" % (i * 10, i * 10 + 10) for i in range(10)],
            "counts": [timing.get(i, 0) for i in range(10)],
        }

        # placement distribution matrix (team x placement)
        matrix = {}
        for t in teams:
            row = [0] * 16
            for m in scoped:
                for tm in m["teams"]:
                    if tm["id"] == t["id"] and 1 <= tm["rank"] <= 16:
                        row[tm["rank"] - 1] += 1
            if sum(row):
                matrix[t["id"]] = row
        analytics["placementMatrix"][scope] = matrix

        name_to_id = {t["name"]: t["id"] for t in teams}
        analytics["headToHead"][scope] = {
            name_to_id[a]: {name_to_id[b]: n for b, n in row.items() if b in name_to_id}
            for a, row in h2h.items() if a in name_to_id
        }

        analytics["scatter"][scope] = [
            {"id": p["id"], "name": p["name"], "teamId": p["teamId"],
             "x": p["stages"][scope]["damagePerMatch"],
             "y": p["stages"][scope]["killsPerMatch"],
             "r": p["stages"][scope]["avgSurvival"],
             "rating": p["stages"][scope].get("rating")}
            for p in players if p["stages"].get(scope, {}).get("matches")
        ]

        analytics["matchFlow"][scope] = [
            {"key": m["key"], "title": m["title"], "kills": m["totalKills"],
             "duration": m["duration"],
             "winner": m["winner"]["name"], "winnerId": m["winner"]["id"]}
            for m in scoped
        ]

        all_kills = sum(m["totalKills"] for m in scoped)
        durations = [m["duration"] for m in scoped if m["duration"]]
        analytics["summary"][scope] = {
            "matches": len(scoped),
            "kills": all_kills,
            "killsPerMatch": rnd(safe_div(all_kills, len(scoped))),
            "avgDuration": rnd(statistics.fmean(durations) if durations else None),
            "damage": sum(sum(t["damage"] for t in m["teams"]) for m in scoped),
            "zoneDeaths": zone_deaths,
            "killLogCoverage": rnd(min(1.0, safe_div(kills_players, all_kills)), 3),
        }
    return analytics


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=str(ROOT / "tools" / "config.json"))
    ap.add_argument("--raw", default=str(ROOT / "raw"))
    ap.add_argument("--out", default=str(ROOT / "data"))
    args = ap.parse_args()

    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))
    raw = Path(args.raw)
    out = Path(args.out)
    weapons_file = ROOT / "tools" / "weapons.json"
    weapons = {}
    if weapons_file.exists():
        weapons = json.loads(weapons_file.read_text(encoding="utf-8")).get("items", {})

    assets = {}
    assets_file = out / "assets.json"
    if assets_file.exists():
        assets = json.loads(assets_file.read_text(encoding="utf-8"))

    manifest, stages = load_raw(raw)
    log("loaded %d stages, %d games" % (len(stages), sum(len(s["games"]) for s in stages)))

    # ---- identity maps ---------------------------------------------------
    team_meta = {}
    for st in stages:
        for t in st["teams"]:
            team_meta.setdefault(t["name"], t)
    team_ids, used = {}, set()
    for i, name in enumerate(sorted(team_meta)):
        slug = slugify(name) or ("team-%d" % i)
        base, n = slug, 2
        while slug in used:
            slug = "%s-%d" % (base, n)
            n += 1
        used.add(slug)
        team_ids[name] = slug

    player_meta = {}
    for st in stages:
        for _entry, doc in st["games"]:
            for p in doc["allinfo"]["TotalPlayerList"]:
                player_meta.setdefault(p["uId"], p)
    player_ids, used = {}, set()
    for uid in sorted(player_meta, key=lambda u: player_meta[u]["playerName"].lower()):
        slug = slugify(player_meta[uid]["playerName"]) or ("p-%s" % uid)
        base, n = slug, 2
        while slug in used:
            slug = "%s-%d" % (base, n)
            n += 1
        used.add(slug)
        player_ids[uid] = slug

    # ---- parse every match ----------------------------------------------
    stage_labels = cfg.get("stageLabels", {})
    matches = []
    stage_keys = []
    stage_info = []
    for st in stages:
        title = st["stage"]["title"]
        skey = slugify(title)
        label = stage_labels.get(title, title)
        stage_keys.append(skey)
        for order, (entry, doc) in enumerate(st["games"], 1):
            matches.append(parse_match(entry, doc, skey, label, order, cfg,
                                       team_ids, player_ids))
        stage_info.append({
            "key": skey, "title": title, "label": label,
            "number": st["stage"].get("number"),
            "matches": len(st["games"]),
            "teams": len(st["teams"]),
            "modifiers": {m["teamName"]: m.get("modifier", 0) for m in st["modifiers"]},
        })

    # ---- aggregate -------------------------------------------------------
    team_aggs = defaultdict(lambda: defaultdict(blank_team_agg))
    player_aggs = defaultdict(lambda: defaultdict(blank_player_agg))
    player_team = {}
    mvp_counts = defaultdict(lambda: Counter())

    for m in matches:
        scopes = (m["stage"],)
        if m["mvp"]:
            for scope in scopes:
                mvp_counts[m["mvp"]["id"]][scope] += 1
        for t in m["teams"]:
            for scope in scopes:
                a = team_aggs[t["id"]][scope]
                a["matches"] += 1
                a["wwcd"] += 1 if t["rank"] == 1 else 0
                a["top2"] += 1 if t["rank"] <= 2 else 0
                a["top4"] += 1 if t["rank"] <= 4 else 0
                a["top8"] += 1 if t["rank"] <= 8 else 0
                a["placementPoints"] += t["placementPoints"]
                a["kills"] += t["kills"]
                a["points"] += t["points"]
                a["damage"] += t["damage"]
                a["knockouts"] += t["knockouts"]
                a["assists"] += t["assists"]
                a["rescues"] += t["rescues"]
                a["headshots"] += t["headshots"]
                a["ranks"].append(t["rank"])
                a["pointsSeries"].append(t["points"])
                a["killsSeries"].append(t["kills"])
                a["rankSeries"].append(t["rank"])
                a["damageSeries"].append(t["damage"])
            for p in t["players"]:
                player_team[p["id"]] = t["id"]
        # player level needs the raw payload fields
        for t in m["teams"]:
            team_kills = t["kills"]
            for p in t["players"]:
                for scope in scopes:
                    a = player_aggs[p["id"]][scope]
                    a["matches"] += 1
                    a["deaths"] += 1 if p["died"] else 0
                    a["teamKills"] += team_kills
                    a["killNum"] += p["kills"]
                    a["damage"] += p["damage"]
                    a["knockouts"] += p["knockouts"]
                    a["assists"] += p["assists"]
                    a["rescueTimes"] += p["rescues"]
                    a["headShotNum"] += p["headshots"]
                    a["survivalTime"] += p["survival"]
                    a["heal"] += p["heal"]
                    a["inDamage"] += p["damageTaken"]
                    a["driveDistance"] += p["drive"]
                    a["marchDistance"] += p["march"]
                    a["killNumByGrenade"] += p["grenadeKills"]
                    a["killNumInVehicle"] += p["vehicleKills"]
                    a["PoisonTotalDamage"] += p["zoneDamage"]
                    a["maxKillDistance"] = max(a["maxKillDistance"], p["maxKillDistance"])
                    a["killsSeries"].append(p["kills"])
                    a["damageSeries"].append(p["damage"])
                    a["survivalSeries"].append(p["survival"])

    # extra per-player payload fields that the match rows do not carry
    for st in stages:
        skey = slugify(st["stage"]["title"])
        for _entry, doc in st["games"]:
            for p in doc["allinfo"]["TotalPlayerList"]:
                pid = player_ids[p["uId"]]
                for scope in (skey,):
                    a = player_aggs[pid][scope]
                    a["gotAirDropNum"] += p["gotAirDropNum"]
                    a["useSmokeGrenadeNum"] += p["useSmokeGrenadeNum"]
                    a["useFragGrenadeNum"] += p["useFragGrenadeNum"]
                    a["useBurnGrenadeNum"] += p["useBurnGrenadeNum"]
                    a["useFlashGrenadeNum"] += p["useFlashGrenadeNum"]
                    a["UseSelfRescueTime"] += p["UseSelfRescueTime"]
                    a["UseEmergencyCallTime"] += p["UseEmergencyCallTime"]

    # ---- team records ----------------------------------------------------
    asset_teams = assets.get("teams", {})
    teams_out = []
    for idx, (name, meta) in enumerate(sorted(team_meta.items())):
        tid = team_ids[name]
        entry = asset_teams.get(name, {})
        color = entry.get("color")
        if not color or color == GREY:
            color = PALETTE[idx % len(PALETTE)]
        stages_out = {}
        for scope in stage_keys:
            agg = team_aggs[tid].get(scope)
            if not agg or not agg["matches"]:
                continue
            mods = next((s["modifiers"] for s in stage_info if s["key"] == scope), {})
            modifier = mods.get(name, 0) or 0
            stages_out[scope] = finish_team_agg(agg, modifier)
        roster = sorted(
            [pid for pid, t in player_team.items() if t == tid],
            key=lambda pid: -sum(sc["killNum"] for sc in player_aggs[pid].values()))
        teams_out.append({
            "id": tid,
            "name": name,
            "tag": meta.get("tag") or name[:4].upper(),
            "color": color,
            "logo": entry.get("logo"),
            "logoTone": entry.get("tone"),
            "flag": entry.get("flag"),
            "roster": roster,
            "stages": stages_out,
        })

    # standings rank inside each scope
    for scope in stage_keys:
        pool = [t for t in teams_out if scope in t["stages"]]
        pool.sort(key=lambda t: (-t["stages"][scope]["finalPoints"],
                                -t["stages"][scope]["wwcd"],
                                -t["stages"][scope]["kills"],
                                t["stages"][scope]["avgRank"] or 99))
        for i, t in enumerate(pool, 1):
            t["stages"][scope]["rank"] = i

    # ---- player records --------------------------------------------------
    asset_players = assets.get("players", {})
    team_by_id = {t["id"]: t for t in teams_out}
    players_out = []
    for uid, meta in sorted(player_meta.items(), key=lambda kv: kv[1]["playerName"].lower()):
        pid = player_ids[uid]
        pa = asset_players.get(meta["playerName"], {})
        stages_out = {}
        for scope in stage_keys:
            agg = player_aggs[pid].get(scope)
            if not agg or not agg["matches"]:
                continue
            fin = finish_player_agg(agg)
            fin["mvps"] = mvp_counts[pid][scope]
            stages_out[scope] = fin
        tid = player_team.get(pid)
        players_out.append({
            "id": pid,
            "name": meta["playerName"],
            "uid": str(uid),
            "teamId": tid,
            "teamName": team_by_id[tid]["name"] if tid else None,
            "teamTag": team_by_id[tid]["tag"] if tid else None,
            "photo": pa.get("photo"),
            "portrait": pa.get("portrait"),
            "stages": stages_out,
        })

    for scope in stage_keys:
        apply_ratings([p["stages"][scope] for p in players_out if scope in p["stages"]])

    # ---- standings -------------------------------------------------------
    standings = {}
    for scope in stage_keys:
        rows = []
        for t in teams_out:
            s = t["stages"].get(scope)
            if not s:
                continue
            rows.append({
                "rank": s["rank"], "id": t["id"], "name": t["name"], "tag": t["tag"],
                "logo": t["logo"], "flag": t["flag"], "color": t["color"],
                "matches": s["matches"], "wwcd": s["wwcd"],
                "placementPoints": s["placementPoints"], "kills": s["kills"],
                "points": s["points"], "modifier": s["modifier"],
                "finalPoints": s["finalPoints"], "avgRank": s["avgRank"],
                "damage": s["damage"], "top4": s["top4"],
                "pointsSeries": s["pointsSeries"],
                "cumulativePoints": s["cumulativePoints"],
            })
        rows.sort(key=lambda r: r["rank"])
        standings[scope] = rows

    # cross-check against the server-computed standings, if we have them
    warnings = []
    for st in stages:
        skey = slugify(st["stage"]["title"])
        srv = st.get("standings")
        if not srv:
            continue
        srv_rows = {r["teamName"]: r for r in srv.get("teams", [])}
        for row in standings[skey]:
            s = srv_rows.get(row["name"])
            if not s:
                warnings.append("%s: %s missing from server standings" % (skey, row["name"]))
                continue
            for mine, theirs in (("placementPoints", "placementPoints"),
                                 ("kills", "kills"), ("wwcd", "wwcd"),
                                 ("finalPoints", "finalPoints")):
                if abs((row[mine] or 0) - (s.get(theirs) or 0)) > 0.001:
                    warnings.append("%s: %s %s computed=%s server=%s" % (
                        skey, row["name"], mine, row[mine], s.get(theirs)))
    if warnings:
        log("! standings cross-check warnings:")
        for w in warnings[:20]:
            log("   " + w)
    else:
        log("standings cross-check: computed values match the server for every team")

    # ---- analytics -------------------------------------------------------
    analytics = build_analytics(matches, teams_out, players_out, stage_keys, weapons)

    # ---- write -----------------------------------------------------------
    tournament = json.loads((raw / "tournament.json").read_text(encoding="utf-8"))
    total_kill_events = sum(len(m["events"]) for m in matches)
    logged = sum(m["killLog"]["kills"] for m in matches)
    real = sum(m["totalKills"] for m in matches)

    meta = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sourceFetchedAt": manifest.get("fetchedAt"),
        "tournament": {
            "id": tournament.get("_id"),
            "title": tournament.get("title"),
            "label": cfg.get("tournamentLabel") or tournament.get("title"),
            "notes": tournament.get("notes") or "",
        },
        "stages": stage_info,
        "scoring": cfg["scoring"],
        "counts": {
            "matches": len(matches),
            "teams": len(teams_out),
            "players": len(players_out),
            "killEvents": total_kill_events,
        },
        "dataQuality": {
            "killLogCoverage": rnd(safe_div(logged, real), 3),
            "killLogNote": ("Kill-log analytics (weapons, distances, timing, head to head) "
                            "come from the in-game kill feed, which is captured live and is "
                            "incomplete for some matches. Player and team stat lines come "
                            "from the end-of-match payload and are complete."),
            "matchesWithoutKillLog": [m["key"] for m in matches if not m["events"]],
            "playerPhotos": sum(1 for p in players_out if p["photo"] or p["portrait"]),
            "teamLogos": sum(1 for t in teams_out if t["logo"]),
        },
        "ratingWeights": {k: v for k, v in RATING_WEIGHTS},
        "weapons": {k: {"name": v.get("name"), "class": v.get("class")}
                    for k, v in weapons.items() if v.get("name") or v.get("class")},
        "assetsMissing": len(assets.get("missing") or []),
    }

    sizes = {}
    sizes["meta.json"] = write_json(out / "meta.json", meta, indent=1)
    sizes["teams.json"] = write_json(out / "teams.json", teams_out)
    sizes["players.json"] = write_json(out / "players.json", players_out)
    sizes["standings.json"] = write_json(out / "standings.json", standings)
    sizes["analytics.json"] = write_json(out / "analytics.json", analytics)

    # Compact per-match logs: the team and player pages need every match row
    # without downloading all 36 detail files.
    match_teams = {}
    player_log = defaultdict(list)
    for m in matches:
        match_teams[m["key"]] = [{
            "id": t["id"], "rank": t["rank"], "kills": t["kills"],
            "placementPoints": t["placementPoints"], "points": t["points"],
            "damage": t["damage"], "knockouts": t["knockouts"],
            "survivors": t["survivors"], "lastSurvival": t["lastSurvival"],
        } for t in m["teams"]]
        for t in m["teams"]:
            for p in t["players"]:
                player_log[p["id"]].append({
                    "match": m["key"], "stage": m["stage"], "order": m["order"],
                    "title": m["displayTitle"], "teamRank": t["rank"], "kills": p["kills"],
                    "damage": p["damage"], "knockouts": p["knockouts"],
                    "assists": p["assists"], "rescues": p["rescues"],
                    "headshots": p["headshots"], "survival": p["survival"],
                    "kp": p["kp"], "died": p["died"],
                    "longest": p["maxKillDistance"],
                    "mvp": bool(m["mvp"] and m["mvp"]["id"] == p["id"]),
                })
    sizes["matchteams.json"] = write_json(out / "matchteams.json", match_teams)

    # Per-player kill-feed fingerprint, precomputed so a player page never has
    # to download all the match detail files.
    DIST_BINS = [(0, 25), (25, 50), (50, 100), (100, 150), (150, 200),
                 (200, 300), (300, 400), (400, 10 ** 9)]
    DIST_LABELS = ["0-25", "25-50", "50-100", "100-150", "150-200", "200-300",
                   "300-400", "400+"]
    uid_to_pid = {str(uid): pid for uid, pid in player_ids.items()}
    feed = defaultdict(lambda: defaultdict(lambda: {
        "kills": 0, "knocks": 0, "dist": [0] * len(DIST_BINS),
        "timing": [0] * 10, "victims": {}, "items": {}, "distances": [],
    }))
    for m in matches:
        for ev in m["events"]:
            pid = uid_to_pid.get(ev.get("causerUid") or "")
            if not pid:
                continue
            for scope in (m["stage"],):
                f = feed[pid][scope]
                if ev["type"] == "kill":
                    f["kills"] += 1
                else:
                    f["knocks"] += 1
                    continue
                d = ev.get("distance")
                if d is not None:
                    f["distances"].append(d)
                    for i, (lo, hi) in enumerate(DIST_BINS):
                        if lo <= d < hi:
                            f["dist"][i] += 1
                            break
                if m["duration"]:
                    f["timing"][min(9, int((ev["t"] / m["duration"]) * 10))] += 1
                vt = ev.get("victimTeam")
                if vt in team_ids:
                    key = team_ids[vt]
                    f["victims"][key] = f["victims"].get(key, 0) + 1
                if ev.get("item"):
                    f["items"][ev["item"]] = f["items"].get(ev["item"], 0) + 1
    player_feed = {}
    for pid, scopes_ in feed.items():
        player_feed[pid] = {}
        for scope, f in scopes_.items():
            ds = sorted(f.pop("distances"))
            f["distLabels"] = DIST_LABELS
            f["median"] = ds[len(ds) // 2] if ds else None
            f["p90"] = ds[int(len(ds) * 0.9)] if ds else None
            f["max"] = ds[-1] if ds else None
            f["samples"] = len(ds)
            player_feed[pid][scope] = f
    sizes["playerfeed.json"] = write_json(out / "playerfeed.json", player_feed)
    sizes["playerlog.json"] = write_json(out / "playerlog.json", player_log)

    index = []
    for m in matches:
        index.append({k: m[k] for k in (
            "key", "title", "displayTitle", "short", "stage", "stageLabel",
            "order", "number", "day", "game",
            "startTime", "duration", "map", "totalKills", "winner", "mvp",
            "teamCount", "playerCount", "killLog")})
        detail = dict(m)
        sizes.setdefault("match/*", 0)
        sizes["match/*"] += write_json(out / "match" / ("%s.json" % m["key"]), detail)
    index.sort(key=lambda m: (stage_keys.index(m["stage"]), m["order"]))
    sizes["matches.json"] = write_json(out / "matches.json", index)

    log("\nwrote:")
    for name, size in sizes.items():
        log("  %-16s %6.1f KB" % (name, size / 1024))
    log("\nteams=%d players=%d matches=%d killEvents=%d killLogCoverage=%.0f%%" % (
        len(teams_out), len(players_out), len(matches), total_kill_events,
        100 * safe_div(logged, real)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
