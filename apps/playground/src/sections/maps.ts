import '@tessera-kit/maps/elements';
import { baseStyles, focusRing } from '@tessera-kit/elements';
import { type MapMarker, MapsConfig } from '@tessera-kit/maps';
import type { TesseraMapElement } from '@tessera-kit/maps/elements';
import {
  type CSSResultGroup,
  css,
  html,
  LitElement,
  nothing,
  type PropertyDeclarations,
} from 'lit';
import type { Section } from '../sections.js';

/** A deterministic scatter around real cities, so clusters form where people actually live. */
function scatter(count: number): MapMarker[] {
  const cities: Array<[string, number, number]> = [
    ['Zürich', 8.54, 47.37],
    ['Berlin', 13.4, 52.52],
    ['Lisbon', -9.14, 38.72],
    ['Nairobi', 36.82, -1.29],
    ['Tokyo', 139.69, 35.69],
    ['Denver', -104.99, 39.74],
    ['Lima', -77.04, -12.05],
    ['Sydney', 151.21, -33.87],
  ];
  let seed = 7;
  const random = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const colors = ['primary', 'danger', 'warning', 'success'];
  return Array.from({ length: count }, (_, i) => {
    const [name, lng, lat] = cities[i % cities.length] as [string, number, number];
    const spread = 2.2;
    return {
      id: `site-${i}`,
      lng: lng + (random() - 0.5) * spread,
      lat: lat + (random() - 0.5) * spread * 0.7,
      title: `${name} site ${Math.floor(i / cities.length) + 1}`,
      color: colors[i % colors.length] as string,
      data: { city: name, price: 18 + Math.floor(random() * 40) },
    };
  });
}

/** The map with a clustering demo, the popup template and a bounds readout. */
export class MapDemo extends LitElement {
  static override properties: PropertyDeclarations = {
    count: { state: true },
    bounds: { state: true },
    picked: { state: true },
  };
  static override styles: CSSResultGroup = [
    baseStyles,
    focusRing,
    css`
      :host {
        display: grid;
        gap: var(--tessera-space-3);
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--tessera-space-2);
        align-items: center;
      }
      tessera-map {
        --tessera-map-height: 34rem;
      }
      .readout {
        font-size: var(--tessera-font-size-sm);
        color: var(--tessera-color-text-muted);
        font-variant-numeric: tabular-nums;
      }
      .popup strong {
        display: block;
      }
    `,
  ];

  count = 2000;
  bounds = '';
  picked = '';

  #markers = scatter(2000);

  #setCount(n: number): void {
    this.count = n;
    this.#markers = scatter(n);
    const map = this.renderRoot.querySelector<TesseraMapElement>('tessera-map');
    if (map) {
      map.markers = this.#markers;
      void map.updateComplete.then(() => map.handle?.fitToMarkers());
    }
  }

  protected override render(): unknown {
    return html`
      <div class="row">
        <tessera-button size="sm" variant=${this.count === 2000 ? 'primary' : 'secondary'} @click=${() => this.#setCount(2000)}>2 000 markers</tessera-button>
        <tessera-button size="sm" variant=${this.count === 24 ? 'primary' : 'secondary'} @click=${() => this.#setCount(24)}>24 markers</tessera-button>
        <tessera-button size="sm" variant="ghost" @click=${() => this.renderRoot.querySelector<TesseraMapElement>('tessera-map')?.handle?.fitToMarkers()}>Fit to markers</tessera-button>
        <span class="readout" role="status">${this.bounds ? `Visible: ${this.bounds}` : 'The map is loading'}${this.picked ? ` · Clicked: ${this.picked}` : ''}</span>
      </div>
      <tessera-map
        fit-markers
        center="8.5,47.4"
        zoom="3"
        label="Campsites around the world"
        .markers=${this.#markers}
        @bounds-change=${(e: CustomEvent<{ bounds: [[number, number], [number, number]] }>) => {
          const [[w, s], [ea, n]] = e.detail.bounds;
          this.bounds = `${w.toFixed(1)}, ${s.toFixed(1)} to ${ea.toFixed(1)}, ${n.toFixed(1)}`;
        }}
        @marker-click=${(e: CustomEvent<{ marker: MapMarker }>) => {
          this.picked = e.detail.marker.title ?? e.detail.marker.id;
        }}
      >
        <template slot="popup">
          <div class="popup"><strong data-field="title"></strong><span data-field="city"></span> · from $<span data-field="price"></span> a night</div>
        </template>
      </tessera-map>
      ${this.count === 2000 ? html`<p class="readout">Nearby markers merge into clusters; click one to zoom in.</p>` : nothing}
    `;
  }
}

if (!customElements.get('map-demo')) customElements.define('map-demo', MapDemo);

export const mapsSection: Section = {
  id: 'maps',
  label: 'Map',
  blurb:
    'MapLibre with OpenFreeMap tiles, so no API key. Two thousand markers cluster on the fly; click a marker for a popup built from a template. Needs the network for tiles.',
  schema: MapsConfig,
  load: () => import('@tessera-kit/maps'),
  // Vite moves MapLibre away from its worker files; the tesseraMapsWorker() plugin serves them.
  defaults: { workerUrl: `${import.meta.env.BASE_URL}tessera-maps/maplibre-gl-worker.mjs` },
  render: () => html`<map-demo></map-demo>`,
};
