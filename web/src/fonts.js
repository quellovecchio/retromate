// Font pairings, chosen in Opzioni and remembered per device (a TV and a phone can differ).
// Self-hosted: the browser downloads only the faces the chosen pairing uses.
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/gabarito';
import '@fontsource-variable/red-hat-display';
import '@fontsource-variable/red-hat-text';
import '@fontsource-variable/funnel-display';
import '@fontsource-variable/funnel-sans';
import '@fontsource-variable/rubik';

export const FONTS = [
  ['archivo', 'Archivo Expanded + Archivo'],
  ['gabarito', 'Gabarito'],
  ['redhat', 'Red Hat Display + Red Hat Text'],
  ['funnel', 'Funnel Display + Funnel Sans'],
  ['rubik', 'Rubik'],
];
const KEY = 'retromate-fonts';

export function getFonts() {
  let id;
  try { id = localStorage.getItem(KEY); } catch {}
  return FONTS.some(([f]) => f === id) ? id : FONTS[0][0];
}

export function setFonts(id) {
  document.documentElement.dataset.fonts = id;
  try { localStorage.setItem(KEY, id); } catch {}
}

document.documentElement.dataset.fonts = getFonts();
