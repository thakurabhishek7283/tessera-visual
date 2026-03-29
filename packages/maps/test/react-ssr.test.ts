import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LocationPicker, MapView } from '../src/react/index.js';

describe('React bindings on the server', () => {
  it('render empty tags with attributes and never touch the DOM', () => {
    expect(typeof customElements).toBe('undefined');
    const map = renderToString(
      createElement(MapView, { label: 'Campsites', fitMarkers: true, zoom: 4 }),
    );
    expect(map).toMatch(/^<tessera-map/);
    expect(map).toContain('label="Campsites"');
    const picker = renderToString(createElement(LocationPicker, { name: 'venue', required: true }));
    expect(picker).toMatch(/^<tessera-location-picker/);
    expect(picker).toContain('name="venue"');
  });
});
