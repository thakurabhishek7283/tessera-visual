import '@tessera-kit/maps/elements';
import { baseStyles, focusRing } from '@tessera-kit/elements';
import {
  type CSSResultGroup,
  css,
  html,
  LitElement,
  nothing,
  type PropertyDeclarations,
} from 'lit';
import type { Section } from '../sections.js';

/** A plain `<form>` with the location picker in it, and the value it submits. */
export class PickerDemo extends LitElement {
  static override properties: PropertyDeclarations = { submitted: { state: true } };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    css`
      form {
        display: grid;
        gap: var(--tessera-space-3);
        max-width: 40rem;
      }
      label {
        display: grid;
        gap: 2px;
        font-size: var(--tessera-font-size-sm);
        font-weight: 600;
      }
      input[type='text'] {
        min-height: 36px;
        padding: 0 var(--tessera-space-3);
        font: inherit;
        color: var(--tessera-color-text);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
      }
      .actions {
        display: flex;
        gap: var(--tessera-space-2);
      }
      pre {
        max-width: 40rem;
        overflow: auto;
        padding: var(--tessera-space-3);
        font-size: var(--tessera-font-size-xs);
        background: var(--tessera-color-surface);
        border-radius: var(--tessera-radius-md);
      }
    `,
  ];

  submitted = '';

  #submit = (e: SubmitEvent): void => {
    e.preventDefault();
    const data = new FormData(e.target as HTMLFormElement);
    this.submitted = JSON.stringify(
      Object.fromEntries([...data].map(([k, v]) => [k, k === 'venue' ? JSON.parse(String(v)) : v])),
      null,
      2,
    );
  };

  protected override render(): unknown {
    return html`
      <form @submit=${this.#submit}>
        <label>Name of the event
          <input type="text" name="event" required value="Lakeside summer party" />
        </label>
        <tessera-location-picker name="venue" label="Where is it?" required></tessera-location-picker>
        <div class="actions">
          <tessera-button type="submit" variant="primary">Save event</tessera-button>
          <tessera-button type="reset" variant="ghost" @click=${() => (this.submitted = '')}>Reset</tessera-button>
        </div>
      </form>
      ${this.submitted ? html`<h3>Submitted</h3><pre aria-label="Submitted form data">${this.submitted}</pre>` : nothing}
    `;
  }
}

if (!customElements.get('picker-demo')) customElements.define('picker-demo', PickerDemo);

export const pickerSection: Section = {
  id: 'picker',
  label: 'Location picker',
  feature: 'maps',
  blurb:
    'Search for an address (Nominatim, one request per second) or click the map; drag the pin to adjust. The element is form-associated: the form submits the place as JSON and checks that one is chosen.',
  load: () => import('@tessera-kit/maps'),
  render: () => html`<picker-demo></picker-demo>`,
};
