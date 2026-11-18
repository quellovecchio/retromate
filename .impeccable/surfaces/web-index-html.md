---
version: 1
slug: "web-index-html"
primary_target: "web/index.html"
related_targets: ["web/src/app.js","web/src/style.css"]
---

Scope: the whole library UI (Home, Libreria, console page, Opzioni, game card, notice, legend). Mode: Operate. The play page and in-game menu keep their dark look.

## Direction contract

THESIS: RetroMate as a clean product screen with a games-magazine voice ("Ibrido": Monocromo's restraint + Rivista's details). Refuses both the dark showroom of 3D boxes and the generic dark cover grid.
OWN-WORLD: near-white paper #fafafa, ink #0a0a0a, white tiles with hairlines; each console's hue only as a section colour (tab on tiles, halftone panel behind the cover). Condensed heavy display titles, black kicker tags, big stats split by 2px rules, one yellow action with a hard black offset shadow, a yellow starburst, page numbers per console section, a magenta NUOVO tag. Skins swap tokens (night edition on WebGL backdrops).
STORY: open the app, see the cover story (last game) and press A to resume; recent games and the Sommario of consoles below; Libreria is the Sommario full size.
FIRST VIEWPORT: top bar (logo with yellow tag, issue line, tabs, clock) over a 2px rule; left half kicker + title + stats + Gioca; right half the console-colour halftone panel with the tilted cover and starburst; below, a row of recent tiles; Sommario chips at the bottom.
FORM: user-composed hybrid of Monocromo (catalog) and Rivista (#1 grounded); seed aa982bba; mocks in .impeccable/mocks/redesign.html (tab 9).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
