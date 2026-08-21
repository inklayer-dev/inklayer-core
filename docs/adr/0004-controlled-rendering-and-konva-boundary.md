# ADR 0004: Controlled Rendering and the Konva Boundary

> Status: Accepted
> Date: 2026-08-14
> Scope: Annotation Type rendering, interaction, hit testing, snapshots, print, and framework isolation

## Context

Making annotation types extensible could expose Konva `Stage` or `Node` objects
to plugin authors. That is initially convenient but would couple plugins to a
specific Konva version, permit unmanaged listeners and nodes, bypass Core hit
testing and transforms, and make teardown, printing, snapshots, and export
unreliable.

At the other extreme, a metadata-only type registry would not support real
custom geometry or behavior and would leave central type switches in place.

## Decision

Public Annotation Type Definitions use controlled, renderer-neutral facets.
They do not receive or return Konva objects.

### Definition facets

A Definition declares:

- stable type ID and Definition API version;
- geometry family and capabilities;
- type-data codec;
- Appearance defaults and supported controls;
- creation strategy;
- optional pure interaction reducers;
- controlled renderer;
- optional PDF import/export behavior.

### Geometry and interaction

V1 provides standard geometry families and creation strategies for boxes, lines,
polylines, paths, text markup, text boxes, points, and images.

Core captures pointer/keyboard gestures and performs permission checks,
transactions, validation, and Repository commits. A custom interaction receives
detached canonical data and normalized page-space input, and returns a new draft
or transform result. It may not attach Canvas listeners or mutate live nodes.

### Controlled scene

A renderer returns a bounded scene description using Core-owned primitives such
as Group, rectangle, ellipse, line/polyline, path, text, image, and text-markup
rectangles. Core translates that scene into Konva and owns:

- node IDs and hierarchy;
- layer placement;
- event listeners;
- hit regions and minimum hit slop;
- selection and hover projection;
- Transformer, endpoint, and vertex controls;
- author/reference tags;
- scale and coordinate projection;
- snapshot generation and validation;
- destruction.

Built-in definitions may use internal optimized helpers, but they resolve through
the same Registry and obey the same observable capability contracts.

### Renderer state

`rendererState` remains the exact Core-produced drawing snapshot and is preserved
when a definition is unavailable. A custom type's common envelope plus `typeData`
must contain sufficient canonical information to rebuild its controlled scene.
Plugins do not execute or directly interpret retained Konva serialization.

Unknown custom renderer state is bounded and preserved but not instantiated as
Konva nodes until a compatible definition and Core validation path are present.

### Hit testing and transforms

Definitions declare transform capabilities. Core chooses standard move, resize,
rotate, endpoint, and vertex interactions. Thin shapes receive a Core-defined hit
region larger than their visible stroke. Hit slop and selection affordances are
transient and are not persisted Appearance.

Optional custom hit refinement is pure and receives only detached geometry and a
page-space point.

### Print and export

Screen rendering, print, and PDF export derive from the same validated canonical
definition. A definition declares `native`, `appearance-stream`, `raster`, or
`unsupported` PDF export strategy. Unsupported items are reported by ID; silent
omission is forbidden.

Selection controls, hover state, transform handles, and screen-only tags never
enter print/export output.

### Framework boundary

Core may expose framework-neutral capabilities, cursor intent, and stable type
identity. React/Vue own icons, property panels, localized labels, menus, and
dialogs in separate adapter-side registries.

## Consequences

### Positive

- custom types can render and interact without destabilizing Konva ownership;
- Core guarantees consistent hit testing, transforms, tags, printing, and
  teardown;
- plugins are insulated from Konva version changes;
- React/Vue never need renderer objects;
- unknown snapshots are not executed as trusted scene data.

### Costs

- Core must design and maintain a bounded scene vocabulary;
- advanced custom rendering is limited to approved primitives in V1;
- internal conversion may add a small cost that requires benchmarks;
- plugin authors express interaction as pure data transformations rather than
  imperative Canvas code.

## Rejected alternatives

### Expose `render(stage): Konva.Node`

Rejected because it breaks ownership, cleanup, version isolation, hit testing,
and safe unknown-type behavior.

### Allow framework adapters to render custom annotations

Rejected because Canvas behavior, print/export, and cross-framework parity would
diverge.

### Support metadata-only custom types

Rejected because it does not remove central type behavior or enable useful
domain annotations.

### Persist only raster output

Rejected because semantic editing, transforms, accessibility, and deterministic
vector export would be lost.

## Verification

- public declarations contain no Konva type;
- a proof custom type creates, renders, selects, transforms, prints, exports, and
  disposes through controlled contracts;
- browser tests prove thin-line hit slop, tags, hover, cursors, and transforms;
- snapshot tests reject unsafe scenes and never instantiate unknown snapshots;
- performance benchmarks compare built-in rendering and pointer interaction to
  the current baseline;
- framework integration tests use canonical commands/events only.
