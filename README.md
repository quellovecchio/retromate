# RetroMate

Self-hosted retro gaming library, inspired by [RomM](https://github.com/rommapp/romm), that you can use entirely with a controller.

- Light systems (GBA, NES, SNES…) run **in the browser**: libretro/RetroArch cores compiled to WASM via [EmulatorJS](https://emulatorjs.org).
- Heavy systems (PS2) run **on the server** with [cloud-game](https://github.com/giongto35/cloud-game): native libretro cores, video/audio over WebRTC, input over a data channel ([stream.js](web/src/stream.js)).

The play page is the same for both modes. The platform's `runner` in [server.py](server.py) (`"browser"` or `"stream"`) decides which one is used.

## Library

Same layout as RomM:
- `library/roms/{platform}/{file}`, e.g. `library/roms/gba/Metroid Fusion (USA).gba`
- or one folder per game: `library/roms/gba/Metroid Fusion (USA)/whatever.gba`
- PS2 BIOS: `library/bios/ps2/*.bin`
Use No-Intro names: the box art comes from `thumbnails.libretro.com` and is matched by file name.
Supported platforms and their cores are in the `PLATFORMS` table in [server.py](server.py). After adding ROMs, restart the server or call `POST /api/scan`.

## Development

```bash
uv run uvicorn server:app --port 8000
```

```bash
npm --prefix web install
npm --prefix web run dev
```

Open http://localhost:5173. Vite proxies `/api` to the backend.

For production, run `npm --prefix web run build`. The backend then serves `web/dist` on port 8000.

Self-check: `uv run python test_server.py`

### Streaming server (PS2)

```bash
docker compose up -d
```

- **Ports:** cloud-game listens on `8100` (WebSocket signalling) and `8443/udp` (WebRTC).
- **Other machines on the LAN:** start it with `STREAM_HOST_IP=<host LAN IP>`.
- **Configuration:** PS2 (LRPS2) and Wii (Dolphin) core settings are in [stream/config.yaml](stream/config.yaml). Cores are downloaded automatically from the libretro buildbot; Dolphin's `Sys` files are baked into the image.
- **PS2 BIOS:** `pcsx2_bios` in [stream/config.yaml](stream/config.yaml) must name a file present in `library/bios/ps2`. cloud-game doesn't pass the core's defaults, so without it you get `Could not find any valid PS2 BIOS`.
- **GPU:** on Windows (Docker Desktop/WSL2), [docker-compose.wsl.yml](docker-compose.wsl.yml) renders OpenGL on the NVIDIA GPU through WSL2's D3D12. Shadow of the Colossus goes from ~18 fps on the CPU to 60 fps. Load it with a `.env` file (not versioned) next to `docker-compose.yml` containing `COMPOSE_FILE=docker-compose.yml;docker-compose.wsl.yml`; without it the stream falls back to llvmpipe on the CPU. That translation renders some effects wrong (Burnout 3, NFS ProStreet): a dedicated Linux host with native NVIDIA drivers is set up as in [SERVER.md](SERVER.md).
- **Image:** the image is the official one with patched coordinator and worker, plus system Mesa and Xvfb with GLX ([stream/Dockerfile](stream/Dockerfile), [cloud-game.patch](stream/cloud-game.patch)). The patch fixes:
  - LRPS2 changes frame size without telling the frontend (green screen).
  - GStreamer's segtrap mistakes PCSX2's intentional fastmem faults for crashes.
  - The GL context stayed bound to the loading thread (`BadAccess` with real Mesa).
  - A game that fails to load left the worker slot reserved ("no free workers" until restart).
  - Games added after startup are not found (the library rescans on an unknown name).
  - `RETRO_DEVICE_ID_JOYPAD_MASK` queries returned only one button: LRPS2 reads Start/Select/L3/R3 that way, so Start never reached PS2 games.
  - `retro_serialize_size` was called right after loading, only for a log line: Dolphin isn't booted yet then and crashes the worker.
  - Start requests can carry core option values (`options`): RetroMate sends the Wii system language chosen in Opzioni and the options saved for the game.
  - Core options can be listed and changed while a game runs (`GetOptions` 115, `SetOption` 116): the worker records what the core declares (any libretro core options API version) and passes changes on through `GET_VARIABLE_UPDATE`. The in-game menu's Opzioni shows them, so every streamed console has its emulator options without a list per emulator.
  - Save/Load requests can name a state: the worker keeps it in RetroMate's `library/states/{platform}/{game}/`, so streamed games' states outlive the session and show up in the game card like browser ones (cloud-game's own slot is per room).
  - The controller a core emulates can be chosen (Wii: Wii Remote upright or sideways, + Nunchuk, Classic Controller...): the worker keeps the devices the core lists for port 1 (`SET_CONTROLLER_INFO`, ignored upstream) and sends them with `GetOptions`; the pseudo-option `retromate_device` (start request or `SetOption`) plugs one in with `retro_set_controller_port_device`, also mid-game. The in-game menu's Controller panel offers them and saves the choice per game.
  - Games can be paused (`PauseGame`, message type 114): the frame loop idles without running the core, so the in-game menu freezes a streamed game like a local one.
  - The worker loaded games inside its WebSocket read loop, so it stopped answering the coordinator's pings: a game that takes a couple of seconds to load (Wii) timed out the link and the start was cancelled ("Il server non ha avviato il gioco").

  After changing the patch, run `docker compose build`.
- **Wii (Dolphin):** game saves (the Wii NAND) are in `library/saves/cloud-game/User`. Port 1 is a Classic Controller Pro; games that only accept the Wii Remote need `hid: 0: [769]` (Wii Remote + Nunchuk) in [stream/config.yaml](stream/config.yaml). The system language is set in Opzioni (Italian by default). `shm_size: 1gb` in [docker-compose.yml](docker-compose.yml) is required: Dolphin keeps the emulated RAM in `/dev/shm` and Docker's 64 MB default crashes it with SIGBUS.
- **Errors:** if the game doesn't start, check `docker compose logs cloud-game`. A missing BIOS is logged as `Could not find any valid PS2 BIOS`.
- **Stream keyboard:** arrows, Z=✕, X=○, A=□, S=△, Enter=Start, right Shift=Select, Q/W=L1/R1.

## Controls

| Controller | Keyboard | Action |
|---|---|---|
| D-pad / left stick | Arrow keys | Move between tiles |
| A | Enter | Open / launch |
| B | Esc / Backspace | Back |
| Home, or Select+Start (in game) | Esc | Open / close the in-game menu (resume, pause, restart, states, controller mapping, options, quit) |
| Select+R (in game) | | Save a state |
| | Shift+Esc (in game) | Return to the library |
| Corner button (touch / mouse, in game) | | Open the in-game menu |
