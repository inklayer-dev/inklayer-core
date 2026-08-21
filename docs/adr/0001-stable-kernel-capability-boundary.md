# ADR 0001: Stable Domain Kernel and Capability Boundary

> Status: Accepted
> Date: 2026-08-14
> Scope: Core domain invariants, fixed engine implementations, replaceable environment capabilities

## Context

InkLayer Core currently exposes framework-independent Viewer and Annotation
engines and already injects several environment dependencies through Ports. The
next refactor must make those dependencies consistently composable without
turning canonical PDF and annotation semantics into replaceable policy.

An unrestricted “everything is a plugin” model would allow two integrations to
disagree about coordinates, persisted annotation meaning, permissions, hit
testing, or export output. Keeping every dependency fixed would instead force
React, Vue, Vanilla, tests, and future products to duplicate environment wiring
and optional features.

## Decision

InkLayer V1 adopts a **stable domain kernel + fixed engine layer + replaceable
Capability layer**.

The stable kernel owns and does not allow plugins to replace:

- Annotation schema and validation;
- document annotation identity and zero-based page identity;
- coordinate spaces and PDF/Stage transformations;
- bounds, point, rotation, and text-selection semantics;
- Appearance normalization and validation;
- comments, users, permissions, references, and numbering;
- Repository transaction and detached-event semantics;
- structured errors, cancellation, and instance isolation;
- import/export coordinate fidelity and print-permission enforcement;
- unknown custom annotation preservation.

PDF.js remains the fixed PDF implementation and Konva remains the fixed live
annotation renderer for V1. Neither is introduced as a replaceable Provider.

Capabilities may replace or contribute environment and optional product
services, including:

- Logger, Clock, ID Generator, Text Input, Print, Download, Fetch, and thumbnail
  surfaces;
- Annotation Repository and future persistence adapters;
- commands, diagnostics, telemetry, search indexing, and synchronization;
- custom Annotation Type Definitions through the dedicated type registry.

Every Capability is instance-scoped and reversible. It operates through public
Core contracts and may not receive renderer internals.

## Boundary test

A behavior belongs in the stable kernel when allowing two implementations could
change any of the following:

- interpretation of a PDF or annotation;
- persisted or collaborative data;
- page coordinates or geometry;
- direct manipulation semantics;
- permission outcomes;
- deterministic print or export output;
- resource ownership guarantees.

A behavior belongs in a Capability when it supplies an environment operation,
external system, optional observer, or product integration while preserving the
same canonical Core outcome.

Framework adapters own presentation, layout, localization, and business
workflow. A visible operation may still belong to Core when it directly
manipulates document state.

## Consequences

### Positive

- React and Vue share one behavioral implementation.
- Environment integrations can be replaced per instance.
- Canonical data and exports do not depend on plugin selection.
- PDF.js and Konva abstractions are introduced only where they provide real
  value.
- Optional features can be added without changing the stable kernel.

### Costs

- Capability authors must use explicit Core seams rather than renderer objects.
- Core must maintain clear service keys, conflict behavior, and lifecycle tests.
- Some future renderer experiments require a separate architectural decision
  rather than an ordinary plugin.

## Rejected alternatives

### Make PDF.js and Konva Providers

Rejected because there is no current replacement requirement, and a useful
abstraction would have to reproduce large private APIs while weakening
performance and behavior guarantees.

### Allow plugins to override built-in semantics

Rejected because persisted type names and cross-framework behavior would no
longer be canonical.

### Keep only constructor option injection

Rejected because independently created engines would still lack one composition
lifetime, optional features would duplicate wiring, and teardown ownership would
remain fragmented.

## Verification

- dependency checks continue to prevent framework imports and forbidden edges;
- Capability tests prove instance isolation and conflict behavior;
- contract tests prove invariant behavior is unchanged under alternate Ports;
- package tests prove Core contracts do not expose PDF.js/Konva internals through
  ordinary extension entries.
