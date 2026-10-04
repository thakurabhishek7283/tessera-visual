import { useFeature } from '@tessera-kit/react';
import { wrapElement } from '@tessera-internal/react-wrap';
import type { LocationValue, TesseraLocationPicker } from '../elements/location-picker.js';
import type { TesseraMapElement } from '../elements/map.js';
import type { Geocoder, LngLatBounds, MapMarker, MapsApi } from '../types.js';

// Importing the elements module defines the tags. It touches `customElements`, so it only runs
// in the browser; on the server the wrappers render empty tags that upgrade after hydration.
if (typeof window !== 'undefined') void import('../elements/index.js');

export interface MapViewProps {
  markers?: readonly MapMarker[] | undefined;
  /** `[lng, lat]`. */
  center?: [number, number] | undefined;
  zoom?: number | undefined;
  /** Id of the highlighted marker. */
  selected?: string | undefined;
  /** Zoom to show every marker whenever they change. */
  fitMarkers?: boolean | undefined;
  /** Builds the popup of a clicked marker (text or an element). */
  renderPopup?: ((marker: MapMarker) => HTMLElement | string | null) | undefined;
  /** Accessible name of the map. */
  label?: string | undefined;
  onMarkerClick?: ((event: CustomEvent<{ marker: MapMarker }>) => void) | undefined;
  onBoundsChange?: ((event: CustomEvent<{ bounds: LngLatBounds }>) => void) | undefined;
  onMapClick?: ((event: CustomEvent<{ lng: number; lat: number }>) => void) | undefined;
}

/** `<tessera-map>` for React. (Named `MapView` so it does not hide the global `Map`.) */
export const MapView = wrapElement<TesseraMapElement, MapViewProps>({
  tag: 'tessera-map',
  properties: ['markers', 'center', 'zoom', 'selected', 'fitMarkers', 'renderPopup'],
  attributes: { label: 'label' },
  events: {
    onMarkerClick: 'marker-click',
    onBoundsChange: 'bounds-change',
    onMapClick: 'map-click',
  },
});

export interface LocationPickerProps {
  /** Name the value is submitted under in a form. */
  name?: string | undefined;
  label?: string | undefined;
  required?: boolean | undefined;
  disabled?: boolean | undefined;
  center?: [number, number] | undefined;
  zoom?: number | undefined;
  /** The chosen place. Set it to show one, or `null` to clear. */
  value?: LocationValue | null | undefined;
  onLocationChange?: ((event: CustomEvent<{ value: LocationValue | null }>) => void) | undefined;
}

/** `<tessera-location-picker>` for React. Form-associated: it works in a plain `<form>`. */
export const LocationPicker = wrapElement<TesseraLocationPicker, LocationPickerProps>({
  tag: 'tessera-location-picker',
  properties: ['value', 'center', 'zoom', 'required', 'disabled'],
  attributes: { name: 'name', label: 'label' },
  events: { onLocationChange: 'location-change' },
});

/** The maps API once the feature is enabled, or `undefined`. */
export function useMapsApi(): MapsApi | undefined {
  return useFeature('maps');
}

/** The shared geocoder (address search), or `undefined` until the feature is enabled. */
export function useGeocoder(): Geocoder | undefined {
  return useMapsApi()?.geocoder();
}

export type { LocationValue, TesseraLocationPicker, TesseraMapElement };
