"""RetroMate server: scans the ROM library, serves the API, the ROM files and the web UI."""
import json
import os
import re
import sqlite3
import time
import unicodedata
from contextlib import asynccontextmanager, closing
from pathlib import Path, PurePosixPath
from urllib.parse import quote, unquote
from urllib.request import urlopen

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).parent
# Same layout as RomM "structure A": library/roms/{platform_slug}/{rom file}
ROMS = Path(os.environ.get("RETROMATE_LIBRARY", ROOT / "library")) / "roms"
DB = os.environ.get("RETROMATE_DB", str(ROOT / "retromate.db"))
# Like RomM, saves sit next to the ROMs: in-game saves (SRAM) at saves/{slug}/{game}.srm, emulator save states at
# states/{slug}/{game}/{ms}.state with a {ms}.png screenshot. Keyed by game name, so they survive a database reset.
SAVES = ROMS.parent / "saves"
STATES = ROMS.parent / "states"
# Controller mappings per console (in-game menu, shared by every device in the house): controls/{slug}.json
CONTROLS = ROMS.parent / "controls"
# Core options of a streamed game, changed from the in-game menu: options/{slug}/{game}.json ({key: value}), sent
# with every start. Browser games keep theirs in EmulatorJS (per browser).
OPTIONS = ROMS.parent / "options"
ARCHIVES = {".zip", ".7z"}

# runner "browser": libretro core compiled to WASM, run in the browser by EmulatorJS (core = EJS_core).
# runner "stream":  libretro core run on the server, video/audio/input streamed over WebRTC.
# local: an in-browser core offered next to the stream (play.html?local): "play" = Play! (web/src/local.js).
# thumbs: system folder name on thumbnails.libretro.com
PLATFORMS = {
    "gba": dict(name="Game Boy Advance", thumbs="Nintendo - Game Boy Advance", runner="browser", core="gba", exts=".gba"),
    "gbc": dict(name="Game Boy Color", thumbs="Nintendo - Game Boy Color", runner="browser", core="gb", exts=".gbc"),
    "gb": dict(name="Game Boy", thumbs="Nintendo - Game Boy", runner="browser", core="gb", exts=".gb"),
    "nes": dict(name="NES", thumbs="Nintendo - Nintendo Entertainment System", runner="browser", core="nes", exts=".nes"),
    "snes": dict(name="Super Nintendo", thumbs="Nintendo - Super Nintendo Entertainment System", runner="browser", core="snes", exts=".sfc .smc"),
    "genesis": dict(name="Mega Drive", thumbs="Sega - Mega Drive - Genesis", runner="browser", core="segaMD", exts=".md .gen .bin"),
    # PSX in the browser: EmulatorJS downloads one file, so no .cue (its .bin wouldn't come along) and no .m3u.
    # ponytail: a cue+bin folder plays its first .bin: fine for single-track games, no CD audio on multi-track ones
    # and disc 1 only on multi-disc ones; serve the folder as a zip if that matters.
    "psx": dict(name="PlayStation", thumbs="Sony - PlayStation", runner="browser", core="psx", exts=".chd .pbp .bin"),
    "ps2": dict(name="PlayStation 2", thumbs="Sony - PlayStation 2", runner="stream", core="pcsx2", local="play", exts=".iso .chd .cso .zso .ciso .m3u"),
    "wii": dict(name="Wii", thumbs="Nintendo - Wii", runner="stream", core="dolphin", exts=".iso .wbfs .rvz .gcz .ciso .wia"),
    # RPCS3 takes folder dumps too, but they are all named PS3_DISC.SFB and cloud-game tells games apart by file name
    "ps3": dict(name="PlayStation 3", thumbs="Sony - PlayStation 3", runner="stream", core="rpcs3", exts=".iso"),
}


def query(sql, args=()):
    with closing(sqlite3.connect(DB)) as c, c:
        c.row_factory = sqlite3.Row
        return [dict(r) for r in c.execute(sql, args)]


def clean_title(stem):
    """'Pokemon - Emerald Version (USA, Europe) [!]' -> 'Pokemon - Emerald Version',
    'breath-of-fire(EUR)(it,es)' -> 'Breath Of Fire', '[PS2](2004) Tekken 5' -> 'Tekken 5'"""
    t = re.sub(r"[\(\[].*?[\)\]]|[\[\]()]", " ", stem).replace("_", " ")
    if " " not in t.strip():  # one word: dashes and dots are the separators ('shadow-of-the-colossus')
        t = re.sub(r"[-.]", " ", t)
    t = " ".join(t.split())
    if t == t.lower():  # no capitals at all: capitalise words, roman numerals in full
        t = " ".join(w.upper() if re.fullmatch(r"[ivx]+", w) else w[:1].upper() + w[1:] for w in t.split())
    return t or stem


