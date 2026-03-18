import type { LoadedMapLibre, MapLibreModule } from '../src/maplibre.js';

type Handler = { layer?: string; fn: (e: never) => void; once: boolean };

/** Just enough of MapLibre's event model: `on(type, [layer], fn)`, `once`, `off`. */
export class FakeEmitter {
  readonly handlers = new Map<string, Handler[]>();

  on(type: string, ...args: unknown[]): this {
    return this.add(type, args, false);
  }

  once(type: string, ...args: unknown[]): this {
    return this.add(type, args, true);
  }

  off(type: string, ...args: unknown[]): this {
    const fn = args.at(-1);
    this.handlers.set(
      type,
      (this.handlers.get(type) ?? []).filter((h) => h.fn !== fn),
    );
    return this;
  }

  private add(type: string, args: unknown[], once: boolean): this {
    const fn = args.at(-1) as (e: never) => void;
    const layer = args.length > 1 ? (args[0] as string) : undefined;
    this.handlers.set(type, [
      ...(this.handlers.get(type) ?? []),
      { ...(layer ? { layer } : {}), fn, once },
    ]);
    return this;
  }

  /** Fires `type`; layer handlers only run when `layer` matches. */
  fire(type: string, payload: unknown = {}, layer?: string): void {
    for (const h of [...(this.handlers.get(type) ?? [])]) {
      if (h.layer !== undefined && h.layer !== layer) continue;
      if (h.once) this.off(type, h.fn);
      h.fn(payload as never);
    }
  }
}

export interface FakeSource {
  spec: Record<string, unknown>;
  data: unknown;
  setData(data: unknown): void;
  getClusterExpansionZoom(id: number): Promise<number>;
}

export class FakeMap extends FakeEmitter {
  readonly canvas = document.createElement('canvas');
  readonly sources = new Map<string, FakeSource>();
  readonly layers: Array<Record<string, unknown>> = [];
  readonly controls: Array<{ kind: string; options: unknown; position: unknown }> = [];
  readonly calls: Array<[string, ...unknown[]]> = [];
  readonly featureState = new Map<string, Record<string, unknown>>();
  expansionZoom = 7;
  hits: unknown[] = [];
  center = { lng: 0, lat: 20 };
  zoom: number;
  styleLoaded = false;
  removed = false;
  style: string;

  constructor(readonly options: Record<string, unknown>) {
    super();
    this.style = options.style as string;
    this.zoom = options.zoom as number;
  }

  addControl(control: unknown, position?: string): void {
    const kind = (control as { kind: string }).kind;
    this.controls.push({ kind, options: (control as { options: unknown }).options, position });
  }

  addSource(id: string, spec: Record<string, unknown>): void {
    const source: FakeSource = {
      spec,
      data: spec.data,
      setData: (d) => {
        source.data = d;
        this.calls.push(['setData', id]);
      },
      getClusterExpansionZoom: async () => this.expansionZoom,
    };
    this.sources.set(id, source);
  }

  addLayer(layer: Record<string, unknown>): void {
    this.layers.push(layer);
  }

  getSource(id: string): FakeSource | undefined {
    return this.sources.get(id);
  }

  getLayer(id: string): unknown {
    return this.layers.find((l) => l.id === id);
  }

  removeLayer(id: string): void {
    const at = this.layers.findIndex((l) => l.id === id);
    if (at >= 0) this.layers.splice(at, 1);
  }

  removeSource(id: string): void {
    this.sources.delete(id);
  }

  setStyle(style: string): void {
    this.calls.push(['setStyle', style]);
    this.style = style;
    // A new style has none of the sources and layers that were added.
    this.sources.clear();
    this.layers.length = 0;
    this.featureState.clear();
  }

  isStyleLoaded(): boolean {
    return this.styleLoaded;
  }

  setFeatureState(feature: { source: string; id: string }, state: Record<string, unknown>): void {
    this.featureState.set(feature.id, state);
  }

  removeFeatureState(): void {
    this.featureState.clear();
  }

  queryRenderedFeatures(): unknown[] {
    return this.hits;
  }

  easeTo(options: unknown): void {
    this.calls.push(['easeTo', options]);
  }

  flyTo(options: unknown): void {
    this.calls.push(['flyTo', options]);
  }

  fitBounds(bounds: unknown, options: unknown): void {
    this.calls.push(['fitBounds', bounds, options]);
  }

  getBounds() {
    return {
      toArray: (): [[number, number], [number, number]] => [
        [this.center.lng - 1, this.center.lat - 1],
        [this.center.lng + 1, this.center.lat + 1],
      ],
    };
  }

  getCenter() {
    return this.center;
  }

  getZoom(): number {
    return this.zoom;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  resize(): void {
    this.calls.push(['resize']);
  }

  remove(): void {
    this.removed = true;
  }

  /** The way a real map starts: the style loads, then `load` fires. */
  finishLoading(): void {
    this.styleLoaded = true;
    this.fire('load');
  }
}

export class FakePopup extends FakeEmitter {
  lngLat: [number, number] | undefined;
  content: Node | undefined;
  removed = false;
  constructor(readonly options?: Record<string, unknown>) {
    super();
  }
  setLngLat(p: [number, number]): this {
    this.lngLat = p;
    return this;
  }
  setDOMContent(n: Node): this {
    this.content = n;
    return this;
  }
  addTo(): this {
    return this;
  }
  remove(): this {
    this.removed = true;
    return this;
  }
}

export class FakeMarker extends FakeEmitter {
  lngLat: { lng: number; lat: number } = { lng: 0, lat: 0 };
  removed = false;
  readonly element = document.createElement('div');
  constructor(readonly options?: Record<string, unknown>) {
    super();
  }
  setLngLat(p: [number, number]): this {
    this.lngLat = { lng: p[0], lat: p[1] };
    return this;
  }
  getLngLat() {
    return this.lngLat;
  }
  addTo(): this {
    return this;
  }
  remove(): this {
    this.removed = true;
    return this;
  }
  getElement(): HTMLElement {
    return this.element;
  }
  /** Simulates dropping the pin somewhere. */
  drop(lng: number, lat: number): void {
    this.lngLat = { lng, lat };
    this.fire('dragend');
  }
}

const control = (kind: string) =>
  class {
    readonly kind = kind;
    constructor(readonly options?: unknown) {}
  };

export interface Fake {
  loaded: LoadedMapLibre;
  maps: FakeMap[];
  popups: FakePopup[];
  markers: FakeMarker[];
  /** The most recently created map. */
  map(): FakeMap;
}

export function createFakeMapLibre(css = '.maplibregl-map{position:relative}'): Fake {
  const maps: FakeMap[] = [];
  const popups: FakePopup[] = [];
  const markers: FakeMarker[] = [];
  const lib = {
    Map: class extends FakeMap {
      constructor(options: Record<string, unknown>) {
        super(options);
        maps.push(this);
      }
    },
    Popup: class extends FakePopup {
      constructor(options?: Record<string, unknown>) {
        super(options);
        popups.push(this);
      }
    },
    Marker: class extends FakeMarker {
      constructor(options?: Record<string, unknown>) {
        super(options);
        markers.push(this);
      }
    },
    NavigationControl: control('navigation'),
    GeolocateControl: control('geolocate'),
    FullscreenControl: control('fullscreen'),
    ScaleControl: control('scale'),
    AttributionControl: control('attribution'),
  } as unknown as MapLibreModule;
  return {
    loaded: { lib, css },
    maps,
    popups,
    markers,
    map: () => {
      const m = maps.at(-1);
      if (!m) throw new Error('no map was created');
      return m;
    },
  };
}
