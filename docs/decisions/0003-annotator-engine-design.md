# 3. The annotator engine is headless, uses delta undo and keeps stroke widths per mode

Status: accepted

## Context

The annotator has to be tested without a browser for most of its behaviour, stay fast with a couple of thousand shapes, survive several people editing one set, and look right on both a photograph (where a 2 px outline should stay 2 px when you zoom) and a whiteboard (where a drawn brush stroke grows with the zoom). It was designed from the W3C Web Annotation Data Model, MDN (SVG, Pointer Events) and the public documentation of `rbush` and `perfect-freehand`.

## Decision

- **Headless engine.** `AnnotatorEngine` holds the shapes (an immutable array in stacking order), the selection, the viewport, the tools and the history. It never touches the DOM: tools receive `NormalizedPointer`s (world and screen position, pressure, modifiers) and `KeyInput`s, and the tests drive them with scripted gestures. A `Renderer` paints the engine into one SVG and `attachInput` turns DOM events into pointer calls.
- **One transformed group.** Shapes live in a `<g transform>` in world coordinates; panning and zooming change only that attribute. Selection outlines and grips are drawn in a second, screen-space group, so they keep a constant size. Drags show *drafts* (a geometry override the renderer paints) and write to the store once, on release.
- **Delta commands.** Undo works on the shapes a step changed, not on a snapshot of the whole list: each command is a list of `{ id, from, to, index }`. Undoing never discards what another tab or person changed in between, an update to a shape someone deleted stays deleted, and consecutive nudges merge into one step.
- **Spatial index and hit testing.** An R-tree (`rbush`) over cached bounding boxes (cached per immutable annotation object) is the broad phase; precise tests per geometry follow, with the pick radius defined in screen pixels and converted to world units.
- **Stroke width by mode.** On an image, outlines use `vector-effect: non-scaling-stroke`, so a 2 px line stays 2 px at any zoom. On a board, strokes are in world units and scale with the zoom, like the filled outlines of brush strokes, so a drawing keeps its proportions. Hit testing adds half the painted stroke in the matching unit.
- **Merging sets.** A set is one document; saving after someone else did merges per annotation (newer `updatedAt` wins, deletions as tombstones for 30 days, the stored stacking order kept).
- **A small SVG reader for W3C import.** Foreign SVG is read by a scanner that accepts a whitelist of shapes, instead of `DOMParser`: it works without a DOM, never creates elements from foreign markup and refuses anything else with a warning.

## Consequences

- Almost the whole engine is covered by node tests (several hundred cases); the browser tests cover the renderer, the input adapter and the elements.
- The renderer replaces the node of a shape when it changes (simple and fast enough for the interactive cases); a fully incremental renderer is not needed at the target size.
- Rotation applies to rectangles only; other shapes keep axis-aligned handles.
