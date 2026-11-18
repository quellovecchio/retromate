---
name: RetroMate
description: A self-hosted retro library laid out like a games magazine on white paper, entirely usable with a controller.
colors:
  paper: "#fafafa"
  card: "#fff"
  well: "#f1f1f2"
  ink: "#0a0a0a"
  ink-2: "#5c5c5c"
  line: "#e3e3e3"
  line-2: "#cfcfcf"
  hard: "#0a0a0a"
  action-yellow: "#ffe14d"
  section: "oklch(0.62 0.2 h)"
  section-deep: "oklch(0.5 0.19 h)"
  console-gba-violet: "hue 292"
  console-gbc-citrus: "hue 92"
  console-gb-pea-green: "hue 138"
  console-nes-tomato: "hue 28"
  console-snes-raspberry: "hue 352"
  console-megadrive-cyan: "hue 222"
  console-ps1: "hue 200"
  console-ps2-cobalt: "hue 258"
  console-wii: "hue 60"
typography:
  logo:
    fontFamily: "'Archivo Variable', sans-serif"
    fontSize: "1.75rem"
    fontWeight: 900
    fontStretch: "125%"
  display:
    fontFamily: "var(--f-display) (Archivo Variable by default)"
    fontWeight: 900
    fontStretch: "75%"
    letterSpacing: "-0.015em"
  hero-title:
    fontSize: "clamp(2.4rem, 4.8vw, 4.1rem)"
    lineHeight: 0.96
  page-title:
    fontSize: "clamp(2.6rem, 5vw, 4rem)"
    lineHeight: 0.95
  stat:
    fontSize: "clamp(1.9rem, 3vw, 2.6rem)"
  body:
    fontFamily: "var(--f-body) (Archivo Variable by default)"
    fontSize: "1.0625rem"
    fontWeight: 400
  kicker:
    fontSize: "0.8rem"
    fontWeight: 800
    letterSpacing: "0.1em"
    textTransform: uppercase
rounded:
  tag: "0"
  well: "8px"
  button: "12px"
  tile: "14px"
  card: "16px"
  panel: "18px"
  hero: "20px"
  pill: "999px"
spacing:
  gutter: "clamp(16px, 4vw, 56px)"
  top-bar: "84px"
  shelf-gap: "44px"
  tile-grid: "auto-fill minmax(172px, 1fr), gap 18px 16px"
  console-grid: "auto-fill minmax(300px, 1fr), gap 22px"
shadows:
  lift: "-6px 6px 0 var(--hard)"
  lift-focus: "-8px 8px 0 var(--hard)"
  print: "-12px 12px 0 var(--hard)"
  ring: "0 0 0 3px var(--paper), 0 0 0 6px var(--ink)"
---

# Design System: RetroMate

## Overview

**Creative North Star: "Rivista"**

RetroMate is the current issue of a games magazine, set on a clean product screen. The page is white paper with black ink; every console is a section of the magazine with its own colour and page number. Home opens on the cover story, the last game played: its title set heavy and condensed, its stats between thick rules, the yellow Gioca button standing on a hard black shadow, and beside it the cover printed tilted on a halftone panel in its console's colour with a starburst saying when you left it. Below sit the shelves of tiles (recently played, favorites) and the Sommario of consoles.

The system is restraint plus a few loud magazine details. Layout, tiles, pills and fields are calm and familiar (white cards, hairlines, generous spacing); the voice comes from the condensed display type, the black kicker tags, the hard offset shadows, the halftone, the starburst and the page numbers. It was chosen as a hybrid of two explored directions, Monocromo (a clean product screen) and Rivista (a 90s games magazine); the mocks live in `.impeccable/mocks/redesign.html`.

