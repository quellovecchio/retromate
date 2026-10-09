# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
The self-hosting community: people who run their own server and want to play their retro ROM collection
from any device on their network. They install RetroMate themselves and share it with whoever plays at home,
so the person holding the controller may not be the one who set it up.

## Product Purpose
A self-hosted retro gaming library, inspired by RomM, usable entirely with a controller. Pick a console,
pick a game, play. Success: from launch to playing in a few presses, without touching a keyboard or mouse.

## Positioning
Light systems run in the browser (EmulatorJS, libretro cores in WASM); heavy systems (PS2) run on the server
in cloud-game and stream over WebRTC. The same play page serves both: the user never chooses or sees the difference
except as a "streaming" label.

## Operating Context
- Any device: TV, desktop monitor, tablet, phone. Designed first for a gamepad (D-pad/stick to move focus,
  A to confirm, B to go back); keyboard, mouse and touch must also work.
- Library on disk follows RomM's layout; box art comes from libretro-thumbnails and is often missing.
- Streamed systems have one worker slot: a game can be refused when someone else is playing.

## Capabilities and Constraints
- Screens today: Home (recently played, consoles), Library (consoles grid), Platform (games grid), Play (fullscreen).
- UI language: Italian.
- Vanilla JS + Vite, hash router rendering HTML strings, no UI framework.
- Focus is the only cursor on a gamepad: every interactive element must show a clear focus state.

## Evidence on Hand
- No logo, brand assets or screenshots yet. Covers are real box art fetched by file name.

## Product Principles
1. Controller first: every action reachable with D-pad + A/B, focus always visible.
2. Get to the game: fewest screens and presses between opening the app and playing.
3. The games are the content: covers and titles lead, chrome stays out of the way.
4. Works everywhere: from a TV across the room to a phone in hand.

## Accessibility & Inclusion
Readable at TV distance (10-foot UI). Focus must not rely on color alone. Respect reduced motion.
