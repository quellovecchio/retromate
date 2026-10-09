"""Self-check: uv run python test_server.py"""
import os
import tempfile
from pathlib import Path

tmp = Path(tempfile.mkdtemp())
os.environ["RETROMATE_LIBRARY"] = str(tmp)
os.environ["RETROMATE_DB"] = str(tmp / "test.db")
(tmp / "roms" / "gba").mkdir(parents=True)
(tmp / "roms" / "gba" / "Pokemon - Emerald Version (USA, Europe).gba").write_bytes(b"rom")
(tmp / "roms" / "gba" / "notes.txt").write_text("not a rom")
(tmp / "roms" / "gba" / "Mario vs. Donkey Kong (Europe)").mkdir()
(tmp / "roms" / "gba" / "Mario vs. Donkey Kong (Europe)" / "0042 - mvdk.gba").write_bytes(b"rom2")

from fastapi.testclient import TestClient  # noqa: E402
import server  # noqa: E402

assert server.clean_title("Metroid Fusion (USA) [!]") == "Metroid Fusion"
assert server.clean_title("breath-of-fire(EUR)(it,es)") == "Breath Of Fire"
assert server.clean_title("[PS2](2004) Tekken 5") == "Tekken 5"
assert server.clean_title("Final Fantasy VI (III) (ITA)]") == "Final Fantasy VI"
assert server.clean_title("final_fantasy_vi") == "Final Fantasy VI"
assert server.clean_title("Banjo-Kazooie - La Vendetta di Grunty (Italy)") == "Banjo-Kazooie - La Vendetta di Grunty"
assert server.title_key("Legend of Zelda, The - A Link to the Past (USA)") == server.title_key("the-legend-of-zelda-a-link-to-the-past")
idx = {"names": {"Animaniacs (USA)", "Animaniacs (Europe)", "Animaniacs (Europe) (Beta)", "Tetris (World)",
                 "Mario & Luigi - Superstar Saga (Europe)", "Legend of Zelda, The - A Link to the Past & Four Swords (Europe)"}}
idx["keys"] = {}
for n in idx["names"]:
    idx["keys"].setdefault(server.title_key(n), []).append(n)
assert server.match_boxart(idx, "Animaniacs (ITA)") == "Animaniacs (Europe)"
assert server.match_boxart(idx, "Tetris (World)") == "Tetris (World)"
assert server.match_boxart(idx, "Unknown Game (ITA)") == "Unknown Game (ITA)"
assert server.match_boxart(idx, "Mario And Luigi Superstar Saga (E)") == "Mario & Luigi - Superstar Saga (Europe)"
assert server.match_boxart(idx, "The Legend Of Zelda - A Link To The Past (E)").startswith("Legend of Zelda, The")
# No network in the self-check: the box art index is the one above.
server.boxarts = lambda system: idx
assert server.cover_url("Nintendo - Game Boy Advance", "A/B: C?").endswith("/Named_Boxarts/A_B_%20C_.png")

with TestClient(server.app) as c:
    assert c.get("/api/platforms").json() == [{"slug": "gba", "name": "Game Boy Advance", "runner": "browser", "count": 2}]
    folder_game, g = c.get("/api/games?platform=gba").json()
    assert folder_game["title"] == "Mario vs. Donkey Kong" and folder_game["cover"].endswith("/Mario%20vs.%20Donkey%20Kong%20%28Europe%29.png")
    assert c.get(f"/api/games/{folder_game['id']}/rom/x.gba").content == b"rom2"
    assert g["title"] == "Pokemon - Emerald Version" and g["core"] == "gba"
    assert c.get("/api/games/recent").json() == []
    c.post(f"/api/games/{g['id']}/played")
    assert [r["id"] for r in c.get("/api/games/recent").json()] == [g["id"]]
    assert c.get(f"/api/games/{g['id']}/rom/x.gba").content == b"rom"
    assert c.get("/api/games/favorites").json() == [] and g["favorite"] == 0
    assert c.post(f"/api/games/{g['id']}/favorite").json() == {"favorite": True}
    assert [f["id"] for f in c.get("/api/games/favorites").json()] == [g["id"]]
    assert c.post(f"/api/games/{g['id']}/favorite").json() == {"favorite": False}
    assert c.get("/api/games/999").status_code == 404
    # saves, save states, play time
    assert c.get(f"/api/games/{g['id']}/save").status_code == 404
    c.put(f"/api/games/{g['id']}/save", content=b"sram")
    assert c.get(f"/api/games/{g['id']}/save").content == b"sram"
    assert (tmp / "saves" / "gba" / "Pokemon - Emerald Version (USA, Europe).srm").read_bytes() == b"sram"
    assert c.get(f"/api/games/{g['id']}/states").json() == []
    name = c.post(f"/api/games/{g['id']}/states", content=b"state1").json()["name"]
    assert c.put(f"/api/games/{g['id']}/states/{name}/screenshot", content=b"png").status_code == 204
    [st] = c.get(f"/api/games/{g['id']}/states").json()
    assert st["name"] == name and st["screenshot"] is True
    assert c.get(f"/api/games/{g['id']}/states/{name}").content == b"state1"
    assert c.get(f"/api/games/{g['id']}/states/{name}/screenshot").content == b"png"
    assert c.get(f"/api/games/{g['id']}/states/..%2F..%2Fx").status_code == 404
    assert c.put(f"/api/games/{g['id']}/states/123/screenshot", content=b"png").status_code == 404
    c.post(f"/api/games/{g['id']}/playtime?seconds=60")
    c.post(f"/api/games/{g['id']}/playtime?seconds=99999")
    assert c.get(f"/api/games/{g['id']}").json()["playtime"] == 660
    # controller mappings per console
    assert c.get("/api/controls/gba").json() == {}
    assert c.put("/api/controls/gba", json={"players": [{"device": "keyboard"}]}).status_code == 204
    assert c.get("/api/controls/gba").json() == {"players": [{"device": "keyboard"}]}
    assert c.put("/api/controls/gba", content=b"[1]").status_code == 400
    assert c.get(f"/api/games/{g['id']}/options").json() == {}
    assert c.put(f"/api/games/{g['id']}/options", json={"mgba_solar": "5"}).status_code == 204
    assert c.get(f"/api/games/{g['id']}/options").json() == {"mgba_solar": "5"}
    assert (tmp / "options" / "gba" / "Pokemon - Emerald Version (USA, Europe).json").is_file()
    assert c.put(f"/api/games/{g['id']}/options", json={"mgba_solar": 5}).status_code == 400
    assert c.get("/api/controls/nope").status_code == 404
    (tmp / "roms" / "gba" / "Pokemon - Emerald Version (USA, Europe).gba").unlink()
    assert c.post("/api/scan").json() == {"games": 1}

print("ok")
