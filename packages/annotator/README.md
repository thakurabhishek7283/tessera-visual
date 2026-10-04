# @tessera-kit/annotator

Draw, label and discuss shapes over an image, or on an endless whiteboard: a headless engine, `<tessera-annotator>`, `<tessera-whiteboard>`, an accessible list of the shapes and React bindings. Part of [tessera-visual](../../README.md).

It needs a storage adapter and nothing else. With the default `indexeddb` or `local` storage a set survives a reload, and a second tab of the same browser sees changes as they are made; with `rest` storage ([tessera-server](https://github.com/thakurabhishek7283/tessera-server)) it is shared between people.

## Quick start

### Any framework (Web Components)

```html
<script type="module">
  import '@tessera-kit/annotator/elements';
</script>

<tessera-annotator src="/camp-map.jpg" set-id="camp-map" style="--tessera-annotator-height: 32rem"></tessera-annotator>
<tessera-whiteboard board-id="standup"></tessera-whiteboard>
```

A bare tag works without any setup: it switches the feature on in an implicit instance that stores sets in the browser. To control the instance, put the elements inside a `<tessera-root>` or set their `tessera` property.

### With `createTessera`

```ts
import { createTessera } from '@tessera-kit/core';
import { createStorage } from '@tessera-kit/storage';

const tessera = createTessera(
  {
    appId: 'camp',
    storage: { type: 'indexeddb' },
    features: {
      annotator: {
        enabled: true,
        requireLabel: true,
        labels: [
          { value: 'tent site', color: 'green' },
          { value: 'fire pit', color: 'red' },
        ],
      },
    },
  },
  { plugins: { annotator: () => import('@tessera-kit/annotator') }, adapters: { storage: createStorage } },
);
await tessera.ready;
```

### Headless

`create` mounts the engine into any element that has a size. No element, no toolbar: you bring the UI.

```ts
const api = tessera.feature('annotator');
const handle = await api?.create(document.querySelector('#canvas')!, {
  mode: 'image',
  src: '/camp-map.jpg',
  setId: 'camp-map',
  hooks: {
    beforeCreate: (draft) => draft.geometry.type !== 'point', // refuse points
  },
});
handle?.setTool('rect');
handle?.annotations.subscribe((list) => console.log(list.length));
const w3c = handle?.exportW3C();
```

### React

```tsx
import { useRef } from 'react';
import {
  AnnotationList,
  Annotator,
  type TesseraAnnotatorElement,
  useAnnotations,
  useAnnotatorHandle,
} from '@tessera-kit/annotator/react';

export function CampMap() {
  const ref = useRef<TesseraAnnotatorElement>(null);
  const handle = useAnnotatorHandle(ref);
  const shapes = useAnnotations(handle);
  return (
    <>
      <Annotator ref={ref} id="camp" src="/camp-map.jpg" setId="camp-map" noPanel config={{ requireLabel: true }} />
      <AnnotationList for="camp" />
      <p>{shapes.length} shapes</p>
    </>
  );
}
```

On the server the wrappers render an empty tag that upgrades after hydration. In Next.js, import them with `dynamic(() => import(...), { ssr: false })` if you want to avoid the empty tag in the HTML.

## Configuration

<!-- config:start -->

| Option | Type | Default | Description |
|---|---|---|---|
| `tools` | `Array<"select" \| "pan" \| "rect" \| … (11 values)>` | `["select","rect","ellipse","polygon","arrow","freehand","…` | Tools offered in the toolbar, in order. `pan` is always available with space or middle mouse. |
| `defaultTool` | `"select" \| "pan" \| "rect" \| … (11 values)` | `"select"` | Tool active on start. |
| `labels` | `object[]` | `[]` | Label vocabulary. The label colour becomes the stroke colour of its shapes. |
| `requireLabel` | `boolean` | `false` | Ask for a label after drawing a shape; cancelling discards the shape. |
| `allowFreeTextLabels` | `boolean` | `true` | Let people type labels that are not in the vocabulary. |
| `comments` | `boolean` | `true` | Show a discussion for the selected shape: the `comments` kit when enabled, else a note field. |
| `readOnly` | `boolean` | `false` | Show annotations without letting anyone change them. |
| `snapping` | `object` | `{"enabled":true,"tolerancePx":8}` | Snap points to the vertices and edges of other shapes while drawing or editing. |
| `snapping.tolerancePx` | `number` | `8` |  |
| `freehand` | `object` | `{"size":6,"thinning":0.5,"smoothing":0.5,"streamline":0.5}` | Brush of the freehand tool, passed to perfect-freehand. |
| `freehand.size` | `number` | `6` |  |
| `freehand.thinning` | `number` | `0.5` |  |
| `freehand.smoothing` | `number` | `0.5` |  |
| `freehand.streamline` | `number` | `0.5` |  |
| `minimap` | `boolean` | `false` | Show an overview of the whole surface in a corner; drag in it to move the view. |
| `persistence` | `"none" \| "storage"` | `"storage"` | `storage` keeps each set in the `annotator.sets` collection, keyed by `set-id` or the image URL. |

<!-- config:end -->

The same options can be set per surface: through the `config` property of the elements, or `config` in `api.create(el, { config })`.

## Elements

### `<tessera-annotator>`

| Attribute / property | Description |
| --- | --- |
| `src` | The image URL. Shapes are in the image's own pixels. |
| `set-id` | Key of the stored set. Defaults to a hash of `src`. |
| `alt` | Text alternative of the canvas. |
| `readonly` | Show shapes without letting anyone change them. |
| `no-panel` | Hide the list beside the canvas (use `<tessera-annotation-list for>` elsewhere). |
| `config` (property) | Options for this surface, e.g. `{ tools, labels, requireLabel, minimap }`. |
| `handle` (property, read only) | The `AnnotatorHandle` once the surface is open. |

| Event | Detail | Cancelable |
| --- | --- | --- |
| `annotation-create` | `{ annotation }` | yes: `preventDefault()` discards the shape the user just drew |
| `annotation-update` | `{ annotation, before }` | no |
| `annotation-delete` | `{ annotation }` | no |
| `selection-change` | `{ ids }` | no |
| `annotator-ready` | `{ handle }` | no |
| `annotator-closed` | none | no |

`annotation-update` and `annotation-delete` report changes made here (drawing, editing, undo and redo), not changes that arrive from another tab.

Parts: `toolbar`, `canvas`, `panel`. Size: the element is `34rem` tall; set `--tessera-annotator-height`. The panel is `19rem` wide (`--tessera-annotator-panel-width`) and moves below the canvas on narrow screens.

### `<tessera-whiteboard>`

The same engine in board mode: a dot grid that scales with the world, no image, colour and line-width pickers in the toolbar. Attribute `board-id` replaces `set-id`; everything else is as above. A colour or width chosen while shapes are selected changes them too.

### `<tessera-annotation-list for="id">`

The accessible view of a surface, standalone or built into the annotator. Every shape is a button with its label and a sentence describing it ("Rectangle at 120, 80, 200×150"); choosing one selects it on the canvas, the arrow keys move between rows and `Delete` removes. Below the list the selected shape can be labelled, noted, hidden, locked, zoomed to and deleted. When the `comments` kit is on (and its elements are loaded) the note is replaced by a `<tessera-comments target="annotation:<set>:<id>">` thread.

Parts: `list`, `item`, `details`. `for` is the id of an annotator or whiteboard element in the same document or shadow root.

## The handle

`api.create(el, options)` resolves to an `AnnotatorHandle`:

| Member | Description |
| --- | --- |
| `annotations` / `selection` / `tool` / `view` / `viewSize` | Read-only stores: shapes in stacking order, selected ids (the last is the primary one), the active tool, zoom and pan, the visible area in pixels. |
| `history` | Undo and redo (`undo()`, `redo()`, `state`). |
| `drawStyle` | Store of the style given to the next shape. |
| `setTool(id)` | Switches tool; tools that are not configured are refused. |
| `add(annotation)` · `update(id, patch)` · `remove(ids)` | Programmatic edits. Each is one undo step. |
| `select(ids)` · `setVisible(id, visible)` | Selection and visibility. |
| `fit()` · `zoomBy(factor)` · `zoomTo(id)` · `panTo(x, y)` | The view. |
| `exportW3C()` · `importW3C(list, 'replace' \| 'merge')` | W3C Web Annotations; importing returns a warning per annotation it had to skip and is one undo step. |
| `exportPNG()` | The image with the shapes on top (a board: its content on the theme background). |
| `on('change', fn)` | Local changes: `{ created, updated, deleted }`. |
| `destroy()` | Writes pending changes and removes the surface. |

`AnnotatorOptions.hooks` lets the host take part: `beforeCreate(draft)` can veto a shape, `pickLabel(draft)` supplies the label flow (the elements show a dialog), `editText(request)` supplies in-place text editing.

## Tools and keys

The tools offered are `config.tools`. Hotkeys work while the canvas has focus.

| Tool | Key | How |
| --- | --- | --- |
| select | `V` | Click to select (`Shift` adds), drag a shape to move it, drag a grip to resize, drag a vertex to edit, drag a midpoint grip to add a vertex, `Alt`+click a vertex to remove it, drag empty space to select with a box (`Alt`: only shapes fully inside). The round grip above a rectangle rotates it (`Shift`: 15° steps). |
| pan | `H` | Drag to move the view. Always available with `Space` held or the middle button. |
| rect, ellipse | `R`, `E` | Drag from corner to corner. `Shift` makes a square or circle, `Alt` grows from the centre. |
| polygon | `P` | Click to add vertices; close by clicking the first one, double-click or `Enter`. `Backspace` removes the last vertex, `Esc` cancels. |
| polyline, arrow | `L`, `A` | Like polygon but open; or press, drag and release for a straight line. |
| freehand | `D` | Press and draw. Pen pressure is used; the stroke is simplified when you release. |
| point | `O` | Click. |
| text | `T` | Click to write (`Enter` keeps, `Shift`+`Enter` adds a line, `Esc` cancels); click an existing text to edit it. |
| eraser | `X` | Drag across shapes; they dim and are deleted together when you release. |

| Key | Does |
| --- | --- |
| `Ctrl/⌘`+`Z`, `Ctrl/⌘`+`Shift`+`Z` (or `Y`) | Undo, redo |
| `Delete`, `Backspace` | Delete the selection |
| `Ctrl/⌘`+`A`, `Ctrl/⌘`+`D` | Select all, duplicate |
| arrows | Nudge the selection 1 px (`Shift`: 10); with nothing selected, move the view |
| `[` `]` | One step backward or forward in the stacking order |
| `+` `-` `0` | Zoom in, out, fit |
| `Esc` | Cancel the drawing, then clear the selection, then return to select |

Mouse wheel pans; `Ctrl/⌘`+wheel (and a trackpad pinch) zooms around the pointer; two fingers pan and zoom on touch screens. Zooming out stops at about half of the fitted size (an image) or 10 % (a board); zooming in at 8×. Locked shapes can be selected but not moved, and nothing changes in read-only mode.

## Data model

All geometry is in world coordinates: the image's own pixels, or board units.

| `geometry.type` | Fields |
| --- | --- |
| `rect` | `x, y, w, h`, optional `rotation` (degrees, clockwise, about the centre) |
| `ellipse` | `cx, cy, rx, ry` |
| `polygon` | `points` (closed, at least 3) |
| `polyline` | `points` (at least 2), optional `arrowStart`, `arrowEnd` |
| `freehand` | `points` as `[x, y, pressure]` |
| `point` | `x, y` |
| `text` | `x, y` (top left), `text`, `fontSize` |

An `Annotation` is `{ id, geometry, bodies, style?, createdBy?, createdAt, updatedAt, hidden?, locked? }`. Bodies are `{ purpose: 'tagging' | 'commenting' | 'describing', value }`: the first `tagging` body is the label. `style` is `{ stroke?, fill?, strokeWidth?, opacity? }`; colours are palette names (`blue`, `red`, `green`, `amber`, `purple`, `teal`, `pink`, `gray`) or any CSS colour. A shape has a light wash of its stroke colour unless `fill` is `none`.

On an image, strokes keep a constant width on screen (`vector-effect: non-scaling-stroke`) and handles keep a constant size; on a board strokes are in world units and scale with the zoom, like brush strokes do (see ADR 0003).

## W3C Web Annotation

`exportW3C()` writes standard Web Annotations with `TextualBody` bodies and a selector per shape:

| Shape | Selector |
| --- | --- |
| rect without rotation | `FragmentSelector`, `xywh=pixel:x,y,w,h` (Media Fragments) |
| rotated rect | `SvgSelector` with `<rect transform="rotate(…)">` |
| ellipse, polygon, polyline | `SvgSelector` with `<ellipse>`, `<polygon>`, `<polyline>` (`class="arrow-start arrow-end"` for arrowheads) |
| freehand | `SvgSelector` with `<path class="freehand" d="M… L…">` (pressure is not exported) |
| point | `SvgSelector` with `<circle r="0">` |
| text | `SvgSelector` with `<text>` |

`created`, `modified` and `creator` are exported; `style`, `hidden` and `locked` are not. Import accepts single objects or arrays for `body`, `target` and `selector`, maps `classifying` to a tag, and reads `<rect>`, `<ellipse>`, `<circle>`, `<line>`, `<polygon>`, `<polyline>`, `<text>` and straight `<path>`s (`M L H V Z`, absolute or relative). The SVG is read by a small scanner, never by the browser: scripts, images, foreign objects, curves, entities and more than one shape per selector are refused with a warning, and percent fragments are refused because they need the image size.

## Persistence

With `persistence: 'storage'` each set is one document in the `annotator.sets` collection, keyed by `set-id` (or a hash of the image URL): `{ source, annotations, deletedIds }`. Changes are saved 500 ms after the last one with a version check. When someone saved first, the two copies are merged one annotation at a time: the newer `updatedAt` wins, a deletion beats an older edit and loses against a newer one (deletions are remembered for 30 days as tombstones), and the stacking order of the stored copy is kept. Where storage reports changes (IndexedDB and local storage across tabs, REST through a transport) other copies update live. Undo only touches the shapes a step changed, so it never discards what someone else did in between.

## Styling

Elements use the Tessera design tokens. The shape palette is `--tessera-annotator-blue` … `--tessera-annotator-gray`, with lighter values in dark themes; override any of them. Handles, the selection and the grid follow `--tessera-color-primary`, `--tessera-color-border` and `--tessera-color-warning`.

## Accessibility

The canvas is a drawing surface, so the list is the accessible representation: every shape is reachable, described in words and operable from the keyboard, and changes are announced in a live region. The canvas itself has a name, a keyboard help text and hotkeys; the toolbar is one tab stop with arrow-key navigation. Colour is never the only carrier of meaning (the list names every label). The minimap is a pointer convenience and is hidden from assistive technology. The components are checked with axe against WCAG 2.2 AA.

## Messages

Every string is a key in `ctx.i18n` (`annotator.*`, `list.*`, `details.*`, `label.*`, `geometry.*`); English and German ship with the package. Override any key through `config.messages`.

## Limits

While the view moves only one `transform` attribute changes, so panning and zooming cost the same with 2 000 shapes as with 20 (a test moves the view 120 times over 2 000 shapes and checks that no shape node is touched). A set is limited to 5 000 shapes and 20 000 points per stroke. Text is plain, not rich. Rotation applies to rectangles. Editing a set at the same moment from two places merges per annotation, not per field.
