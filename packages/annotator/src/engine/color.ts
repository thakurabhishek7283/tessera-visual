import { TOKEN_COLORS, type TokenColor } from '../config.js';

/** Light-theme values of the palette. Elements redefine them for dark mode. */
export const PALETTE: Record<TokenColor, string> = {
  blue: '#1d4ed8',
  red: '#b91c1c',
  green: '#15803d',
  amber: '#b45309',
  purple: '#7e22ce',
  teal: '#0f766e',
  pink: '#be185d',
  gray: '#475569',
};

/** The default stroke on a whiteboard: the text colour of the theme. */
export const INK = 'var(--tessera-color-text, #0f172a)';

const SAFE = /^[#a-zA-Z0-9(),.%\s/_-]+$/;

export function isTokenColor(value: string): value is TokenColor {
  return (TOKEN_COLORS as readonly string[]).includes(value);
}

/**
 * Turns a style colour into something safe to hand to CSS: a palette name becomes its custom
 * property (with the light value as fallback), a plain CSS colour passes through, and anything
 * that could load a resource or break out of a declaration is replaced by the default blue.
 */
export function resolveColor(value: string | undefined, fallback: TokenColor = 'blue'): string {
  const v = value?.trim();
  if (!v) return `var(--tessera-annotator-${fallback}, ${PALETTE[fallback]})`;
  if (isTokenColor(v)) return `var(--tessera-annotator-${v}, ${PALETTE[v]})`;
  if (!SAFE.test(v) || /url\s*\(|expression|@import/i.test(v) || v.length > 80) {
    return `var(--tessera-annotator-${fallback}, ${PALETTE[fallback]})`;
  }
  return v;
}

/** A concrete colour for places CSS variables do not reach, such as an exported PNG. */
export function concreteColor(value: string | undefined, read?: (name: string) => string): string {
  const v = value?.trim();
  if (v && isTokenColor(v)) return read?.(`--tessera-annotator-${v}`) || PALETTE[v];
  if (v === INK || v?.startsWith('var(--tessera-color-text'))
    return read?.('--tessera-color-text') || '#0f172a';
  if (v && SAFE.test(v) && !/url\s*\(|var\s*\(/i.test(v)) return v;
  return PALETTE.blue;
}
