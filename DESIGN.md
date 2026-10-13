---
name: RetroMate
description: A self-hosted retro library you browse like a collector's display window, entirely with a controller.
colors:
  action-yellow: "#ffe14d"
  action-yellow-edge: "oklch(0.62 0.16 70)"
  ink-white: "#fff"
  ink-soft: "rgb(255 255 255 / 0.8)"
  ink-dark: "#170d2e"
  set-floor: "oklch(0.17 0.11 292)"
  set-key-light: "oklch(0.74 0.2 292 / 0.7)"
  set-footlight: "oklch(0.62 0.24 332)"
  set-ceiling: "oklch(0.36 0.19 262)"
  panel-glass: "oklch(0.22 0.1 292 / 0.62)"
  hints-glass: "oklch(0.18 0.1 292 / 0.75)"
  focus-gap: "oklch(0.2 0.1 292)"
  veil-light: "rgb(255 255 255 / 0.1)"
  veil-light-strong: "rgb(255 255 255 / 0.2)"
  veil-dark: "rgb(0 0 0 / 0.28)"
  plastic-case-black: "#121218"
  daisy-disc: "oklch(0.2 0.1 292)"
  daisy-rim: "oklch(0.12 0.08 292)"
  daisy-petal: "rgb(255 255 255 / 0.08)"
  daisy-petal-lit: "oklch(0.5 0.2 292)"
  console-gba-violet: "oklch(0.64 0.22 292)"
  console-gbc-citrus: "oklch(0.64 0.22 92)"
  console-gb-pea-green: "oklch(0.64 0.22 138)"
  console-nes-tomato: "oklch(0.64 0.22 28)"
  console-snes-raspberry: "oklch(0.64 0.22 352)"
  console-megadrive-cyan: "oklch(0.64 0.22 222)"
  console-ps2-cobalt: "oklch(0.64 0.22 258)"
typography:
  display:
    fontFamily: "'Archivo Variable', sans-serif"
    fontSize: "4rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0"
    fontVariation: "'wdth' 125"
  headline:
    fontFamily: "'Archivo Variable', sans-serif"
    fontSize: "clamp(2rem, 4vw, 3rem)"
    fontWeight: 900
    letterSpacing: "0"
    fontVariation: "'wdth' 125"
  title:
    fontFamily: "'Archivo Variable', sans-serif"
    fontSize: "clamp(1.6rem, 3.4vw, 2.6rem)"
    fontWeight: 900
    lineHeight: 1.1
    fontVariation: "'wdth' 125"
  body:
    fontFamily: "'Archivo Variable', system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
  body-strong:
    fontFamily: "'Archivo Variable', system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 700
    lineHeight: 1.25
  label:
    fontFamily: "'Archivo Variable', system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 700
    fontFeature: "'tnum'"
  label-small:
    fontFamily: "'Archivo Variable', system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 800
rounded:
  block: "3px"
  card: "4px"
  tag: "6px"
  button: "14px"
  field: "16px"
  panel: "20px"
  pill: "999px"
spacing:
  gutter: "clamp(16px, 4vw, 56px)"
  top-bar: "80px"
  legend-clearance: "140px"
  box-grid-gap: "22px 18px"
  block-grid-gap: "170px 44px"
  panel-padding: "26px 28px 30px"
