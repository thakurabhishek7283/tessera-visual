import { PALETTE } from '../engine/color.js';

/** Palette for dark themes: lighter, so shapes keep their contrast on dark images and boards. */
const DARK: typeof PALETTE = {
  blue: '#7aa7ff',
  red: '#ff8a8a',
  green: '#4ade80',
  amber: '#fbbf24',
  purple: '#c4a1ff',
  teal: '#2dd4bf',
  pink: '#f472b6',
  gray: '#a3afc2',
};

const declarations = (palette: typeof PALETTE): string =>
  Object.entries(palette)
    .map(([name, value]) => `--tessera-annotator-${name}:${value};`)
    .join('');

const css = `
:root, tessera-root { ${declarations(PALETTE)} }
:root[data-tessera-theme="dark"], tessera-root[data-tessera-theme="dark"], [data-tessera-theme="dark"] { ${declarations(DARK)} }
@media (prefers-color-scheme: dark) { :root:not([data-tessera-theme]) { ${declarations(DARK)} } }
`;

/**
 * Defines the palette (`--tessera-annotator-blue` …) once per document, in a light and a dark
 * variant that follow the same switches as the core design tokens. Hosts can override any of them.
 */
export function installAnnotatorTokens(doc: Document = document): void {
  if (doc.head.querySelector('style[data-tessera-annotator-tokens]')) return;
  const style = doc.createElement('style');
  style.setAttribute('data-tessera-annotator-tokens', '');
  style.textContent = css;
  doc.head.prepend(style);
}