def title_key(name):
    """What box art and ROM names must share: 'Legend of Zelda, The - A Link to the Past (USA)' and
    'the-legend-of-zelda-a-link-to-the-past' -> 'legendofzeldaalinktothepast'"""
    t = unicodedata.normalize("NFKD", clean_title(name)).lower()
    t = re.sub(r"^the\s+|,\s*the\b", "", t)
    t = re.sub(r"\band\b", "", t)  # 'Mario And Luigi' = 'Mario & Luigi' (stored by libretro as 'Mario _ Luigi')
    return re.sub(r"[^a-z0-9]", "", t)


# Box art region preference when the ROM name has no exact match; prototypes and demos last.
REGIONS = ("Italy", "Europe", "World", "USA", "Japan")


def match_boxart(index, stem):
    """The libretro-thumbnails name for a ROM: its own name if listed, else the best one with the same title, else
    with the shortest title that starts with it ('A Link to the Past' -> 'A Link to the Past & Four Swords')."""
    if stem in index["names"]:
        return stem

    def rank(name):
        tags = " ".join(re.findall(r"\((.*?)\)", name))
        region = next((i for i, reg in enumerate(REGIONS) if reg in tags), len(REGIONS))
        return bool(re.search(r"Beta|Proto|Sample|Demo|Kiosk|Pirate", tags)), region, len(name)
    key = title_key(stem)
    longer = [k for k in index["keys"] if k.startswith(key)] if len(key) >= 6 else []
    found = index["keys"].get(key) or (index["keys"][min(longer, key=len)] if longer else [stem])
    return min(found, key=rank)


def boxarts(system):
    """The box art names on thumbnails.libretro.com for a system (one ~1 MB directory listing). Raises OSError offline."""
    with urlopen(f"https://thumbnails.libretro.com/{quote(system)}/Named_Boxarts/", timeout=20) as r:
        names = {unquote(h)[:-4] for h in re.findall(r'href="([^"/?]+\.png)"', r.read().decode())}
    keys = {}
    for n in names:
        keys.setdefault(title_key(n), []).append(n)
    return {"names": names, "keys": keys}


def cover_url(system, stem):
    # libretro-thumbnails match No-Intro names; these characters are replaced by '_' in file names
    name = re.sub(r'[&*/:`<>?\\|"]', "_", stem)
    return f"https://thumbnails.libretro.com/{quote(system)}/Named_Boxarts/{quote(name)}.png"


def game_name(file):
    """'gba/Golden Sun (Italy).gba' or 'gba/Golden Sun (Italy)/gs.gba' -> 'Golden Sun (Italy)'"""
    parts = PurePosixPath(file).parts
    return parts[1] if len(parts) > 2 else PurePosixPath(file).stem


def scan():
    if not ROMS.is_dir():  # library not mounted: keep the DB (and play history) as is
        return
    seen = set()
    for slug, p in PLATFORMS.items():
        exts = set(p["exts"].split()) | ARCHIVES
        folder = ROMS / slug
        for entry in folder.iterdir() if folder.is_dir() else ():
            # A game is a ROM file or, like in RomM, a folder holding it (playlist .m3u first for multi-disc)
            files = sorted(entry.rglob("*"), key=lambda f: (f.suffix != ".m3u", f)) if entry.is_dir() else [entry]
            rom = next((f for f in files if f.is_file() and f.suffix.lower() in exts), None)
            if rom:
                seen.add(rel := rom.relative_to(ROMS).as_posix())
                query("""INSERT INTO games (platform, file, title) VALUES (?, ?, ?)
                         ON CONFLICT(file) DO UPDATE SET title = excluded.title""",
                      (slug, rel, clean_title(game_name(rel))))
    for g in query("SELECT id, file FROM games"):
        if g["file"] not in seen:
            query("DELETE FROM games WHERE id = ?", (g["id"],))
    # Box art: libretro-thumbnails uses No-Intro/Redump names, ROMs often don't. Match each new game once and store
    # the name; offline, leave it unset (the client tries the ROM's own name) and retry on the next scan.
    for slug in {g["platform"] for g in query("SELECT platform FROM games WHERE cover IS NULL")}:
        try:
            index = boxarts(PLATFORMS[slug]["thumbs"])
        except OSError:
            continue
        for g in query("SELECT id, file FROM games WHERE platform = ? AND cover IS NULL", (slug,)):
            query("UPDATE games SET cover = ? WHERE id = ?", (match_boxart(index, game_name(g["file"])), g["id"]))