components:
  nav-pill:
    backgroundColor: "{colors.veil-light}"
    textColor: "{colors.ink-white}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "46px"
  nav-pill-current:
    backgroundColor: "{colors.ink-white}"
    textColor: "{colors.ink-dark}"
  logo-tag:
    backgroundColor: "{colors.action-yellow}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.tag}"
    padding: "0 8px"
  console-block:
    backgroundColor: "{colors.console-gba-violet}"
    textColor: "{colors.ink-white}"
    typography: "{typography.display}"
    rounded: "{rounded.block}"
    padding: "18px 20px"
    width: "220px"
    height: "150px"
  game-box:
    backgroundColor: "{colors.console-gba-violet}"
    textColor: "{colors.ink-white}"
    height: "160px"
  game-box-plastic:
    backgroundColor: "{colors.plastic-case-black}"
    textColor: "{colors.ink-white}"
  boxcard:
    textColor: "{colors.ink-white}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.button}"
    padding: "10px 0 14px"
  cover-flow-item:
    height: "clamp(190px, 34vh, 330px)"
  search-field:
    backgroundColor: "{colors.veil-dark}"
    textColor: "{colors.ink-white}"
    rounded: "{rounded.field}"
    padding: "0 20px"
    height: "60px"
    width: "560px"
  font-pick:
    backgroundColor: "rgb(255 255 255 / 0.08)"
    textColor: "{colors.ink-white}"
    rounded: "{rounded.field}"
    padding: "18px 20px"
  font-pick-selected:
    backgroundColor: "{colors.veil-light-strong}"
  panel:
    backgroundColor: "{colors.panel-glass}"
    textColor: "{colors.ink-white}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel-padding}"
  empty-state:
    textColor: "{colors.ink-white}"
    rounded: "{rounded.panel}"
    padding: "32px 24px"
    width: "520px"
  retry-button:
    backgroundColor: "{colors.action-yellow}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.button}"
    padding: "0 26px"
    height: "52px"
  hints-legend:
    backgroundColor: "{colors.hints-glass}"
    textColor: "{colors.ink-white}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
  pad-glyph:
    backgroundColor: "{colors.action-yellow}"
    textColor: "{colors.ink-dark}"
    typography: "{typography.label-small}"
    rounded: "{rounded.pill}"
    size: "28px"
  daisy-wheel:
    backgroundColor: "{colors.daisy-disc}"
    textColor: "{colors.ink-white}"
    rounded: "{rounded.pill}"
    size: "360px"
  daisy-petal-active:
    backgroundColor: "{colors.daisy-petal-lit}"
    size: "84px"
---

# Design System: RetroMate

## Overview

**Creative North Star: "La Vetrina"**

RetroMate is a shop window. Every game is a physical box standing on a seamless coloured photo set, and the set is lit in the hue of whatever has focus: move onto a Game Boy Advance title and the whole backdrop turns violet, onto a Mega Drive game and it swings to cyan. The library is browsed the way a collector looks at a display: boxes at their real packaging proportions, consoles as solid blocks with their games fanned out of the top, a cover flow of recently played boxes on Home, and a camera that flies forward into a deeper page and pulls back out of it.

Objects behave physically. Boxes are true six-faced 3D (cardboard for Nintendo, black plastic cases with a rim and a gloss for Mega Drive and PS2), console blocks are oblique cuboids whose depth faces extrude when lifted, grid boxes stand turned 30 degrees to show their spine and square up to face you when selected. Chrome is quiet and flat on top of this: white ink, translucent veils, one action yellow. The system is built for a gamepad first and a TV across the room, so focus is never subtle: a dark gap, a white ring, and the object itself moves.

The system refuses the flat grid of rectangular covers that every ROM manager ships. A game is never a thumbnail in a tile; it is an object on a set.