**Key Characteristics:**
- White paper (#fafafa), white tiles with 1px hairlines, black ink, one action yellow.
- A console's colour appears as a section colour only: the tab on top of its tiles and cards, the halftone panel behind its cover, the band at the top of its page.
- Display titles in a heavy condensed cut; the logo in the wide cut of the same family.
- Hard offset shadows toward the bottom-left mean "this is lifted / selected / the action". Soft shadows only on the floating legend.
- Each console has a page number (`p.04`, `p.12`…), in the order the server lists the consoles. It is decoration with a consistent meaning: the console's section.

## Colors

### Paper and ink
- **Paper** (#fafafa): the page, the top bar, the focus gap.
- **Card** (#fff): tiles, console cards, panels, the game card, fields, pills.
- **Well** (#f1f1f2): the grey well a cover stands in on a tile.
- **Ink** (#0a0a0a) and **Ink 2** (#5c5c5c, 6.4:1 on paper): text; Ink 2 for counts, notes, captions.
- **Line** (#e3e3e3) and **Line 2** (#cfcfcf): hairlines around cards, and the outline of controls (pills, fields, secondary buttons).
- **Hard** (#0a0a0a): hard offset shadows and thick rules.

### Action
- **Action Yellow** (#ffe14d): only where a press does something (Gioca, Riprendi, the retry button, the on state of a switch, the A glyph, the search field's "type here" ring), the logo tag, the starburst, the notice and text selection. It always sits with a 2px ink outline or a hard shadow, never alone on white.

### Sections
- **Section** (oklch(0.62 0.2 h)) and **Section deep** (oklch(0.5 0.19 h)), h = the console's hue from `CASES` in `box.js`. Section fills panels that carry no text (the hero panel, the showcase stage, tile and card tabs). Section deep fills surfaces with white text (the console page band, covers without art).
- In CSS they are re-declared on every element with an inline `--bh` (`:where([style*='--bh'])`), because a custom property resolves where it is declared: a token on `:root` would freeze the default hue.
- `--hue` still follows focus (app.js) and tints the WebGL skins; on paper a console's colour comes from `--bh` only.

### Named Rules
**The One Yellow Rule.** Yellow marks an action and nothing else (plus the logo tag, starburst and notice). Never a heading colour or decoration.

**The Section Colour Rule.** A console's colour appears only on things that belong to that console. Chrome (top bar, panels, legend, pills) stays black and white.

## Typography

**Display:** `--f-display` (Archivo Variable at width 75 and weight 900 by default). **Body:** `--f-body` (Archivo Variable). Five pairings remain a per-device setting (fonts.js); only Archivo has width axes, the others ignore `font-stretch`.

- **Logo** ("Retro" + "Mate" on a yellow tag): wide cut, 125%.
- **Hero title** clamp(2.4rem, 4.8vw, 4.1rem), line-height 0.96, max 15ch, balanced.
- **Page title** (Libreria, Opzioni) clamp(2.6rem, 5vw, 4rem), with a page-sub in Ink 2 beside it.
- **Shelf title** (Giocati di recente, Preferiti, Sommario) clamp(1.5rem, 2.2vw, 1.9rem).
- **Stats** clamp(1.9rem, 3vw, 2.6rem) with tabular figures; label under in 0.92rem Ink 2.
- **Console monogram** 3.6rem on cards, up to 4.6rem in the console band.
- **Kicker**: 0.8rem, 800, uppercase, 0.1em tracking, white on a black tag; the console name inside it in its light section colour.
- **Body** 1.0625rem; tile titles 0.95rem bold, two lines max; meta 0.8rem.

**The Display Is For Names Rule.** The display face sets names and numbers (titles, monograms, stats, page numbers, the starburst). Labels, notes and controls stay in the body face.

## Layout

A fluid gutter (clamp(16px, 4vw, 56px)) under an 84px sticky top bar (brand and issue line, tabs, clock and controller) that ends in a 2px ink rule. Pages:

- **Home**: the hero (two equal columns: text, cover panel), then `Giocati di recente` (the next 7 recent games) and `Preferiti` as tile grids, then the Sommario as a wrap of console chips. Without any game played, an empty state takes the hero's place.
- **Libreria**: page title with "N giochi in M console", the search field, then the Sommario: console cards in auto-fill columns of at least 300px. Searching hides the Sommario and shows result tiles.
- **Console page**: the console band (monogram, name, count, "Sezione p.NN"), then a sticky showcase (minmax(280px, 0.75fr)) beside the search and the tile grid (2fr).
- **Opzioni**: page title, then panels (max 1180px).

Below 900px the hero stacks with the cover first; below 760px the top bar wraps, clock and legend hide, the showcase is dropped and grids tighten (tiles min 140px, consoles one column). Tiles use `content-visibility: auto`, so a 2,500-game console scrolls smoothly. Focus navigation (nav.js) is spatial by lines: keep focusables in clear rows and columns.

## Elevation & Depth

Flat paper with drawn depth. Selected or lifted things move up-right and gain a hard shadow down-left; nothing is blurred except the floating legend's soft shadow and the modal backdrop.

- **Ring** `0 0 0 3px var(--paper), 0 0 0 6px var(--ink)`: plain focus on pills, fields, buttons.
- **Lift**: focused tiles, console cards, chips and save states translate (3–4px, −3–4px) and take `-6px…-8px` hard shadow plus a 2px inset ink outline.
- **Print**: a cover set like a magazine photo (`.art-print`): rotated 4deg, a white border, `-12px 12px 0` hard shadow.
- **Action**: Gioca and Riprova sit on a 2px ink outline and a `-6px 6px 0` shadow; pressing pushes them onto it.
- **Modal panel**: 2px ink border and a `-12px 12px 0` hard shadow over a paper-tinted, blurred backdrop.

**The Hard Shadow Rule.** A hard shadow means lifted, selected or "press here". Static content never gets one.

## Shapes

Tiles 14px, console cards 16px, panels 18px, hero and modal 20px, buttons and fields 12px, chips 10px, pills and the legend fully round. Kicker tags, page-number tags and the starburst have no radius: they are printed labels. Covers keep their own shape (flat, at their art's ratio).

## Components

### Top bar
Brand (logo + the issue line "Numero {ISO week} / {month year}"), the tabs (LB / Opzioni Home Libreria / RB; the current tab has a 4px ink rule under it), the clock and the controller icon (full opacity when connected). The bar is paper with a 2px ink rule at its foot.

### Cover story (Home hero)
Kicker "Storia di copertina" + console name (+ streaming badge). Title. Stats: play time, the day last played ("oggi", "ieri", "12 nov") with the time, the console's section page. Buttons: **Gioca** (yellow, A glyph, launches directly; streamed games check the slot first) and **Stati salvati e dettagli** (opens the game card). Right: the section-colour halftone panel with the printed cover, the starburst "Riprendi {day}" (only when it has been played) and the page tag. The cover drops in on the spring, the starburst pops in 250ms later.

### Tile (`.boxcard`)
White card, a 6px section-colour tab across the top, the cover centred in a grey well (138px max), the title (two lines), and a meta row: console short name and play time on the left, the section page on the right. A favorite has a yellow star badge in the corner. A opens the game card (the cover flies into it); X toggles the favorite.

### Console card and chip
Card: 8px section tab, the monogram with the page number at its right, name and count, the first three covers fanned in the bottom-right corner (white border, hard shadow), fanning wider on focus. Chip (Home's Sommario): a 7px section stripe, the monogram and the game count.

### Console page
The band in Section deep with halftone, a monogram with a hard text shadow, the name and count, "Sezione p.NN". The showcase repeats the focused game: its printed cover dropping onto a section-colour stage, the title, play time and last day, "A Apri la scheda".

### Game card (modal)
Figure: the printed cover (landscape covers get shorter, never wider than min(34vw, 440px)). Panel: kicker with console and page, title, play time with the last session, Gioca (and Gioca in locale where a console has an in-browser core), then "Stati salvati" under a 2px ink rule with screenshot cards.

### Search field
58px white field with a Line 2 outline; focused, an ink outline, a paper gap and a yellow ring with an ink edge: yellow says "type here". With a controller it opens the daisy wheel.

### Options
Panels with a 6px ink tab; choice pills (selected = solid ink), font-pick cards (selected = ink outline and hard shadow, check icon), switches (on = yellow track with an ink knob).

### Notice
A yellow sign hinged on the top edge, 2px ink border, `-6px 6px 0` shadow; swings down on the spring and back up after 4.5 s.

### Controller legend
A white pill with a hairline and a soft shadow, bottom-right: A on yellow, other glyphs ink with paper text; the A label follows the focused element (Gioca, Apri, Scrivi, Scegli, Cambia).


### In-game menu

The one dark screen, whatever the skin (`body.play` resets the tokens), and the one place the game is still a true 3D box at its real packaging size (`box()` in `box.js`, `CASES`). Home, Select+Start or Esc during play opens a dashboard over the paused game, after the Windows Game Bar but in the set's own light. The game steps back (scale 0.94, dimmed) under a blurred backdrop tinted with the console's hue. A command bar drops in at the top: clock, then Riprendi (default focus), In pausa, Riavvia | Salva stato, Carica stato | Controller, Opzioni | Esci, with thin dividers between groups. The game card (the box, which swings round to face you on `--spring`, the console monogram, title, play time, session, last state) and the volume rocker (minus, a rising white ten-step meter, plus, mute) slide in from the left; the players card (four slots with their device) from the right, with a 40ms stagger. Closing reverses it in about 200ms with no stagger. Bigger tasks open as a panel over the middle band while the cards behind dim and go inert: load a state (screenshot grid), controller mapping (player tabs, device chips, a binding grid, Ripristina / Annulla / Salva), emulator options (a category list and a tree with breadcrumbs: A on an option with two values flips it in place, on a longer one opens its values as a checked list; the emulator supplies the tree), and restart and quit confirmations. What an emulator can't do is left out or disabled: a streamed game has one player (no player tabs) and no options yet (Opzioni disabled). Chrome uses extrusions, not blurred shadows; the only yellow is on action buttons and the toast.

A second layout, Vetrina, is chosen in Opzioni: the box stands in the middle under a spotlight in the console's hue, with its shadow on the floor, and the commands hang on two shelves either side, facing it (Riprendi, In pausa, Riavvia, Esci on the left; Salva stato, Carica stato, Controller, Opzioni on the right). The box turns about 22 degrees toward the shelf that has focus. Title and play data sit under it, volume and players in the bottom corners. Opening: the box rises spinning into place, the spotlight comes on, the commands slide onto their shelves one by one.

### Search field
A 60px dark well (16px corners, 0.28 black veil, inset white hairline, 5px bottom ledge) with a magnifier and bold input text. On focus-within the hairline turns solid white and a dark gap plus a 3px Action Yellow ring surrounds it: the yellow says "type here". With a controller, focus opens the daisy wheel.

### Font-pick card
A flat 0.08 white veil card (16px corners) showing a sample title in the pairing's display face, a sample line in its body face and the pairing name. Selected = 0.2 veil, a 2px inset yellow outline and a yellow check icon. Pressing scales to 0.97. Changing pairing crossfades the whole page (200ms view transition).

### Panel
The Options container: Panel Glass in the current hue, 20px corners, a 1px glass lip, max 1180px, generous padding (26px 28px 30px).

### Empty state and retry
Centred in a 2px dashed white (0.3) outline with 20px corners, max 520px: a 44px icon, a bold line, an Ink Soft explanation. When the server fails, a 52px Action Yellow retry button with a 5px Yellow Edge ledge sits inside; pressing drops it 4px onto a 1px ledge.

### Controller legend
A fixed pill at the bottom-right in Hints Glass with a 10px backdrop blur. Each hint is a 28px circular pad glyph (A in Action Yellow, B in white) and a bold label; the A label changes with the focused element (Gioca, Apri, Scrivi, Scegli). It dims to 0.7 when the last input was not a controller and hides on phones.


### Daisy wheel (gamepad keyboard)
A 360px disc in the dark set hue with a 10px solid rim shadow and a deep drop, holding eight 84px petals on a 108px radius, each with four characters placed like the face buttons. The petal under the stick lights to oklch(0.5 0.2 h) at 1.08 scale, and its characters sit on coloured face-button dots (X blue #2f6fe4, Y yellow #f2c200 with dark text, B red #e0423f, A green #23a85b). A centre pill shows the mode (abc / ABC / 123); a legend below names the shoulder and menu buttons by what the connected pad prints. It enters from 10px above at 0.94 scale and leaves faster than it came.

### Notice
A hinged sign that drops from the top edge: Action Yellow with Ink Dark bold text, square top corners and 16px bottom corners, the same 6px Yellow Edge ledge as the retry button, max 560px. It swings down from rotateX(-90deg) on the spring and swings back up in 200ms after 4.5 s. Used when an action cannot happen here and now, such as a streamed game whose single server slot is busy.


### Shader skins
Alternative looks chosen in Opzioni (per device, `skin.js`): a live WebGL2 backdrop replaces the white page, tinted from `--hue` (eased round the colour wheel in the shader) except where the palette is the point. Without WebGL2 the page keeps Rivista; under reduced motion the backdrop holds still.
- **Night edition** (every dark skin, `:root[data-chrome]:not([data-chrome~='light'])`): the same pages printed in white ink on smoked, blurred cards; hard shadows turn black, rules follow the ink. Light skins (Manuale, Game Boy) mix their cards from their own paper and ink.
- **Glass chrome** (most dark skins): smoked glass pills inside a lit gradient rim, cards with a hairline and a lit top edge, focus with a hue glow outside the white ring, a light running round the focused console card, page titles fading from white.
- **Aurora, Terminale, Prisma, Eco**: OpenShaders' folded light ribbons (@elsoghiar, @dolza, @isuru, @voidy): with film grain, in ASCII glyphs, clean across half the spectrum, in ASCII with an echo.
- **Reticolo**: wireframe grids and turning cubes; hairline chrome with 4px corners; boxes as see-through wireframes.
- **CRT**: a tube TV (curved glass, scanlines, RGB mask, roll bar, flicker); scanlines and colour fringes over the page too; focus lands with a phosphor flash.
- **8-bit**: a pixel-art landscape in parallax; square chrome with stepped pixel borders; focus blinks yellow/white; pixel-sharp covers.
- **Game Boy** (light): the DMG's four greens with ordered dithering, page and covers included; the hue is set aside.
- **Onde**: 2000s dashboard waves; glossy chrome, a breathing aura on focus, boxes reflected on the floor.
- **Olografico**: bokeh and a rainbow sheen; a colour-dodge foil over cards and covers that slides on focus.
- **Synthwave**: its own palette: striped sun, neon mountains, racing grid; chrome page titles, magenta-cyan rims.
- **Blueprint**: drafting paper with a construction drawing; dashed square chrome; boxes as dashed wireframes over white-on-blue covers, the showcase box labelled with its real size in mm.
- **Neon**: an arcade at night (smoke, flickering tubes); glowing titles, neon rims, focus switches on with a flicker.
- **Manuale** (light): a 90s booklet: paper, warm ink, out-of-register halftone; the action colour turns red.
- **Notte stellata**: twinkling star layers and a milky way, shifting towards the focused element. The lightest.


## Do's and Don'ts

### Do:
- **Do** give everything that belongs to a console its `--bh` inline and take its colour from `--sec` / `--sec-deep`.
- **Do** show focus as the ring, and on objects (tiles, cards, chips, states) as a lift: move up-right, hard shadow down-left, ink outline.
- **Do** set names and numbers in the display variables (`--f-display`, `--fw-display`, `--fs-display`, `--ls-display`) and everything else in `--f-body`; check new screens in all five pairings.
- **Do** keep chrome black and white; colour belongs to consoles and yellow to actions.
- **Do** check every new screen on a dark skin (night edition) and on a light skin (Manuale, Game Boy): components must read from the tokens, never from hard-coded colours.
- **Do** use `--spring` only for things landing on the page (the printed cover, the starburst, fans, the notice) and `--ease` for every UI transition; reduced motion turns them off.

### Don't:
- **Don't** put a console's colour on chrome, or a hard shadow on static content.
- **Don't** use yellow for decoration or as text on white.
- **Don't** declare a colour that depends on `--bh` on `:root`: it resolves there, with the default hue.
- **Don't** blur shadows under cards or buttons; soft shadow is only the legend's.
- **Don't** hard-code a font family or a hue in a component.
