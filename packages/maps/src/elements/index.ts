import { defineElement, registerImplicitPlugin } from '@tessera/elements';
import { TesseraLocationPicker } from './location-picker.js';
import { TesseraMapElement } from './map.js';

export { type LocationValue, TesseraLocationPicker } from './location-picker.js';
export { fillTemplate, parseCenter, TesseraMapElement } from './map.js';

// Defining the tags and registering the loader is what lets a bare <tessera-map> work on the
// implicit default instance, without any createTessera() call.
defineElement('tessera-map', TesseraMapElement);
defineElement('tessera-location-picker', TesseraLocationPicker);
registerImplicitPlugin('maps', () => import('../plugin.js'));

declare global {
  interface HTMLElementTagNameMap {
    'tessera-map': TesseraMapElement;
    'tessera-location-picker': TesseraLocationPicker;
  }
}