**Key Characteristics:**
- A vivid oklch backdrop driven by one per-console hue, re-lit on every focus change.
- White ink everywhere; one action yellow (#ffe14d) with a darker extruded edge.
- Fake 3D throughout: preserve-3d boxes at real millimetre proportions, skewed cuboid blocks, hard offset extrusions instead of blurred shadows.
- Focus is a dark gap plus a white ring, and the focused object lifts, squares up or faces the viewer.
- A View Transition camera: deeper pages fly forward, back pulls away. Switching between tabs (Home, Libreria, Opzioni) is a 200ms crossfade instead, and a new navigation cuts a flight still running.
- Five self-hosted sans-serif pairings, swapped at runtime through display/body variables.

## Colors

A saturated, single-hue lit set under white ink, punctuated by one yellow that means "act here".

### Primary
- **Action Yellow** (#ffe14d): the one action colour. It marks what a press does: the A glyph in the controller legend, the retry button, the ring around an active text field, the check on the selected font pairing, the "Mate" tag in the logo, text selection and the connected-controller icon.
- **Action Yellow Edge** (oklch(0.62 0.16 70)): the extruded underside of yellow surfaces (logo tag offset, retry button's 5px ledge). Never used alone.

### Secondary
- **Console Hues** (oklch(0.64 0.22 h)): each console owns one hue, used for its block face, its box spines and the whole set when one of its objects has focus. GBA Violet (292), GBC Citrus (92), GB Pea Green (138), NES Tomato (28), SNES Raspberry (352), Mega Drive Cyan (222), PS2 Cobalt (258). The block face is a gradient from this colour mixed with white to oklch(0.46 0.19 h); its top face is oklch(0.82 0.15 h), its side oklch(0.42 0.19 h). Cardboard spines vary per title around the hue (lightness 0.52 / 0.6 / 0.7, hue plus or minus 15, from a hash of the title) like a real shelf.

### Neutral
- **The Set** (set-floor, set-key-light, set-footlight, set-ceiling): the backdrop is three layered gradients built from the focused hue: a key light high in the centre, a footlight shifted 40 degrees of hue below, and a ceiling shifted -30 degrees fading into the floor. All four tokens are written at the default hue 292; in code they read `--hue`.
- **Ink White** (#fff): all text and icons, the current nav pill, the focus ring.
- **Ink Soft** (rgb(255 255 255 / 0.8)): secondary text (counts, notes, captions, loading).
- **Ink Dark** (#170d2e): text only on yellow or white surfaces.
- **Panel Glass / Hints Glass** (hue-driven, 0.62 and 0.75 alpha): the Options panel and the floating controller legend; the legend also blurs (10px).
- **Veils** (white 0.1 / 0.2, black 0.28): flat translucent fills for nav pills, font cards (selected = 0.2) and the search well.
- **Plastic Case Black** (#121218): the front of Mega Drive and PS2 cases; their sides are a #0d0d12 to #26262e sheen.

### Named Rules
**The One Yellow Rule.** Action Yellow appears only where a press does something or on the logo tag. It is never a decorative fill, a border for its own sake, or a heading colour.

**The Hue Follows Focus Rule.** Chrome never hard-codes a hue. The set, panels, focus gap, legend and gamepad keyboard all derive from `--hue`, which app.js sets to the console hue of the focused object. Only the backdrop animates the change (800ms, through a non-inherited copy), so the rest of the page never recalculates per frame.

**The White Ink Rule.** Text on the set is white or Ink Soft. Ink Dark exists only on yellow and white surfaces.

## Typography

**Display Font:** Archivo Variable at width 125 and weight 900 (with sans-serif)
**Body Font:** Archivo Variable (with system-ui, sans-serif)

**Character:** A wide, heavy display cut that reads like the logotype printed on a box, over a plain sans that disappears. The pairing is a user setting: Archivo Expanded + Archivo (default), Gabarito, Red Hat Display + Red Hat Text, Funnel Display + Funnel Sans (display weight 800), Rubik (display weight 800). All are self-hosted variable sans-serifs; the narrower faces track at -0.01em.

### Hierarchy
- **Display** (900, 2.6rem / 3.4rem / 4rem, line-height 1): the console monogram (GBA, SNES, PS2) on blocks, sized by context (Home strip, Library grid, console header), with a stepped extrusion in darker console hue.
- **Headline** (900, clamp(2rem, 4vw, 3rem)): page titles (Libreria, Opzioni), with a two-step hard extrusion in the dark set hue.
- **Title** (900, clamp(1.6rem, 3.4vw, 2.6rem), line-height 1.1, max 24ch, balanced): the selected game in the cover flow; the showcase title on a console page is the same role at clamp(1.3rem, 2.2vw, 1.9rem), max 22ch.
- **Body** (400, 1.0625rem): running text, notes, empty-state explanations.
- **Body Strong** (700, line-height 1.25): nav pills, box titles (clamped to two lines), console names, buttons.
- **Label** (700, 0.95rem, tabular numbers in the status bar): legend text, game counts, clock. Label Small (800, 0.8rem) sits inside pad glyphs and badges.

### Named Rules
**The Pairing Is A Variable Rule.** No component names a font family. Display text uses `--f-display`, `--fw-display`, `--fs-display` and `--ls-display`; everything else uses `--f-body`. A new screen must look right in all five pairings.

**The Display Is For Names Rule.** The display face is reserved for names of things: headings, the logo, console monograms, game titles and the cover fallback printed on a box without art. Labels, counts and controls stay in the body face.

## Layout

Pages sit inside a fluid side gutter (clamp(16px, 4vw, 56px), widened by safe-area insets) under an 80px top bar (logo, nav pills, clock and controller state), with 140px of bottom padding so the fixed controller legend never covers content. Layouts are grids sized for objects, not text columns: the Library grid uses auto-fill columns of at least 260px with 170px row gaps to leave room for each block's fan of games; the Home strip uses fixed 220px blocks; game grids use auto-fill columns of at least 170px. A console page pairs a sticky showcase column (a turntable box, minmax(260px, 0.7fr)) with the game grid (2fr). The cover flow is a 4px-slot row (what the focus model measures) whose boxes are positioned by transforms only.

Below 760px the top bar wraps, the clock and the legend hide, the showcase is dropped and the console page becomes one column. Grid boxes use `content-visibility: auto` so a console with thousands of games scrolls smoothly. Focus navigation is spatial by lines: left/right stay on the current line, up/down jump to the nearest line and then the closest target on it; a cover flow or the tab bar counts as one line and is entered on its current item. Layouts must keep focusable objects in clear rows and columns.

## Elevation & Depth

Depth is drawn, not blurred. Objects are real CSS 3D (preserve-3d boxes with six faces, perspective 900 to 1400px on their stages) or fake 3D (cuboid blocks with 45-degree skewed top and side faces). Flat surfaces get hard offset extrusions toward the bottom-left in a darker tone of their own colour. Soft shadows exist only as contact shadows on the floor beneath physical objects, in a violet-black (rgb(10 0 40)), never under chrome.

### Shadow Vocabulary
- **Focus ring** (`box-shadow: 0 0 0 3px oklch(0.2 0.1 var(--hue)), 0 0 0 6px #fff`): every focusable element.
- **Yellow ledge** (`box-shadow: 0 5px 0 var(--go-edge)`, pressed `0 1px 0`): the retry button; the logo tag uses `-3px 3px 0`.
- **Title extrusion** (`text-shadow: -2px 2px 0 oklch(0.3 0.16 var(--hue)), -4px 4px 0 oklch(0.25 0.14 var(--hue))`): page titles; the cover-flow title adds a soft `-4px 10px 24px` lift.
- **Monogram extrusion** (four stepped `-1px 1px` to `-4px 4px` shadows in oklch(0.4 to 0.32, 0.19 to 0.17, h)): console monograms.
- **Contact shadow** (`0 10px 20px rgb(10 0 40 / 0.35)` on fan cards; radial floor shadows under the showcase and cover flow; `0 18px 50px rgb(10 0 40 / 0.45)` behind the focused cover-flow box).
- **Well** (`inset 0 0 0 2px rgb(255 255 255 / 0.25), 0 5px 0 rgb(0 0 0 / 0.25)`): the search field.
- **Glass lip** (`inset 0 1px 0 rgb(255 255 255 / 0.18)`): the Options panel.

### Named Rules
**The Extrusion Not Blur Rule.** Chrome and type get hard offset extrusions in a darker tone of their own colour. Blurred shadows are reserved for objects resting on the floor.

**The Real Proportions Rule.** A box's width, height and depth come from the console's real packaging in millimetres (GBA/GBC/GB 125 x 125 x 23, NES 127 x 178 x 38, SNES 160 x 195 x 29, Mega Drive 152 x 195 x 25, PS2 135 x 190 x 15), until the cover art loads: then the box takes the art's width-to-height ratio (box art comes from any region, and a US SNES box is landscape where a PAL one is portrait). Depth stays the console's. A landscape box is never wider than a square one at the same height: it gets shorter and stands on the same shelf line. Without art, the real proportions remain.

**The Physical Spring Rule.** `--spring` (cubic-bezier(0.34, 1.32, 0.64, 1)) and `--settle` (cubic-bezier(0.3, 1.12, 0.5, 1)) are for physical objects settling: blocks lifting, fans opening, grid boxes squaring up, the turntable swinging in, the selected cover-flow box. Their small overshoot is deliberate. Everything else uses `--ease` (cubic-bezier(0.23, 1, 0.32, 1)). Reduced motion turns flights, sways and springs off and keeps state changes instant and visible.

## Shapes

Physical objects have hard corners: boxes are square-edged, console blocks round only 3px, fan cards 4px. Chrome is soft: pills (999px) for nav, badges, the legend and toasts; 20px for panels and empty states; 16px for the search field and font cards; 14px for buttons and the inset focus of grid boxes; 6px for the logo tag. Pad glyphs, the gamepad keyboard disc and its petals are circles. The only border in the system is the 2px dashed outline of an empty state; everything else is separated by fill, veil or extrusion.

## Components

### Navigation pills
Flat, rounded and quiet. 46px pills (44px on phones) with a 0.1 white veil, a Phosphor icon and bold label; the current section is a solid white pill with Ink Dark text. Pressing scales to 0.97 on `--ease` (160ms).

### Logo
"Retro" in the display face, then "Mate" on an Action Yellow tag (6px corners) with a -3px 3px Yellow Edge extrusion. It is the Home link.

### Console block (signature)
An oblique cuboid in the console hue: a front face gradient, a 26px top face skewed -45 degrees and a side face skewed the other way, both scaled by `--depth` (0.55 at rest). The display monogram is extruded, with the console name and game count beneath. On focus the block lifts toward the top-left (translate -12px, 12px), its depth grows to 1, and three game covers fan out of the top (rotations -14, 0, 14 degrees, 30ms stagger) on `--spring`. Pressing pushes it in (depth 0.3). The block morphs into the console page header through a shared view-transition name.

### Game box and boxcard (signature)
A six-faced preserve-3d box at real proportions. Cardboard fronts show the cover art over a band printed with the console name and the title as fallback; a soft white edge and a 120-degree sheen catch light. Plastic cases have a black front, an inset rim and a diagonal gloss stripe. In grids (boxcard) only the front, spine and top faces render; the box stands at rotateY(30deg) rotateX(10deg) and squares up to face you at 1.06 scale on focus or hover (340ms `--spring`), with an inset white ring on the card (14px) because content-visibility clips paint.

### Cover flow (Home)
Recently played boxes on a shelf. The current box faces the viewer, pushed forward and slowly swaying (7s); the others stand turned 66 degrees at a shared depth, spaced from the box height so their spines line up. Moving settles the new box on `--settle` (420ms) while the rest slide on `--ease` (320ms). A white ring with a deep contact shadow frames the focused box; the console name and title read beneath in the title role.

### Modal and game card

A `<dialog>` over the set, dimmed and blurred (backdrop fades in 300ms). Its panel (20px corners, the panel colour at 0.94) lifts in from 18px lower at 0.97 scale on `--ease` and drops away the same way; the controller legend stays above it. A figure can stand beside the panel and never fades: on the game card it is the game's box, which flies from the grid or cover flow into place on `--spring` (FLIP, transform only) and flies back on close. The card shows console, title, play time, a yellow Play button (default focus) and the save states as screenshot cards with date and time. B, Esc, the close button or a click outside close it.

### In-game menu

Home, Select+Start or Esc during play opens a dashboard over the paused game, after the Windows Game Bar but in the set's own light. The game steps back (scale 0.94, dimmed) under a blurred backdrop tinted with the console's hue. A command bar drops in at the top: clock, then Riprendi (default focus), In pausa, Riavvia | Salva stato, Carica stato | Controller, Opzioni | Esci, with thin dividers between groups. The game card (the box, which swings round to face you on `--spring`, the console monogram, title, play time, session, last state) and the volume rocker (minus, a rising white ten-step meter, plus, mute) slide in from the left; the players card (four slots with their device) from the right, with a 40ms stagger. Closing reverses it in about 200ms with no stagger. Bigger tasks open as a panel over the middle band while the cards behind dim and go inert: load a state (screenshot grid), controller mapping (player tabs, device chips, a binding grid, Ripristina / Annulla / Salva), emulator options (a category list and a tree with breadcrumbs: A on an option with two values flips it in place, on a longer one opens its values as a checked list; the emulator supplies the tree), and restart and quit confirmations. What an emulator can't do is left out or disabled: a streamed game has one player (no player tabs) and no options yet (Opzioni disabled). Chrome uses extrusions, not blurred shadows; the only yellow is on action buttons and the toast.

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
Alternative looks chosen in Opzioni (per device, `skin.js`): a live WebGL2 backdrop on #090909 replaces the set, tinted from `--hue` (eased round the colour wheel in the shader, so the 800ms backdrop rule still holds). Aurora, Terminale, Prisma and Eco are folded ribbons of light (OpenShaders: @elsoghiar, @dolza, @isuru, @voidy): Aurora with film grain, Terminale and Eco redrawn in ASCII glyphs (Eco's ribbons trail an echo), Prisma clean across half the spectrum. Reticolo is a wireframe world: grid floor and ceiling scrolling towards the viewer, a horizon glow, two nested cubes turning on the right. With any of them chrome turns to smoked glass: pills inside a lit gradient rim, cards with a hairline and a lit top edge, the current tab and chosen pill glowing in the hue; focus adds a hue glow outside the white ring and a light runs round the focused console card's border (3s per lap). Page titles fade from white downwards. Reticolo draws chrome as hue hairline frames with 4px corners and turns game boxes into wireframes (every face but the cover an empty frame, seen through from behind). Without WebGL2 the page keeps Vetrina; under reduced motion the backdrop holds still.

## Do's and Don'ts

### Do:
- **Do** set `--hue` from the focused object's console hue and derive every chrome colour from it.
- **Do** show focus as the 3px dark gap plus 3px white ring (`--ring`) and move the object as well: lift, square up or face the viewer.
- **Do** size every box from the console's real packaging millimetres through `--ar` and `--d`.
- **Do** use `--spring` or `--settle` only for physical objects settling, and `--ease` for every UI transition.
- **Do** use the display variables (`--f-display`, `--fw-display`, `--fs-display`, `--ls-display`) for names and `--f-body` for everything else, and check new screens in all five pairings.
- **Do** give flat surfaces depth with hard bottom-left extrusions in a darker tone of their own colour.
- **Do** fly the camera forward into deeper pages and pull it back on return, and turn flights and sways off under reduced motion.

### Don't:
- **Don't** lay games out as a flat grid of rectangular cover thumbnails; a game is always a box on the set.
- **Don't** use Action Yellow for decoration; it marks only what a press will do, and the logo tag.
- **Don't** rely on colour alone for focus or selection.
- **Don't** put blurred drop shadows under chrome; soft shadows belong only beneath objects on the floor.
- **Don't** apply spring or settle overshoot to nav pills, fields, cards or the legend.
- **Don't** hard-code a font family or a console hue in a component.
- **Don't** animate `--hue` anywhere except the backdrop.
