// Each tag is defined by its own module (`./tags/<tag>.js`, published as `elements/<tag>`), which
// also defines the elements it renders. Importing this entry defines the kit's elements.
import './tags/tessera-map.js';
import './tags/tessera-location-picker.js';
import type { TesseraLocationPicker } from './location-picker.js';
import type { TesseraMapElement } from './map.js';

export { type LocationValue, TesseraLocationPicker } from './location-picker.js';
export { fillTemplate, parseCenter, TesseraMapElement } from './map.js';

declare global {
  interface HTMLElementTagNameMap {
    'tessera-map': TesseraMapElement;
    'tessera-location-picker': TesseraLocationPicker;
  }
}
