# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

RetroMate is a self-hosted retro gaming library inspired by RomM, usable entirely with a controller.
Light systems run in the browser (EmulatorJS = libretro cores compiled to WASM). Heavy systems (PS2) run
server-side in cloud-game (native libretro cores) and stream over WebRTC.

## Commands

```bash
uv run uvicorn server:app --port 8000      # API (FastAPI + SQLite)
npm --prefix web run dev                   # UI on :5173, proxies /api to :8000
npm --prefix web run build                 # production UI in web/dist, served by server.py
uv run python test_server.py               # backend self-check (assert script, no pytest)
docker compose up -d                       # cloud-game stream server (:8100 ws, :8443/udp)
docker compose build cloud-game            # required after editing stream/Dockerfile or stream/*.patch
docker compose restart cloud-game          # required after editing stream/config.yaml
docker compose logs cloud-game             # stream errors (GST_DEBUG=1 shows GStreamer errors)
```

`.claude/launch.json` defines the `api` and `web` preview servers. On Windows `uvicorn --reload` often keeps
the old process alive: restart the `api` server after editing `server.py`.

## Architecture

- Where the data lives: `RETROMATE_LIBRARY` (default `library/`) and `RETROMATE_DB` (default `retromate.db`), read by
  `server.py` and by `docker-compose.yml`'s volumes, set per host in the unversioned `.env` (the Linux server's
  systemd unit loads the same file, `SERVER.md`).
- `server.py` is the whole backend. The `PLATFORMS` table maps each slug (same slugs as RomM) to display name,
  libretro-thumbnails system name, `runner` and EmulatorJS `core`. Library layout follows RomM:
  `library/roms/{slug}/{file}` or one folder per game (`library/roms/{slug}/{Game}/{file}`, `.m3u` preferred).
  `scan()` syncs the SQLite `games` table with the disk; it runs at startup and on every `GET /api/platforms`
  (Home and Library both call it). A renamed ROM becomes a new row, so play history and ids do not carry over.
  Titles come from `clean_title()` (tags stripped, `breath-of-fire` -> `Breath Of Fire`) and are refreshed on every
  scan. Box art: libretro-thumbnails only has No-Intro/Redump names, so each new game is matched once by `title_key()`
  against the system's directory listing (`boxarts()`, one ~1 MB fetch) and the name is stored in `games.cover`;
  set it to NULL to rematch. Offline it stays NULL and the client tries the ROM's own name.
- Saves live on the server, RomM-style, keyed by platform + game name: in-game saves (SRAM) at
  `library/saves/{slug}/{game}.srm`, save states at `library/states/{slug}/{game}/{ms}.state` (+ `{ms}.png`).
  `play.js` loads the server SRAM into EmulatorJS on start and uploads it when it changes (30 s timer, tab hidden,
  before leaving; never a blank one). EmulatorJS alone writes SRAM to IndexedDB only every 5 minutes or on unload,
  which is why saves were lost. Its Save/Load State buttons and Select+R go to the server; `?state=` starts from one.
  Play time (`games.playtime`, seconds) is sent by the play page while visible. Streamed games' states live in the
  same folders (cloud-game writes them there, zip-compressed), so the game card and `?state=` work for both runners.
- Picking a game (grid box or current cover-flow box) opens the game card, a modal: `openModal()` in `app.js` is the
  reusable `<dialog>` (panel animates in/out in CSS, a `figure` beside it can fly; B/Esc/outside click close it,
  nav.js keeps focus inside an open dialog). Only the card's links launch the game.
