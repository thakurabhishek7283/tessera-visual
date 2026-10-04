// Each tag is defined by its own module (`./tags/<tag>.js`, published as `elements/<tag>`), which
// also defines the elements it renders. Importing this entry defines the kit's elements.
import './tags/tessera-label-picker.js';
import './tags/tessera-annotator-toolbar.js';
import './tags/tessera-annotation-list.js';
import './tags/tessera-annotator-minimap.js';
import './tags/tessera-annotator.js';
import './tags/tessera-whiteboard.js';
import type { TesseraAnnotationList } from './annotation-list.js';
import type { TesseraAnnotatorElement } from './annotator.js';
import type { TesseraLabelPicker } from './label-picker.js';
import type { TesseraAnnotatorMinimap } from './minimap.js';
import type { TesseraAnnotatorToolbar } from './toolbar.js';
import type { TesseraWhiteboardElement } from './whiteboard.js';

export { TesseraAnnotationList } from './annotation-list.js';
export { TesseraAnnotatorElement } from './annotator.js';
export { TesseraLabelPicker } from './label-picker.js';
export { TesseraAnnotatorMinimap } from './minimap.js';
export { TesseraAnnotatorToolbar } from './toolbar.js';
export { TesseraWhiteboardElement } from './whiteboard.js';

declare global {
  interface HTMLElementTagNameMap {
    'tessera-annotator': TesseraAnnotatorElement;
    'tessera-whiteboard': TesseraWhiteboardElement;
    'tessera-annotation-list': TesseraAnnotationList;
    'tessera-annotator-toolbar': TesseraAnnotatorToolbar;
    'tessera-label-picker': TesseraLabelPicker;
    'tessera-annotator-minimap': TesseraAnnotatorMinimap;
  }
}
