# ADR 0005: Defer Unjustified Optional Capability Seams

> Status: Accepted
> Date: 2026-08-14
> Scope: Search Index, synchronization, Command Registry, telemetry and diagnostics

## Context

CORE-101 through CORE-106 established the stable kernel, instance lifecycle,
Composition Root, annotation-type extension contract, controlled custom type,
and existing Port providers. The next architecture gate asks whether Search
Index, synchronization, commands, or telemetry need dedicated public Capability
contracts before the React and Vue migrations.

Adding an interface because a feature might exist later would freeze names,
lifecycle, error, cancellation, security, and compatibility semantics without a
consumer able to prove them. Not adding an interface must also be deliberate:
framework adapters cannot be left with engine behavior that Core cannot express.

The audit reviewed these current framework paths:

- React `src/hooks/usePdfSearch.ts` and `src/components/search_sidebar.tsx`;
- Vue `src/composables/usePdfSearch.ts` and `src/components/SearchSidebar.vue`;
- React `src/core_adapter/core_annotation_bridge.tsx`;
- React/Vue annotator props, callbacks, stores, toolbars, and export/print hooks;
- both source trees for remote index, synchronization transport, telemetry SDK,
  analytics, custom command registration, WebSocket, EventSource, and
  BroadcastChannel use.

## Decision

InkLayer V1 adds no new optional Capability seam under CORE-107. This is an
accepted deferral, not a decision that these integrations can never exist.

### Search Index Provider

Deferred. Current React and Vue search UI requires a query, case and whole-word
options, deterministic page-ordered results, snippets, active-result navigation,
and highlights. `PdfViewerEngine.search()`, `setSearchHighlights()`,
`clearSearchHighlights()`, and navigation already provide the Core-owned
semantic path without PDF.js private state.

The audit found one stable-kernel parity gap rather than an extension seam:
React and Vue default to diacritic-insensitive matching. CORE-107 therefore adds
`PdfSearchOptions.matchDiacritics`, defaulting to `false`, with canonical Unicode
normalization tests. This behavior remains identical regardless of installed
Capabilities.

Text extraction, normalization, matching, ordering, limits, and result identity
remain Core behavior. A future remote or accelerated provider is justified only
by an actual large-document, offline-index, OCR-index, or server-index product
requirement. Its results must be normalized and validated by Core against the
same public result contract.

### Synchronization Capability

Deferred. Current framework inputs and callbacks express initial/controlled
annotation values, save actions, and mutation notifications. The canonical
`AnnotationRepository` already owns transactions and detached mutation events;
CORE-106 permits a persistence-aware Repository provider.

A specialized synchronization seam requires a real transport and an explicit
protocol for document identity, operation identity, ordering, acknowledgement,
retry, reconnection, echo suppression, remote authorization failure, and
conflict handling. Until those requirements exist, a generic `send/receive`
interface would merely move undefined policy into adapters. Synchronization may
later wrap canonical Repository commands and events but may never mutate Konva
or repository internals.

### Command Registry

Deferred. Current toolbar, sidebar, keyboard, contextual-menu, and imperative
actions map to existing Viewer, Annotation, Page Flow, print, download, import,
and export operations. React's custom `actions` slot is presentation and product
composition, not evidence for a Core command registry.

A registry becomes justified when an application must discover third-party
commands dynamically, render contributed command metadata, resolve duplicate
IDs, query availability, or execute cancellable custom actions without knowing
the contributing Capability. Known Core operations remain explicit typed engine
methods and continue to enforce permissions in Core.

### Telemetry and Diagnostics

Deferred. Current applications expose callbacks and can subscribe to typed
Viewer, Annotation, and Repository events. No React or Vue telemetry transport
or analytics SDK is present. Logger already covers recoverable diagnostics.

A future telemetry Capability requires a concrete sink and a separate bounded,
redacted event schema. It must be opt-in and must exclude passwords, PDF bytes,
authorization headers, signature/stamp image content, selected document text,
FreeText/comment bodies, and other private payloads by construction. Passing raw
engine events to a nominal telemetry provider is explicitly not accepted.

## Boundary consequences

- Basic PDF search semantics remain Core-owned and non-replaceable.
- Canonical Repository transactions and permission checks remain Core-owned.
- Document loading, navigation, layout, zoom, print/export validation, and
  annotation commands remain explicit Core behavior.
- Framework adapters may compose UI and subscribe to public events, but must not
  reproduce search algorithms, mutate repository internals, or depend on PDF.js
  private find-controller state after migration.
- Generic Capability `onReady()` is not presented as a security-safe telemetry
  API or a complete synchronization protocol.
- No placeholder service key, no no-op provider, and no unused public type is
  added for the four deferred areas.

## Re-evaluation gate

Any proposal to reopen one of these seams must include:

1. a named React, Vue, or product consumer and an executable use case;
2. behavior that existing public Core methods, events, and Port providers cannot
   express without duplicating engine logic;
3. lifecycle, cancellation, ownership, conflict, and structured-error semantics;
4. privacy and sensitive-data boundaries;
5. contract, integration, teardown, package-consumer, and framework-adapter tests.

If those conditions are met, the new contract receives its own ADR and public
API review. It is not added opportunistically during adapter migration.

## Verification evidence

- Viewer document-feature tests cover canonical search ordering, case,
  diacritic and whole-word matching, limits, cancellation, and structured failure.
- Viewer/TextLayer and browser suites cover search highlight projection and
  cleanup without requiring a Search Index provider.
- Repository unit and Annotation integration tests cover canonical mutations,
  selection, subscriptions, permission-checked commands, and destruction.
- Composition Root tests prove ordered `onReady()` observation, service
  isolation, rollback, and reverse teardown for ordinary Capabilities.
- React and Vue source audits found no remote index, synchronization transport,
  custom command registry, or telemetry sink requiring an additional V1 seam.

## Rejected alternative

### Add four generic interfaces now

Rejected because the interfaces would have no production consumer and could not
define truthful semantics for search equivalence, synchronization conflicts,
command discovery, or telemetry redaction. This would increase the V1 public
surface while weakening the stable-kernel boundary.
