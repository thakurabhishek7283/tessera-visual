import { baseStyles, focusRing, TesseraElement, visuallyHidden } from '@tessera/elements';
import {
  type CSSResultGroup,
  css,
  html,
  nothing,
  type PropertyDeclarations,
  type PropertyValues,
} from 'lit';
import type { GeocodeResult, MapHandle, MapsApi } from '../types.js';
import { parseCenter } from './map.js';
import { MapSession } from './session.js';

/** What the picker holds and submits (as JSON). */
export interface LocationValue {
  lng: number;
  lat: number;
  label: string;
}

const SEARCH_DEBOUNCE_MS = 400;
let counter = 0;

const isLocation = (v: unknown): v is LocationValue =>
  typeof v === 'object' &&
  v !== null &&
  Number.isFinite((v as LocationValue).lng) &&
  Number.isFinite((v as LocationValue).lat) &&
  typeof (v as LocationValue).label === 'string';

/**
 * `<tessera-location-picker>`: search for an address or click the map to choose a place; the pin
 * can be dragged. Form-associated: inside a `<form>` it submits `name` with the value as JSON
 * (`{"lng":…,"lat":…,"label":"…"}`), supports `required` and resets with the form.
 *
 * @fires location-change - `{ value }` (`null` when cleared)
 * @csspart search @csspart results @csspart map
 */
export class TesseraLocationPicker extends TesseraElement {
  static formAssociated = true;
  static override properties: PropertyDeclarations = {
    value: { attribute: false },
    // Reflected: a form submits by the attribute, and frameworks set the property.
    name: { reflect: true },
    label: {},
    required: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
    center: { converter: { fromAttribute: (v: string | null) => parseCenter(v) } },
    zoom: { type: Number },
    query: { state: true },
    results: { state: true },
    active: { state: true },
    open: { state: true },
    status: { state: true },
    loading: { state: true },
    failure: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    visuallyHidden,
    css`
      :host {
        display: block;
      }
      .field {
        display: grid;
        gap: var(--tessera-space-2);
      }
      .label {
        font-size: var(--tessera-font-size-sm);
        font-weight: 600;
      }
      .search {
        position: relative;
      }
      input {
        box-sizing: border-box;
        width: 100%;
        min-height: 36px;
        padding: 0 var(--tessera-space-3);
        font: inherit;
        color: var(--tessera-color-text);
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
      }
      ul {
        position: absolute;
        inset-inline: 0;
        top: calc(100% + 4px);
        z-index: var(--tessera-z-popover);
        max-height: 14rem;
        margin: 0;
        padding: var(--tessera-space-1);
        overflow: auto;
        list-style: none;
        background: var(--tessera-color-bg);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        box-shadow: var(--tessera-shadow-md);
      }
      li {
        padding: var(--tessera-space-2) var(--tessera-space-3);
        border-radius: var(--tessera-radius-sm);
        cursor: pointer;
        font-size: var(--tessera-font-size-sm);
      }
      li[aria-selected='true'] {
        background: var(--tessera-color-primary);
        color: var(--tessera-color-primary-contrast);
      }
      li.none {
        cursor: default;
        color: var(--tessera-color-text-muted);
      }
      .map-wrap {
        position: relative;
        height: var(--tessera-map-height, 16rem);
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        overflow: hidden;
        background: var(--tessera-color-surface-2);
      }
      .map {
        position: absolute;
        inset: 0;
      }
      .chosen {
        display: flex;
        align-items: center;
        gap: var(--tessera-space-2);
        min-height: 32px;
        font-size: var(--tessera-font-size-sm);
      }
      .chosen .text {
        flex: 1;
        min-width: 0;
      }
      .chosen .coords {
        display: block;
        color: var(--tessera-color-text-muted);
        font-size: var(--tessera-font-size-xs);
      }
      .muted {
        color: var(--tessera-color-text-muted);
      }
      button.clear {
        font: inherit;
        color: inherit;
        background: transparent;
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-md);
        min-height: 32px;
        padding: 0 var(--tessera-space-3);
        cursor: pointer;
      }
      .message {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        text-align: center;
        pointer-events: none;
        color: var(--tessera-color-danger);
      }
    `,
  ];

  protected readonly featureId: string | null = 'maps';
  readonly #internals: ElementInternals = this.attachInternals();
  readonly #id = `tessera-picker-${++counter}`;

  value: LocationValue | null = null;
  name = '';
  label: string | undefined;
  required = false;
  disabled = false;
  center: [number, number] | undefined;
  zoom: number | undefined;
  query = '';
  results: GeocodeResult[] = [];
  active = -1;
  open = false;
  status = '';
  loading = false;
  failure: string | undefined;