def out(g):
    p = PLATFORMS[g["platform"]]
    return {**g, "platform_name": p["name"], "runner": p["runner"], "core": p["core"], "local": p.get("local"),
            "cover": cover_url(p["thumbs"], g["cover"] or game_name(g["file"]))}


def get_game(game_id):
    rows = query("SELECT * FROM games WHERE id = ?", (game_id,))
    if not rows:
        raise HTTPException(404, "Game not found")
    return rows[0]


@asynccontextmanager
async def lifespan(_):
    query("""CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY, platform TEXT NOT NULL, file TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL, last_played REAL, favorite INTEGER NOT NULL DEFAULT 0, cover TEXT,
        playtime REAL NOT NULL DEFAULT 0)""")
    for column in ("favorite INTEGER NOT NULL DEFAULT 0", "cover TEXT", "playtime REAL NOT NULL DEFAULT 0"):
        # databases created before these
        try:
            query(f"ALTER TABLE games ADD COLUMN {column}")
        except sqlite3.OperationalError:
            pass
    scan()
    yield


app = FastAPI(title="RetroMate", lifespan=lifespan)


# Play! (play.html?local) runs threads, which need SharedArrayBuffer, which needs a cross-origin isolated page and
# workers. Only there: EmulatorJS changes behaviour on isolated pages. credentialless still lets cross-origin covers in.
# Same rule in web/vite.config.js for development.
@app.middleware("http")
async def isolate(request, call_next):
    response = await call_next(request)
    if "local" in request.query_params or request.url.path.startswith("/play/"):
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Embedder-Policy"] = "credentialless"
    return response


@app.get("/api/platforms")
def platforms():
    # Home and Library both start here, so added/renamed ROMs show up without a restart.
    # ponytail: full rescan per request, fine for thousands of ROMs on a local disk; a file watcher if it gets slow
    scan()
    counts = {r["platform"]: r["n"] for r in query("SELECT platform, COUNT(*) n FROM games GROUP BY platform")}
    return [{"slug": s, "name": p["name"], "runner": p["runner"], "count": counts[s]}
            for s, p in PLATFORMS.items() if s in counts]


@app.get("/api/games")
def games(platform: str | None = None):
    if platform:
        return [out(g) for g in query("SELECT * FROM games WHERE platform = ? ORDER BY title", (platform,))]
    return [out(g) for g in query("SELECT * FROM games ORDER BY title")]


@app.get("/api/games/recent")
def recent(limit: int = 12):
    return [out(g) for g in query(
        "SELECT * FROM games WHERE last_played IS NOT NULL ORDER BY last_played DESC LIMIT ?", (limit,))]


@app.get("/api/games/favorites")
def favorites():
    return [out(g) for g in query("SELECT * FROM games WHERE favorite ORDER BY title")]


@app.get("/api/games/{game_id}")
def game(game_id: int):
    return out(get_game(game_id))


@app.post("/api/games/{game_id}/played")
def played(game_id: int):
    get_game(game_id)
    query("UPDATE games SET last_played = ? WHERE id = ?", (time.time(), game_id))


# Seconds played, sent by the play page while the game is on screen. Capped so a bad client can't add days at once.
@app.post("/api/games/{game_id}/playtime")
def add_playtime(game_id: int, seconds: float):
    get_game(game_id)
    query("UPDATE games SET playtime = playtime + ? WHERE id = ?", (min(max(seconds, 0), 600), game_id))


def save_path(g):
    return SAVES / g["platform"] / f"{game_name(g['file'])}.srm"


def states_dir(g):
    return STATES / g["platform"] / game_name(g["file"])


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")  # never leave half a save behind
    tmp.write_bytes(data)
    tmp.replace(path)


@app.get("/api/games/{game_id}/save")
def get_save(game_id: int):
    path = save_path(get_game(game_id))
    if not path.is_file():
        raise HTTPException(404, "No save")
    return FileResponse(path)


