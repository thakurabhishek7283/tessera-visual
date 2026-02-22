import type { PropertyDeclarations } from 'lit';
import { TesseraSurfaceElement } from './surface-element.js';

/**
 * `<tessera-whiteboard board-id="…">`: an endless board with a dot grid, the same shapes and
 * history as the annotator, plus colour and line width pickers. Scroll or drag with space to pan,
 * Ctrl/⌘ and the wheel (or pinch) to zoom.
 *
 * @example
 * <tessera-whiteboard board-id="standup"></tessera-whiteboard>
 */
export class TesseraWhiteboardElement extends TesseraSurfaceElement {
  static override properties: PropertyDeclarations = {
    ...TesseraSurfaceElement.properties,
    boardId: { attribute: 'board-id' },
  };

  protected readonly mode = 'board' as const;
  /** Key of the stored board. */
  boardId: string | undefined;

  protected get source(): string | undefined {
    return undefined;
  }

  protected get setKey(): string | undefined {
    return this.boardId;
  }
}
