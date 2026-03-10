import '@tessera/annotator/elements';
import { baseStyles } from '@tessera/elements';
import { type CSSResultGroup, css, html, LitElement } from 'lit';
import type { Section } from '../sections.js';

/** The whiteboard fills the tab. */
export class WhiteboardDemo extends LitElement {
  static override styles: CSSResultGroup = [
    baseStyles,
    css`
      :host {
        display: block;
      }
      tessera-whiteboard {
        --tessera-annotator-height: 38rem;
      }
    `,
  ];

  protected override render(): unknown {
    return html`<tessera-whiteboard board-id="playground-board"></tessera-whiteboard>`;
  }
}

if (!customElements.get('whiteboard-demo'))
  customElements.define('whiteboard-demo', WhiteboardDemo);

export const whiteboardSection: Section = {
  id: 'whiteboard',
  label: 'Whiteboard',
  blurb:
    'The same engine on an endless board: freehand with pressure, shapes, text, colours and line widths. Space or middle mouse pans, Ctrl or ⌘ with the wheel zooms.',
  // The whiteboard is the annotator feature in board mode: its options live on the Annotate tab.
  feature: 'annotator',
  load: () => import('@tessera/annotator'),
  render: () => html`<whiteboard-demo></whiteboard-demo>`,
};