- In game, Home (pad button 16), Select+Start or Esc opens the in-game menu, `web/src/ingame.js` + `ingame.css`: a
  `<dialog>` dashboard (command bar, game card, volume, players; panels for states, controller mapping, emulator
  options, restart/quit confirmations) that replaces EmulatorJS's own bar and menus (hidden in CSS). It is
  emulator-agnostic: `play.js` builds an adapter (contract at the top of `ingame.js`) per runner, and optional parts
  of it switch features: `ejsAdapter` (4 players, options) and `streamAdapter` (1 player, the server core's options).
  Both map the same 24 EmulatorJS inputs (16 buttons + 8 stick directions); stream.js turns them into the RetroPad
  bits and the analog axes, so a stick direction can sit on a key or a button and vice versa. Emulator options are data: `adapter.options()` returns
  categories of option trees (`{id, label, values, value}` leaves) and `setOption(id, value)` applies one; for
  EmulatorJS that is a curated set of its settings plus every core option (`gameManager.getCoreOptions()`), applied
  with `ejs.changeSettingOption` (which also saves them per game). For a streamed game it is every option the server's
  libretro core declares (GetOptions 115 / SetOption 116, see the stream section), its categories as the menu's tabs:
  nothing per emulator, a new console gets them for free. Changes apply to the running core and are saved per game on
  the server (`GET/PUT /api/games/{id}/options` -> `library/options/{slug}/{game}.json`), sent with every start.
  The Controller panel also picks the controller the core emulates for player 1 (`adapter.emulated()`, streamed games
  only: Wii Remote, + Nunchuk, Classic Controller...), applied at once and saved per game as the `retromate_device`
  option; `WII_DEVICES` in stream.js names what each RetroPad input does on each Wii device (Dolphin's defaults,
  `DolphinLibretro/Input.cpp`: its own input descriptors aren't re-sent when the device changes).
  While open it pauses the game and blocks EmulatorJS input by overriding `ejs.isPopupOpen`; nav.js drives it
  (`data-nav-lock` is set whenever the menu is closed). Controller mappings are saved per console on the server
  (`GET/PUT /api/controls/{slug}` -> `library/controls/{slug}.json`) and applied to `ejs.controls` /
  `ejs.gamepadSelection` at start. State thumbnails come from `gameManager.screenshot()` (the core's own frame;
  the WebGL canvas reads back black), which only answers while the game runs: the menu grabs one before pausing.
  Two layouts: `bar` (Game Bar style) and `vetrina` (the box centre stage, commands on two shelves that it turns
  toward), chosen in Opzioni per device (`getMenuStyle` in `box.js`); `play.html?...&menu=bar|vetrina` overrides it.
  `box()`, `CASES` and the formatters shared by the library and the menu live in `web/src/box.js`.
- `runner` is the single switch between the two emulation paths. `web/src/play.js` reads it:
  `"browser"` loads EmulatorJS 4.2.3 from the CDN; `"stream"` loads `web/src/stream.js`.
- ROMs are served at `/api/games/{id}/rom/{filename}`. The file name must stay the last URL segment: EmulatorJS
  caches ROMs in IndexedDB keyed by that segment plus size, so a constant suffix made same-size ROMs collide.
- `web/src/nav.js` does spatial focus navigation by lines (left/right stay on the line, up/down go to the nearest
  line; a `[data-row]` such as the cover flow or the tabs counts as one line and is entered on its current item;
  the sticky top bar takes focus only with the page scrolled to the top: up with nothing above scrolls there first),
  A/Enter clicks, B/Esc goes where `<html data-back>` says (set by app.js: back in history from a console page;
  Home from Libreria/Opzioni only if the Opzioni switch is on), X (or the X key) fires a `pad-x` event on the focused element (toggles a favorite
  on games), LB/RB switch the header tabs. Opzioni can swap A and B (`getSwap`/`setSwap`, per device; glyphs marked
  `data-btn` relabel). The gamepad keyboard opens when a text field is clicked (mouse or confirm), not on focus. It covers every visible `a[href], button, input`. It acts only in the focused window (every tab sees the same pad), ignores
  buttons already down on load, and swaps confirm/back on Nintendo pads (vendor 057e). Components that need the raw
  pad set `data-nav-lock` on `<html>`. The UI is a hash router in `web/src/app.js` rendering HTML strings; escape
  user/file-derived text with `esc()`. Routes: `#/options`, `#/`, `#/library`, `#/platform/{slug}`.
- Design system "Vetrina": rules in `DESIGN.md`, tokens and components in `web/src/style.css`. Games are 3D boxes at
  their console's real packaging size (`CASES` in `app.js`) until the cover loads, then at the cover's ratio. Font pairings live in `web/src/fonts.js` (self-hosted,
  chosen in Opzioni, per device). `web/src/padtype.js` is the gamepad keyboard that opens on text fields.
- Dev only: `?data=worst|one|empty|huge` (e.g. `http://localhost:5173/?data=worst#/`) swaps the API data for the
  stress fixtures in `web/src/dev/fixtures.js`; they never ship in the build.
- `web/src/stream.js` is a minimal client for cloud-game's coordinator protocol: WebSocket JSON envelopes
  `{t, p}` (4 init, 100/101 WebRTC signalling with JSON-string `sdp`/`ice`, 104 start, 112 no free slot,
  150 video info on the data channel). The worker sends the offer. Input goes on the negotiated `data`
  channel as 14 bytes little-endian: `[buttons u16][LX LY RX RY L2 R2 i16]`, libretro joypad bit order.
  cloud-game identifies games by file stem, not by RetroMate id. OpenGL frames arrive bottom-up: honour the
  `flip` flag in the video info.

## Stream server (cloud-game)

- `stream/Dockerfile` = the official cloud-game image pinned by digest, with the coordinator and worker
  rebuilt from commit `1fab9ef` plus `stream/cloud-game.patch`, and with system Mesa + Xvfb (GLX) replacing the bundled
  llvmpipe libGL. The patch fixes cloud-game bugs found here (variable frame size, GStreamer segtrap vs PCSX2
  fastmem, GL context bound to the loading thread, `context_destroy` called after `retro_deinit` instead of before
  unloading (libretro's and RetroArch's order; Dolphin hung the worker on close, or with it skipped the NVIDIA driver
  lost the GPU), no default pixel format for cores that never set one (RPCS3: 0 bytes per pixel, panic sizing the GL
  read buffer; now XRGB8888 for GL cores), coordinator-to-worker calls timing out after 10 s (now 2 min: RPCS3's first start installs the
  firmware), slot leak on failed start, rescan on unknown game,
  `RETRO_DEVICE_ID_JOYPAD_MASK`, early `retro_serialize_size` crashing Dolphin, game loads blocking the WebSocket
  read loop so slow-loading games timed out the coordinator link, per-launch core options in the start request,
  core options read and changed at run time (the core's own declarations, any libretro API version: GetOptions 115
  answers `{categories, options: [{key, label, category, values, default, value, hidden}]}`, SetOption 116
  `{key, value}` answers ok/err and reaches the core through `GET_VARIABLE_UPDATE`; `nanoarch/options.go`), PauseGame (type 114, `{room_id, paused}`) so the in-game menu freezes a streamed game, port 1's emulated device:
  GetOptions also answers `devices` (from `SET_CONTROLLER_INFO`) and `device`, and the pseudo-option `retromate_device`
  plugs one in at start or mid-game). `stream()` returns a
  controller (pause, reset 113, save 106 / load 107 with their replies, input mapping) that `streamAdapter` wraps.
  SaveGame/LoadGame take a `name` (digits): the worker writes `library/states/{platform}/{game}/{name}.state`
  (mounted on `/usr/local/share/cloud-game/states`), the page uploads the screenshot from the `<video>` frame. Without
  a name cloud-game uses its own per-room slot, which lasts one session.
  The README lists each one. `stream.js` retries a few times when the slot is still busy (a game just quit). Regenerate the patch with `git diff` from a
  cloud-game checkout at that commit.
- Wii runs on Dolphin (`dolphin_libretro`, OpenGL core profile). Its `Sys` folder is unpacked into the image; its
  `User` folder (Wii NAND, game saves, shader cache) is `library/saves/cloud-game`, mounted on cloud-game's
  `libretro/legacy_save`. It needs `shm_size` (emulated RAM in `/dev/shm`; Docker's 64 MB ends in SIGBUS) and an
  explicit controller on port 1 (`hid: 0: [1281]`, Classic Controller Pro): Dolphin leaves ports empty otherwise.
  The Wii system language is chosen in Opzioni (per device, Italian by default) and sent by `stream.js` in the start
  request as `options.dolphin_language` (a value saved for the game from the in-game menu wins); `stream/config.yaml`
  holds the default. Dolphin writes it to the NAND's SYSCONF (`IPL.LNG`).
- PS3 runs on RPCS3 (`rpcs3_libretro`) with `rpcs3_renderer: vulkan` and the `vulkan` hack: it renders on the
  frontend's device and hands frames over with `set_image`. Its own fallback without a frontend context ("Vulkan
  without a hardware context", copied back through memory) froze on the loading screen with the game's audio playing:
  it drops frames that aren't BGRA (`software present got a non-BGRA frame`; RPCS3's own log, `*.log` in
  `library/saves/ps3/rpcs3`). `opengl` makes it draw into our GLX context through a shared context it creates for its
  RSX thread. An image format `vk_readback` doesn't convert is logged once as `vulkan: frame format N`. Firmware
  `library/bios/ps3/PS3UPDAT.PUP`, installed on the first start; its system folder (dev_flash, dev_hdd0 with the game
  saves, caches) is `library/saves/ps3/rpcs3`. `.iso` only: folder dumps are all named `PS3_DISC.SFB`, and cloud-game
  tells games apart by file stem. No save states (RPCS3 can't serialize). It links libOpenGL, libvulkan and libasound,
  which the image only has because `stream/Dockerfile` installs them: a new core's missing library shows up as
  `couldn't load the lib: ...` in the worker log, so check its DT_NEEDED first.
- PS2 memory cards (`Mcd001.ps2`, `Mcd002.ps2`, shared by every game) are in `library/saves/ps2/memcards`, mounted on
  LRPS2's `system/pcsx2/memcards`. Anything a core writes outside a mounted folder dies with the container: check where
  a new core keeps its saves before trusting it.
- PSX runs in the browser (EmulatorJS `psx`, pcsx_rearmed). EmulatorJS downloads one file, so the scan takes
  `.chd/.pbp/.bin`, never `.cue`/`.m3u`: multi-track games lose CD audio, multi-disc ones play disc 1.
- `docker-compose.wsl.yml` is WSL2-only (GPU via Mesa d3d12 on `/dev/dxg`), loaded only where the unversioned `.env`
  says `COMPOSE_FILE=docker-compose.yml;docker-compose.wsl.yml` (this Windows machine). Its d3d12 translation renders
  some effects wrong (Burnout 3's white block, NFS ProStreet's missing cars; llvmpipe renders them right).
  `docker-compose.nvidia.yml` is for a dedicated Linux host with the NVIDIA driver (`SERVER.md`, its `.env` uses `:`
  as separator): no Xvfb, the worker talks GLX to the host's headless Xorg (`xorg-headless.service`, display `:0`,
  socket mounted) and nvidia-container-toolkit mounts the driver's libraries, so GL is native. cloud-game creates its
  GL context with GLX only (`graphics/rgfw.go`, no EGL), hence an X server either way.
- Vulkan: upstream cloud-game hosted OpenGL only. The patch adds libretro's Vulkan frontend side
  (`nanoarch/vulkan.c`, `vk.h`, `vulkan.go`, vendored `libretro_vulkan.h`): headless instance and device (through the
  core's context negotiation interface when it has one; discrete GPU first, a CPU device like lavapipe only with
  `RETROMATE_VULKAN_CPU` set), `GET_HW_RENDER_INTERFACE`, and each `set_image` copied into host memory as XRGB8888
  in `video_refresh` (one frame in flight, so sync index 0). Offered only to cores with the `vulkan` hack in
  `stream/config.yaml` and only where `vk_available()` finds a GPU: `GET_PREFERRED_HW_RENDER` then answers Vulkan
  (OpenGL core otherwise, e.g. WSL2, which has no Vulkan driver in the container), and any other Vulkan
  `SET_HW_RENDER` is refused (accepted, it used to fall into the GL path and crash with BadMatch). PS2 has the hack,
  with `pcsx2_renderer: Auto` stated in the config (cloud-game passes only listed options: unset, LRPS2 got an empty
  value and fell back to OpenGL); PS3 too. Cores retract their image with `set_image(NULL)` before destroying it. A core that ends up with no hardware context runs as a software core (`gl.enabled` off).
  Vulkan frames are top down: no `flip`.
- `stream/config.yaml` overrides cloud-game's defaults. At start cloud-game passes only the core options listed
  there plus the start request's (no core defaults), which is why `pcsx2_bios` must name a file in `library/bios/ps2`.
  The VP8 encoder runs at 20 Mbit/s with `static-threshold=0` (upstream: 3.2 Mbit/s and 100, which froze FIFA 14's
  low-contrast pitch into 16x16 blocks), `max-quantizer=40` and `undershoot=50` (upstream 63 and 100: Kingdom Hearts'
  dark scenes broke into JPEG-like blocks). `ps2` uses
  `skip_hw_context_destroy`, otherwise the worker hangs when a game closes.
- One worker = one game at a time. After testing a streamed game in the browser pane, navigate away from
  `play.html` and confirm the slot is free, or the user's own launch is refused.
