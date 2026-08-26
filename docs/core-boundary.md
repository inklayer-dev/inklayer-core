# Core boundary

InkLayer Core provides document and annotation behavior, not a finished PDF application. This page answers a practical question: when building a Viewer, which work belongs in Core, and which work belongs in the application or framework component?

## A simple decision rule

A behavior belongs in Core when implementing it differently across React, Vue, and Vanilla JavaScript could change any of the following:

- PDF interpretation or page coordinates;
- annotation data, interaction, or exported output;
- document permissions or direct manipulation;
- resource ownership and cleanup.

A behavior belongs in the application when it mainly controls layout, branding, routing, copy, business workflow, authenticated identity, or server policy.

Many features cross the boundary. In that case, Core owns the consistent behavior and data, while the application owns the controls and presentation.

## Responsibility by feature

| Feature | Core provides | Application or framework provides |
| --- | --- | --- |
| PDF loading | URL/byte loading, Range requests, passwords, cancellation, errors, and document permissions | PDF source, password dialog, loading/error UI, and access policy |
| Pages and zoom | Single, continuous, and facing layouts; virtualization, rendering, scale, gestures, and navigation | Layout container, mode buttons, page-number field, and surrounding styles |
| Thumbnails and outline | Thumbnail rendering, outline extraction, destination resolution, and navigation APIs | Sidebar, tree/grid presentation, selection, and collapse state |
| Search and text selection | Text extraction, matching, result highlighting, normalized selections, and page-space rectangles | Search field, results panel, and contextual action menu |
| Annotation interaction | Tools, hit testing, selection, creation, drag, resize, rotate, and geometry-specific editing | Toolbar, color/appearance controls, contextual menus, and side panels |
| Annotation data | Canonical serializable annotations, comments, references, Repository operations, and change events | Server storage, synchronization, conflict handling, and product-specific metadata |
| Authors and permissions | Uses `currentUser` and annotation permission fields for client-side interaction checks | Trusted identity, permission configuration, user-facing messages, and authoritative backend enforcement |
| Watermarks | Validates watermark settings and renders them in supported Viewer, print, and export paths | Watermark identity text and the business policy deciding where it appears |
| Print and export | Validates document restrictions and generates PDF/Excel content; provides browser print/download helpers | Buttons and options, original PDF bytes, filenames, upload/download decisions, and invocation timing |
| Keyboard and accessibility | Direct-document focus, annotation keyboard interaction, semantic alternatives, and reduced-motion behavior inside document pages | Accessible toolbar/menu/dialog controls, focus order around Core, and localized labels |
| Application services | Capability hooks for logging, requests, text input, Repository, IDs, clock, print, and download | The concrete Provider implementations and any UI they require |

::: warning Client-side permissions are not a security boundary
Core can prevent an interaction such as editing another author's annotation, but browser state can be modified by an end user. The backend must still authenticate requests and enforce read/write permissions when annotations are loaded or saved.
:::

## What Core deliberately does not provide

Core does not include:

- a finished toolbar, thumbnail sidebar, search panel, comment panel, or application shell;
- user authentication, document authorization, or a trusted permission backend;
- a database, server persistence protocol, or real-time collaboration transport;
- application routing, branding, localization policy, or business workflow;
- automatic printing or downloading when a Capability is installed.

These are application responsibilities because their UI, infrastructure, and policies differ between products. The framework guides show how to assemble a minimal Viewer without turning those choices into Core defaults.

## Rules extensions must preserve

Custom framework adapters, Capabilities, and annotation types should preserve these Core guarantees:

- `core.annotations.repository` remains the canonical annotation data source; renderer nodes and DOM rectangles are not persisted.
- Every annotation keeps a zero-based `pageIndex` and an explicit `coordinateSpace`; adapters must not mix Stage and PDF user-space values. Cross-page text selections are split into page-local fragments.
- Document interaction remains tool-driven: text selection, annotation selection, and drawing must not compete for the same pointer input.
- Passwords must not enter logs, ordinary events, stored state, or error payloads.
- Public APIs and events must not expose mutable Konva nodes or PDF.js private state.
- Document-specific tasks, canvases, text layers, subscriptions, and cached thumbnails must be released when a document is replaced or the instance is destroyed.
- A rasterized secure-print PDF is a temporary, unencrypted, image-only print artifact—not a replacement download for the protected source document.

These rules keep behavior and stored data compatible across frameworks. See [Architecture overview](./architecture) for the modules and data flow behind the boundary.
