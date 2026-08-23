# InkLayer Core CSS Contract

Import the engine stylesheet once in a browser application:

```ts
import '@inklayer-dev/core/style'
```

Every Annotation Engine instance adds `.inklayer-engine`,
`data-inklayer-instance`, and `data-inklayer-tool` only to its supplied root.
Attached page containers receive reversible `data-inklayer-page` and instance
metadata. Destroy removes all metadata owned by that engine. Core never changes
`body`, `html`, or a fixed global element ID.

## Public variables

All variables are optional and have a standalone fallback in the generated CSS.
Override them on one engine root to avoid affecting another instance.

| Variable | Default | Purpose |
|---|---:|---|
| `--inklayer-author-label-background` | `#1677ff` | Author/reference label background |
| `--inklayer-author-label-foreground` | `#fff` | Author/reference label text |
| `--inklayer-author-label-font-size` | `12px` | Label text size |
| `--inklayer-author-label-radius` | `3px` | Label corner radius |
| `--inklayer-author-label-padding` | `2px 5px` | Label inner spacing |
| `--inklayer-overlay-z-index` | `2` | Konva canvas overlay layer |
| `--inklayer-text-layer-z-index` | `1` | Selectable PDF.js TextLayer |
| `--inklayer-selection-z-index` | `3` | Labels and temporary input layer |
| `--inklayer-accessibility-z-index` | `4` | Focused Canvas semantic alternative layer |
| `--inklayer-accessibility-background` | `#101828` | Focused annotation alternative background |
| `--inklayer-accessibility-foreground` | `#fff` | Focused annotation alternative text |
| `--inklayer-accessibility-focus-ring` | `#84adff` | Engine and annotation keyboard focus ring |
| `--inklayer-search-highlight-background` | `rgb(250 204 21 / 45%)` | Search match background |
| `--inklayer-search-active-background` | `rgb(249 115 22 / 60%)` | Active search match background |
| `--inklayer-search-active-outline` | `rgb(194 65 12 / 70%)` | Active search match outline |
| `--inklayer-text-input-background` | `#fff` | FreeText editor background |
| `--inklayer-text-input-border` | `#1677ff` | FreeText editor border |
| `--inklayer-text-input-foreground` | `#111827` | FreeText editor text |
| `--inklayer-text-input-focus-ring` | `rgb(22 119 255 / 25%)` | Keyboard focus indicator |
| `--inklayer-cursor-select` | `default` | Existing-annotation selection cursor |
| `--inklayer-cursor-text-markup` | embedded SVG | Highlight/underline/strikeout cursor |
| `--inklayer-cursor-shape` | `crosshair` | Shape, line, and path cursors |
| `--inklayer-cursor-freehand` | embedded SVG | Freehand pen cursor |
| `--inklayer-cursor-free-highlight` | embedded SVG | Free-highlight marker cursor |
| `--inklayer-cursor-note` | `copy` | Note placement cursor |
| `--inklayer-cursor-free-text` | `text` | FreeText placement cursor |
| `--inklayer-cursor-signature` | `copy` | Prepared Signature image placement cursor |
| `--inklayer-cursor-stamp` | `copy` | Prepared Stamp image placement cursor |
| `--inklayer-cursor-image-missing` | `not-allowed` | Signature/Stamp cursor before an image is prepared |

After `setImageAsset`, Core creates the instance-local
`--inklayer-cursor-signature-asset` or `--inklayer-cursor-stamp-asset` runtime
value. It is a bounded thumbnail of the actual image with an outline, shadow and
center hotspot; it is removed when the asset is cleared or the engine is
destroyed. These two generated variables are runtime state rather than consumer
configuration.

Core CSS styles only renderer wrappers, Konva placement, author labels,
temporary FreeText input, cursor state, pointer routing, and stacking. Toolbars,
sidebars, dialogs, application layout, scrollbar appearance, and brand themes
belong to consumers. `.inklayer-page-flow` is a stable styling hook, but Core
does not prescribe scrollbar width, colors, hover treatment, or platform theme.
The `text-select` tool disables page Canvas hit routing so the PDF.js TextLayer
can create a native browser selection; `select` restores annotation manipulation.
Core chooses cursor semantics for each interaction mode; consumers may theme
the published variables without reimplementing the tool-to-cursor mapping.

PDF.js TextLayer implementation variables such as `--font-height`, `--scale-x`,
and `--text-scale-factor` may appear below `.inklayer-text-layer`. They are
private compatibility details populated by PDF.js, not consumer theme tokens.
