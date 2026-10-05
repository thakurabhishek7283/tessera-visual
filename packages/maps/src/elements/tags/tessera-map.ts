// <tessera-map> and the elements it renders: `@tessera-kit/maps/elements/tessera-map`.
import '../setup.js';
import { defineElement } from '@tessera-kit/elements';
import { TesseraMapElement } from '../map.js';

defineElement('tessera-map', TesseraMapElement);

export { TesseraMapElement };
