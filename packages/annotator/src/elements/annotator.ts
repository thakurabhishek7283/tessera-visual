import type { PropertyDeclarations } from 'lit';
import { TesseraSurfaceElement } from './surface-element.js';

/**
 * `<tessera-annotator src="photo.jpg" set-id="…">`: annotate an image with shapes, labels and
 * notes. Toolbar on top, the list of annotations beside it. Needs a height: it uses
 * `--tessera-annotator-height` (default 34rem).
 *
 * @example
 * <tessera-annotator src="/camp-map.jpg" set-id="camp-map"></tessera-annotator>
 */
export class TesseraAnnotatorElement extends TesseraSurfaceElement {
  static override properties: PropertyDeclarations = {
    ...TesseraSurfaceElement.properties,
    src: {},
    setId: { attribute: 'set-id' },
  };

  protected readonly mode = 'image' as const;
  /** The image URL. */
  src: string | undefined;
  /** Key of the stored set. Defaults to a hash of `src`. */
  setId: string | undefined;

  protected get source(): string | undefined {
    return this.src;
  }

  protected get setKey(): string | undefined {
    return this.setId;
  }
}
