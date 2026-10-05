// <tessera-whiteboard> and the elements it renders: `@tessera-kit/annotator/elements/tessera-whiteboard`.
import '../setup.js';
import './tessera-annotator-toolbar.js';
import './tessera-label-picker.js';
import './tessera-annotator-minimap.js';
import './tessera-annotation-list.js';
import { defineElement } from '@tessera-kit/elements';
import { TesseraWhiteboardElement } from '../whiteboard.js';

defineElement('tessera-whiteboard', TesseraWhiteboardElement);

export { TesseraWhiteboardElement };
