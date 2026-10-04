import { baseStyles, focusRing } from '@tessera-kit/elements';
import {
  type CSSResultGroup,
  css,
  html,
  LitElement,
  nothing,
  type PropertyDeclarations,
} from 'lit';
import { z } from 'zod';

type Json = Record<string, unknown>;
interface Node extends Json {
  type?: string | string[];
  enum?: unknown[];
  items?: Node;
  properties?: Record<string, Node>;
  default?: unknown;
  description?: string;
  anyOf?: Node[];
  minimum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
}

const resolve = (node: Node): Node => {
  // `.default({...})` wraps objects; the schema itself is the useful part.
  if (node.anyOf) return node.anyOf.find((n) => n.type !== 'null') ?? node;
  return node;
};

/**
 * Builds a form from a zod schema: switches for booleans, selects for enums, checkbox groups for
 * lists of enum values, number and text inputs, and a JSON box for anything more complicated. The
 * playground uses it to change every feature option live.
 *
 * @fires config-change - `{ value }` the whole config after an edit
 */
export class ConfigForm extends LitElement {
  static override properties: PropertyDeclarations = {
    schema: { attribute: false },
    value: { attribute: false },
    errors: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    css`
      :host {
        display: block;
        font-size: var(--tessera-font-size-sm);
      }
      form,
      fieldset {
        display: grid;
        gap: var(--tessera-space-2);
      }
      fieldset {
        margin: 0;
        padding: var(--tessera-space-2);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        min-width: 0;
      }
      legend {
        font-weight: 600;
        padding: 0 var(--tessera-space-1);
      }
      label {
        display: grid;
        gap: 2px;
      }
      label.check {
        display: flex;
        align-items: center;
        gap: var(--tessera-space-2);
      }
      .hint {
        color: var(--tessera-color-text-muted);
        font-size: var(--tessera-font-size-xs);
      }
      input[type='text'],
      input[type='number'],
      select,
      textarea {
        min-height: 30px;
        font: inherit;
        color: var(--tessera-color-text);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-sm);
        padding: 0 var(--tessera-space-2);
        min-width: 0;
      }
      textarea {
        padding: var(--tessera-space-1) var(--tessera-space-2);
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: var(--tessera-font-size-xs);
        min-height: 4rem;
      }
      .error {
        color: var(--tessera-color-danger);
      }
      .group {
        display: flex;
        flex-wrap: wrap;
        gap: var(--tessera-space-1) var(--tessera-space-3);
      }
    `,
  ];

  schema: z.ZodType | undefined;
  value: Json = {};
  errors: Record<string, string> = {};

  get #node(): Node {
    return this.schema
      ? (z.toJSONSchema(this.schema, {
          io: 'input',
          unrepresentable: 'any',
          target: 'draft-2020-12',
        }) as Node)
      : {};
  }

  #set(path: string[], next: unknown): void {
    const copy = structuredClone(this.value ?? {}) as Json;
    let cursor = copy;
    for (const key of path.slice(0, -1)) {
      const child = cursor[key];
      if (typeof child === 'object' && child !== null) {
        cursor = child as Json;
      } else {
        const created: Json = {};
        cursor[key] = created;
        cursor = created;
      }
    }
    const last = path.at(-1) as string;
    if (next === undefined) delete cursor[last];
    else cursor[last] = next;
    this.value = copy;
    this.dispatchEvent(
      new CustomEvent('config-change', { detail: { value: copy }, bubbles: true, composed: true }),
    );
  }

  #read(path: string[], node: Node): unknown {
    let cursor: unknown = this.value;
    for (const key of path) cursor = (cursor as Json | undefined)?.[key];
    return cursor === undefined ? node.default : cursor;
  }

  #field(path: string[], raw: Node): unknown {
    const node = resolve(raw);
    const name = path.at(-1) as string;
    const id = `f-${path.join('-')}`;
    const hint = node.description ? html`<span class="hint">${node.description}</span>` : nothing;
    const current = this.#read(path, node);
    if (path.length === 1 && name === 'enabled') return nothing;

    if (node.type === 'boolean') {
      return html`<label class="check" for=${id}>
        <input id=${id} type="checkbox" .checked=${current === true} @change=${(e: Event) => this.#set(path, (e.target as HTMLInputElement).checked)} />
        <span>${name}</span>
      </label>${hint}`;
    }
    if (node.enum) {
      return html`<label for=${id}>${name}
        <select id=${id} @change=${(e: Event) => this.#set(path, (e.target as HTMLSelectElement).value)}>
          ${node.enum.map((o) => html`<option value=${String(o)} ?selected=${o === current}>${String(o)}</option>`)}
        </select>${hint}
      </label>`;
    }
    if (node.type === 'array' && node.items?.enum) {
      const chosen = new Set((current as string[] | undefined) ?? []);
      return html`<fieldset>
        <legend>${name}</legend>${hint}
        <div class="group">
          ${node.items.enum.map(
            (o) =>
              html`<label class="check"><input type="checkbox" .checked=${chosen.has(String(o))} @change=${(
                e: Event,
              ) => {
                const on = (e.target as HTMLInputElement).checked;
                const base = ((current as string[] | undefined) ?? []).filter(
                  (x) => x !== String(o),
                );
                // Keep the order of the schema's options so toolbars read naturally.
                const all = (node.items?.enum ?? []).map(String);
                this.#set(
                  path,
                  all.filter((x) => (x === String(o) ? on : base.includes(x))),
                );
              }} />${String(o)}</label>`,
          )}
        </div>
      </fieldset>`;
    }
    if (node.type === 'number' || node.type === 'integer') {
      return html`<label for=${id}>${name}
        <input id=${id} type="number" step=${node.type === 'integer' ? '1' : 'any'} .value=${current === undefined ? '' : String(current)} placeholder="–"
          @change=${(e: Event) => {
            const v = (e.target as HTMLInputElement).value;
            this.#set(path, v === '' ? undefined : Number(v));
          }} />${hint}
      </label>`;
    }
    if (node.type === 'string') {
      return html`<label for=${id}>${name}
        <input id=${id} type="text" .value=${current === undefined ? '' : String(current)} @change=${(
          e: Event,
        ) => {
          const v = (e.target as HTMLInputElement).value;
          this.#set(path, v === '' ? undefined : v);
        }} />${hint}
      </label>`;
    }
    if (node.type === 'object' && node.properties) {
      return html`<fieldset>
        <legend>${name}</legend>${hint}
        ${Object.entries(node.properties).map(([k, child]) => this.#field([...path, k], child))}
      </fieldset>`;
    }
    // Lists of objects and other shapes: edit as JSON.
    const key = path.join('.');
    return html`<label for=${id}>${name} (JSON)
      <textarea id=${id} spellcheck="false" .value=${current === undefined ? '' : JSON.stringify(current, null, 2)} @change=${(
        e: Event,
      ) => {
        const text = (e.target as HTMLTextAreaElement).value.trim();
        try {
          this.#set(path, text === '' ? undefined : JSON.parse(text));
          this.errors = { ...this.errors, [key]: '' };
        } catch (error) {
          this.errors = { ...this.errors, [key]: (error as Error).message };
        }
      }}></textarea>
      ${this.errors[key] ? html`<span class="error" role="alert">${this.errors[key]}</span>` : hint}
    </label>`;
  }

  protected override render(): unknown {
    const node = this.#node;
    return html`<form @submit=${(e: Event) => e.preventDefault()}>
      ${Object.entries(node.properties ?? {}).map(([k, child]) => this.#field([k], child))}
    </form>`;
  }
}

if (!customElements.get('config-form')) customElements.define('config-form', ConfigForm);
