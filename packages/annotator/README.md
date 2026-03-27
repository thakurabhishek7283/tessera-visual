# @tessera/annotator

Work in progress.

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
| `persistence` | `"none" \| "storage"` | `"storage"` | `storage` keeps each set in the `annotator.sets` collection, keyed by `set-id` or the image URL. |

<!-- config:end -->