@app.put("/api/games/{game_id}/save")
async def put_save(game_id: int, request: Request):
    write(save_path(get_game(game_id)), await request.body())


@app.get("/api/games/{game_id}/states")
def list_states(game_id: int):
    folder = states_dir(get_game(game_id))
    names = sorted((f.stem for f in folder.glob("*.state")), key=int, reverse=True) if folder.is_dir() else []
    return [{"name": n, "time": int(n) / 1000, "screenshot": (folder / f"{n}.png").is_file()} for n in names]


@app.post("/api/games/{game_id}/states")
async def add_state(game_id: int, request: Request):
    name = str(int(time.time() * 1000))
    write(states_dir(get_game(game_id)) / f"{name}.state", await request.body())
    return {"name": name}


def state_file(game_id, name, ext):
    if not name.isdigit():  # names are timestamps; anything else could climb out of the folder
        raise HTTPException(404, "No state")
    return states_dir(get_game(game_id)) / f"{name}.{ext}"


@app.get("/api/games/{game_id}/states/{name}")
def get_state(game_id: int, name: str):
    path = state_file(game_id, name, "state")
    if not path.is_file():
        raise HTTPException(404, "No state")
    return FileResponse(path)


@app.get("/api/games/{game_id}/states/{name}/screenshot")
def get_screenshot(game_id: int, name: str):
    path = state_file(game_id, name, "png")
    if not path.is_file():
        raise HTTPException(404, "No screenshot")
    return FileResponse(path)


@app.put("/api/games/{game_id}/states/{name}/screenshot")
async def put_screenshot(game_id: int, name: str, request: Request):
    if not state_file(game_id, name, "state").is_file():
        raise HTTPException(404, "No state")
    write(state_file(game_id, name, "png"), await request.body())
    return Response(status_code=204)


def controls_path(slug):
    if slug not in PLATFORMS:
        raise HTTPException(404, "Unknown platform")
    return CONTROLS / f"{slug}.json"


@app.get("/api/controls/{slug}")
def get_controls(slug: str):
    path = controls_path(slug)
    return json.loads(path.read_text()) if path.is_file() else {}


async def json_object(request):
    body = await request.body()
    try:
        data = json.loads(body) if len(body) < 65536 else None
    except ValueError:
        data = None
    if not isinstance(data, dict):  # the client's own format; the server only keeps it
        raise HTTPException(400, "Expected a JSON object under 64 KB")
    return data


@app.put("/api/controls/{slug}")
async def put_controls(slug: str, request: Request):
    write(controls_path(slug), json.dumps(await json_object(request)).encode())
    return Response(status_code=204)


def options_path(g):
    return OPTIONS / g["platform"] / f"{game_name(g['file'])}.json"


@app.get("/api/games/{game_id}/options")
def get_options(game_id: int):
    path = options_path(get_game(game_id))
    return json.loads(path.read_text()) if path.is_file() else {}


@app.put("/api/games/{game_id}/options")
async def put_options(game_id: int, request: Request):
    data = await json_object(request)
    if not all(isinstance(v, str) for v in data.values()):
        raise HTTPException(400, "Expected {option: value} strings")
    write(options_path(get_game(game_id)), json.dumps(data).encode())
    return Response(status_code=204)


@app.post("/api/games/{game_id}/favorite")
def toggle_favorite(game_id: int):
    get_game(game_id)
    query("UPDATE games SET favorite = NOT favorite WHERE id = ?", (game_id,))
    return {"favorite": bool(get_game(game_id)["favorite"])}


# The file name ends the URL because EmulatorJS caches ROMs in the browser keyed by the last URL segment
# (and size): a constant ".../rom" made same-size ROMs load each other. EmulatorJS sends HEAD first.
@app.api_route("/api/games/{game_id}/rom/{name}", methods=["GET", "HEAD"])
def rom(game_id: int, name: str):
    return FileResponse(ROMS / get_game(game_id)["file"])


@app.post("/api/scan")
def rescan():
    scan()
    return {"games": query("SELECT COUNT(*) n FROM games")[0]["n"]}


# Production: serve the built UI (cd web && npm run build). In development use the Vite dev server instead.
if (ROOT / "web" / "dist").is_dir():
    app.mount("/", StaticFiles(directory=ROOT / "web" / "dist", html=True), name="web")
