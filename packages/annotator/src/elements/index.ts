import { defineElement, registerImplicitPlugin } from '@tessera/elements';
import { TesseraAnnotationList } from './annotation-list.js';
import { TesseraAnnotatorElement } from './annotator.js';
import { registerAnnotatorIcons } from './icons.js';
import { TesseraLabelPicker } from './label-picker.js';
import { TesseraAnnotatorMinimap } from './minimap.js';
import { installAnnotatorTokens } from './tokens.js';
import { TesseraAnnotatorToolbar } from './toolbar.js';
import { TesseraWhiteboardElement } from './whiteboard.js';

export { TesseraAnnotationList } from './annotation-list.js';
export { TesseraAnnotatorElement } from './annotator.js';
export { TesseraLabelPicker } from './label-picker.js';
export { TesseraAnnotatorMinimap } from './minimap.js';
export { TesseraAnnotatorToolbar } from './toolbar.js';
export { TesseraWhiteboardElement } from './whiteboard.js';

registerAnnotatorIcons();
if (typeof document !== 'undefined') installAnnotatorTokens(document);

// Defining the tags and registering the loader is what lets a bare <tessera-annotator> work on the
// implicit default instance, without any createTessera() call.
defineElement('tessera-label-picker', TesseraLabelPicker);
defineElement('tessera-annotator-toolbar', TesseraAnnotatorToolbar);
defineElement('tessera-annotation-list', TesseraAnnotationList);
defineElement('tessera-annotator-minimap', TesseraAnnotatorMinimap);
defineElement('tessera-annotator', TesseraAnnotatorElement);
defineElement('tessera-whiteboard', TesseraWhiteboardElement);
registerImplicitPlugin('annotator', () => import('../plugin.js'));

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
