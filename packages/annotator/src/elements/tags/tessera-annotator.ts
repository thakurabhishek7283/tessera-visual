// <tessera-annotator> and the elements it renders: `@tessera-kit/annotator/elements/tessera-annotator`.
import '../setup.js';
import './tessera-annotator-toolbar.js';
import './tessera-label-picker.js';
import './tessera-annotator-minimap.js';
import './tessera-annotation-list.js';
import { defineElement } from '@tessera-kit/elements';
import { TesseraAnnotatorElement } from '../annotator.js';

defineElement('tessera-annotator', TesseraAnnotatorElement);

export { TesseraAnnotatorElement };