  #timer: ReturnType<typeof setTimeout> | undefined;
  #search: AbortController | undefined;
  #stops: Array<() => void> = [];
  #reverseToken = 0;
  readonly #session = new MapSession(
    () => {
      this.loading = this.#session.loading;
      this.failure = this.#session.failure;
    },
    (handle) => this.#onOpen(handle),
    () => {
      for (const stop of this.#stops.splice(0)) stop();
    },
  );

  get handle(): MapHandle | undefined {
    return this.#session.handle;
  }

  /** The `maps` service, once the feature is enabled. */
  get #api(): MapsApi | undefined {
    return this.enabled ? (this.ctx.services.get('maps') as MapsApi | undefined) : undefined;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.#timer);
    this.#search?.abort();
    this.#session.close();
  }

  formResetCallback(): void {
    this.#set(null, false);
  }

  formDisabledCallback(disabled: boolean): void {
    this.disabled = disabled;
  }

  formStateRestoreCallback(state: string | null): void {
    try {
      const parsed: unknown = state ? JSON.parse(state) : null;
      this.value = isLocation(parsed) ? parsed : null;
    } catch {
      this.value = null;
    }
  }

  /** Changes the value, keeps the form in step, and optionally tells the host. */
  #set(value: LocationValue | null, notify = true): void {
    // An address still on its way belongs to a place that is no longer chosen.
    if (value === null) this.#reverseToken++;
    this.value = value;
    this.#sync();
    if (notify) this.emit('location-change', { value });
  }

  #sync(): void {
    const json = this.value ? JSON.stringify(this.value) : null;
    this.#internals.setFormValue(json);
    if (this.required && !this.value) {
      this.#internals.setValidity({ valueMissing: true }, this.t('picker.empty'));
    } else this.#internals.setValidity({});
  }

  #onOpen(handle: MapHandle): void {
    handle.setLabel(this.t('map.label'));
    this.#stops.push(
      handle.on('click', ({ lng, lat }) => {
        if (!this.disabled) void this.#drop(lng, lat);
      }),
      handle.on('pin-move', ({ lng, lat }) => void this.#drop(lng, lat)),
    );
    this.#pin();
    if (this.value) handle.flyTo(this.value.lng, this.value.lat, 15);
  }

  #pin(): void {
    const handle = this.#session.handle;
    if (!handle) return;
    handle.setPin(this.value ? { lng: this.value.lng, lat: this.value.lat } : null, {
      draggable: !this.disabled,
      label: this.t('picker.pin'),
    });
  }

  /** A place was chosen on the map: take it now, then look the address up. */
  async #drop(lng: number, lat: number): Promise<void> {
    const provisional = this.t('picker.coordinates', { lat: lat.toFixed(5), lng: lng.toFixed(5) });
    this.#set({ lng, lat, label: provisional });
    this.#pin();
    const token = ++this.#reverseToken;
    try {
      const found = await this.#api?.geocoder().reverse(lng, lat);
      // A later drop or a search result replaced this place while the address was on its way.
      if (token !== this.#reverseToken || !found) return;
      this.#set({ lng, lat, label: found.label });
    } catch {
      /* the coordinates stay as the label */
    }
  }

  #choose(result: GeocodeResult): void {
    this.#reverseToken++;
    this.open = false;
    this.query = result.label;
    this.#set({ lng: result.lng, lat: result.lat, label: result.label });
    this.#pin();
    const handle = this.#session.handle;
    if (result.bbox) {
      // A named area fits the view; a point is shown at street level.
      const [w, s, e, n] = result.bbox;
      handle?.flyTo(
        (w + e) / 2,
        (s + n) / 2,
        Math.min(15, Math.max(3, 8 - Math.log2(Math.max(e - w, n - s, 0.001)))),
      );
    } else handle?.flyTo(result.lng, result.lat, 15);
  }

  #scheduleSearch(text: string): void {
    this.query = text;
    clearTimeout(this.#timer);
    this.#search?.abort();
    if (text.trim().length < 2) {
      this.results = [];
      this.open = false;
      this.status = '';
      return;
    }
    this.#timer = setTimeout(() => void this.#runSearch(text), SEARCH_DEBOUNCE_MS);
  }

  async #runSearch(text: string): Promise<void> {
    const api = this.#api;
    if (!api) return;
    this.#search = new AbortController();
    const { signal } = this.#search;
    this.status = this.t('picker.searching');
    try {
      const view = this.#session.handle?.raw() as
        | { getCenter?: () => { lng: number; lat: number } }
        | undefined;
      const c = view?.getCenter?.();
      const results = await api.geocoder().search(text, {
        signal,
        limit: 6,
        ...(c ? { bias: [c.lng, c.lat] as [number, number] } : {}),
      });
      if (signal.aborted) return;
      this.results = results;
      this.active = results.length > 0 ? 0 : -1;
      this.open = true;
      this.status =
        results.length > 0
          ? this.t('picker.results', { count: results.length })
          : this.t('picker.none');
    } catch (error) {
      if (signal.aborted) return;
      this.results = [];
      this.open = true;
      this.status = this.t('picker.failed');
      this.ctx.logger.warn('location search failed', error);
    }
  }

  #onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (this.results.length === 0) return;
      event.preventDefault();
      this.open = true;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.active = (this.active + step + this.results.length) % this.results.length;
    } else if (event.key === 'Enter' && this.open && this.active >= 0) {
      event.preventDefault();
      const result = this.results[this.active];
      if (result) this.#choose(result);
    } else if (event.key === 'Escape' && this.open) {
      event.preventDefault();
      this.open = false;
    }
  };

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    if (changed.has('value') || changed.has('required')) this.#sync();
  }

  protected override updated(changed: PropertyValues): void {
    const container = this.renderRoot.querySelector<HTMLElement>('.map');
    this.#session.sync(this.ctx, this.enabled, container, 'picker', {
      ...(this.center ? { center: this.center } : {}),
      ...(this.zoom !== undefined ? { zoom: this.zoom } : {}),
      controls: { navigation: true, geolocate: false, fullscreen: false, scale: false },
    });
    this.#session.handle?.setLabel(this.t('map.label'));
    if (changed.has('value') || changed.has('disabled')) this.#pin();
    if (changed.has('value') && this.value && !changed.has('query') && this.query === '') {
      this.query = '';
    }
  }

  protected override renderFeature(): unknown {
    const listId = `${this.#id}-results`;
    const v = this.value;
    return html`<div class="field">
      <span class="label" id="${this.#id}-label">${this.label ?? this.t('picker.label')}</span>
      <div class="search" part="search">
        <input
          type="text"
          role="combobox"
          autocomplete="off"
          aria-autocomplete="list"
          aria-labelledby="${this.#id}-label"
          aria-describedby="${this.#id}-hint"
          aria-expanded=${this.open ? 'true' : 'false'}
          aria-controls=${listId}
          aria-activedescendant=${this.open && this.active >= 0 ? `${this.#id}-opt-${this.active}` : nothing}
          placeholder=${this.t('picker.search')}
          ?disabled=${this.disabled}
          .value=${this.query}
          @input=${(e: Event) => this.#scheduleSearch((e.target as HTMLInputElement).value)}
          @keydown=${this.#onKeydown}
          @blur=${() => {
            // Leave time for a click on a result to register first.
            setTimeout(() => {
              this.open = false;
            }, 150);
          }}
        />
        ${
          this.open
            ? html`<ul id=${listId} role="listbox" part="results" aria-label=${this.t('picker.search')}>
                ${
                  this.results.length === 0
                    ? html`<li class="none" role="presentation">${this.status}</li>`
                    : this.results.map(
                        (r, i) => html`<li
                          id="${this.#id}-opt-${i}"
                          role="option"
                          aria-selected=${i === this.active ? 'true' : 'false'}
                          @mousedown=${(e: Event) => e.preventDefault()}
                          @click=${() => this.#choose(r)}
                        >${r.label}</li>`,
                      )
                }
              </ul>`
            : nothing
        }
      </div>
      <span id="${this.#id}-hint" class="visually-hidden">${this.t('picker.search.hint')}</span>
      <div class="visually-hidden" role="status" aria-live="polite">${this.status}</div>
      <div class="map-wrap" part="map">
        <div class="map"></div>
        ${this.loading ? html`<div class="message" style="color:inherit"><tessera-spinner label=${this.t('map.loading')}></tessera-spinner></div>` : nothing}
        ${this.failure ? html`<p class="message" role="alert">${this.t('map.error')}</p>` : nothing}
      </div>
      <div class="chosen">
        ${
          v
            ? html`<span class="text">${v.label}<span class="coords">${this.t('picker.coordinates', { lat: v.lat.toFixed(5), lng: v.lng.toFixed(5) })}</span></span>
                <button class="clear" type="button" ?disabled=${this.disabled} @click=${() => {
                  this.query = '';
                  this.#set(null);
                  this.#pin();
                }}>${this.t('picker.clear')}</button>`
            : html`<span class="muted">${this.t('picker.empty')}</span>`
        }
      </div>
    </div>`;
  }
}
