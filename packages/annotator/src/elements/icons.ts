import { registerIcons } from '@tessera/elements';

/** Tool icons, drawn for this kit on the same 24×24 grid and 2 px strokes as the core set. */
registerIcons({
  'tool-select': '<path d="M5 3l14 7-6 2-2 7L5 3z"/>',
  'tool-pan':
    '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V11M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6.5a1.5 1.5 0 0 1 3 0V14M17 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.7-2.3L5 14.5a1.5 1.5 0 0 1 2.4-1.8L8 13.5"/>',
  'tool-rect': '<rect x="4" y="5" width="16" height="14" rx="1"/>',
  'tool-ellipse': '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  'tool-polygon': '<path d="M12 3l8 6-3 11H7L4 9l8-6z"/>',
  'tool-polyline': '<path d="M4 18l6-10 5 6 5-9"/>',
  'tool-arrow': '<path d="M5 19L19 5M10 5h9v9"/>',
  'tool-freehand': '<path d="M4 20c4 0 5-2 5-4M9 16l9.5-9.5a2.1 2.1 0 0 0-3-3L6 13"/>',
  'tool-point': '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  'tool-text': '<path d="M5 7V4h14v3M12 4v16M9 20h6"/>',
  'tool-eraser':
    '<path d="M8 20h12M5.5 15.5l9-9a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3L11 20H8l-2.5-2.5a1.4 1.4 0 0 1 0-2z"/>',
  maximize: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
});
