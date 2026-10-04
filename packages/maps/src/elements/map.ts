import { baseStyles, focusRing, TesseraElement, visuallyHidden } from '@tessera-kit/elements';
import {
  type CSSResultGroup,
  css,
  html,
  nothing,
  type PropertyDeclarations,
  type PropertyValues,
} from 'lit';
import type { LngLatBounds, MapHandle, MapMarker } from '../types.js';
import { MapSession } from './session.js';

/** `"8.54,47.37"` as `[lng, lat]`. */
export function parseCenter(
  value: string | [number, number] | null | undefined,
): [number, number] | undefined {
  if (Array.isArray(value)) return value;
  const parts = value?.split(',').map((p) => Number(p.trim()));
  if (parts?.length !== 2 || parts.some((n) => !Number.isFinite(n))) return undefined;
  return [parts[0] as number, parts[1] as number];
}

/**
 * Fills a `<template>` for one marker: every element with `data-field="name"` gets the text of
 * `marker.data.name` (or `marker.title` / `marker.id` for those names). Text only, never markup.
 */
export function fillTemplate(template: HTMLTemplateElement, marker: MapMarker): HTMLElement {
  const holder = document.createElement('div');
  holder.append(template.content.cloneNode(true));
  for (const el of holder.querySelectorAll<HTMLElement>('[data-field]')) {
    const field = el.dataset.field ?? '';
    const value =
      field in (marker.data ?? {})
        ? marker.data?.[field]
        : (marker as unknown as Record<string, unknown>)[field];
    el.textContent = value === undefined || value === null ? '' : String(value);
  }
  return holder;
}

/**
 * `<tessera-map>`: a map with clustered markers. Set `markers`, optionally `fit-markers`, and
 * describe the popup with a `<template slot="popup">` whose `data-field` elements are filled from
 * the clicked marker, or set `renderPopup(marker)` to build one yourself. The container needs a
 * height: it uses `--tessera-map-height` (default 24rem).
 *
 * @fires marker-click - `{ marker }`
 * @fires bounds-change - `{ bounds }` once the map stops moving
 * @fires map-click - `{ lng, lat }` for clicks on empty map
 * @csspart map
 * @slot popup - a `<template>` for marker popups
 */
export class TesseraMapElement extends TesseraElement {
  static override properties: PropertyDeclarations = {
    markers: { attribute: false },
    center: { converter: { fromAttribute: (v: string | null) => parseCenter(v) } },
    zoom: { type: Number },
    selected: {},
    fitMarkers: { type: Boolean, attribute: 'fit-markers' },
    renderPopup: { attribute: false },
    label: {},
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
        position: relative;
        height: var(--tessera-map-height, 24rem);
        min-height: 10rem;
        border: 1px solid var(--tessera-color-border);
        border-radius: var(--tessera-radius-lg);
        overflow: hidden;
        background: var(--tessera-color-surface-2);
      }
      .map {
        position: absolute;
        inset: 0;
      }
      .message {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        padding: var(--tessera-space-4);
        text-align: center;
        pointer-events: none;
      }
      .message.error {
        color: var(--tessera-color-danger);
      }
    `,
  ];

  protected readonly featureId: string | null = 'maps';

  markers: MapMarker[] = [];
  /** Initial and, when it changes later, new centre as `[lng, lat]` (attribute: `"lng,lat"`). */
  center: [number, number] | undefined;
  zoom: number | undefined;
  /** Id of the highlighted marker. */
  selected: string | undefined;
  fitMarkers = false;
  /** Builds a popup element for a clicked marker. Wins over the `popup` template. */
  renderPopup: ((marker: MapMarker) => HTMLElement | string | null) | undefined;
  label: string | undefined;
  loading = false;
  failure: string | undefined;

  #stops: Array<() => void> = [];
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

  /** The map handle once it is open, for hosts that need more than the element offers. */
  get handle(): MapHandle | undefined {
    return this.#session.handle;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#session.close();
  }

  #onOpen(handle: MapHandle): void {
    handle.setLabel(this.label ?? this.t('map.label'));
    this.#stops.push(
      handle.on('marker-click', ({ marker }) => {
        this.emit('marker-click', { marker });
        this.#popup(handle, marker);
      }),
      handle.on('click', ({ lng, lat }) => this.emit('map-click', { lng, lat })),
      handle.on('move-end', ({ bounds }: { bounds: LngLatBounds }) =>
        this.emit('bounds-change', { bounds }),
      ),
    );
    this.#push();
  }

  #popup(handle: MapHandle, marker: MapMarker): void {
    const custom = this.renderPopup?.(marker);
    if (custom !== undefined && custom !== null) {
      handle.openPopup(marker.id, custom);
      return;
    }
    const slot = this.renderRoot.querySelector<HTMLSlotElement>('slot[name=popup]');
    const template = slot
      ?.assignedElements({ flatten: true })
      .find((e): e is HTMLTemplateElement => e instanceof HTMLTemplateElement);
    if (template) handle.openPopup(marker.id, fillTemplate(template, marker));
  }

  /** Sends the element's properties to the map. */
  #push(): void {
    const handle = this.#session.handle;
    if (!handle) return;
    handle.setMarkers(this.markers);
    handle.setSelected(this.selected ?? null);
    if (this.fitMarkers) handle.fitToMarkers();
  }

  protected override updated(changed: PropertyValues): void {
    const container = this.renderRoot.querySelector<HTMLElement>('.map');
    this.#session.sync(this.ctx, this.enabled, container, 'map', {
      ...(this.center ? { center: this.center } : {}),
      ...(this.zoom !== undefined ? { zoom: this.zoom } : {}),
    });
    if (changed.has('markers') || changed.has('selected') || changed.has('fitMarkers'))
      this.#push();
    const handle = this.#session.handle;
    handle?.setLabel(this.label ?? this.t('map.label'));
    // Centre and zoom are options at the start; afterwards a change moves the map.
    if (
      handle &&
      (changed.has('center') || changed.has('zoom')) &&
      changed.get('center') !== undefined
    ) {
      if (this.center) handle.flyTo(this.center[0], this.center[1], this.zoom);
    }
  }

  protected override renderFeature(): unknown {
    const count = this.markers.length;
    return html`
      <div class="map" part="map"></div>
      <p class="visually-hidden" role="status">${this.t('map.markers', { count })}</p>
      ${this.loading ? html`<div class="message"><tessera-spinner label=${this.t('map.loading')}></tessera-spinner></div>` : nothing}
      ${this.failure ? html`<p class="message error" role="alert">${this.t('map.error')}</p>` : nothing}
      <slot name="popup" hidden></slot>
    `;
  }
}
