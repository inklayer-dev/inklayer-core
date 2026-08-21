# ADR 0002: Instance Lifecycle and Composition Root

> Status: Accepted
> Date: 2026-08-14
> Scope: resource ownership, Capability activation, engine composition, rollback, and teardown

## Context

Viewer, Annotation, Page Flow, print, and browser Ports currently expose their
own lifecycle methods. They are individually instance-safe, but applications
must create them in the correct order, pass dependencies repeatedly, and destroy
them in the correct order. Optional features lack one owner for listeners,
observers, asynchronous work, and cleanup.

Capabilities also have two timing needs: providers such as Repository and Text
Input must exist before engines are created, while commands and observers often
need ready engine facades.

## Decision

Core introduces an instance-owned Lifecycle Scope and a Composition Root.

### Lifecycle Scope

The Scope:

- owns an `AbortSignal`;
- accepts labelled synchronous or asynchronous disposers;
- supports child scopes;
- rejects registration after disposal begins;
- is idempotent under repeated and concurrent disposal;
- aborts before teardown;
- runs disposers in reverse registration order;
- continues cleanup after individual failures;
- waits for cleanup to reach quiescence;
- reports collected failures as a structured Core error;
- rolls back partial asynchronous setup.

Borrowed resources are never destroyed by the borrower. Owned subscriptions to a
borrowed resource are still disposed by the owning Scope.

### Composition Root

One recommended `InkLayerInstance` owns:

- root Lifecycle Scope;
- Capability and Annotation Type registries;
- Viewer Engine;
- Annotation Engine;
- optional Page Flow;
- cross-engine wiring;
- deterministic final destruction.

Low-level Viewer, Annotation, and Page Flow factories remain public and usable
without the Composition Root.

### Capability phases

Capability setup has two explicit phases:

1. `setup(context)` runs before engine creation and may provide Ports, register
   annotation types, or schedule a ready effect;
2. `onReady(instance)` effects run after Viewer, Annotation, and optional Page
   Flow creation and may register commands or observers.

An `onReady` failure fails instance creation and rolls back the entire root.

### Initialization sequence

1. validate options;
2. create Scope and registries;
3. register protected built-in annotation definitions;
4. run Capability setup in configured order;
5. register configured custom annotation definitions;
6. resolve required Ports;
7. create Viewer and Annotation;
8. retain optional Page Flow configuration for document-scoped activation;
9. run ready effects in Capability order;
10. publish the instance.

Page Flow requires a ready Viewer document. The Composition Root creates it only
after a successful instance-level document load. Before replacing the document,
the Root disposes the previous document's Page Flow child scope. An idle Root
therefore exposes no live Page Flow even when Page Flow is configured.

### Destruction sequence

The root first rejects and aborts new work. Page Flow and ready effects are
disposed before Annotation and Viewer. Custom definitions and provider services
are released after their consumers. The concrete order is implemented through
reverse Scope disposal rather than duplicated manually by framework adapters.

## Consequences

### Positive

- one application operation creates and destroys a complete InkLayer instance;
- partial startup cannot leak Workers, Canvas nodes, listeners, or DOM;
- Capability providers and engine observers have unambiguous timing;
- React/Vue adapters no longer encode teardown order;
- nested temporary features can own child scopes.

### Costs

- engine construction must be reorganized around explicit ownership;
- asynchronous cleanup errors require aggregation and diagnostics;
- setup code cannot assume engine availability and must use `onReady`;
- lifecycle stress testing becomes a release requirement.

## Rejected alternatives

### Let framework components own all teardown

Rejected because React and Vue lifecycle timing differs and would duplicate Core
resource ordering.

### Expose engines during Capability setup

Rejected because environment providers are needed to create those engines,
causing circular and partially initialized state.

### Build a full dynamic dependency runtime

Rejected for V1 because automatic provider restart and hot dependency replacement
are unnecessary complexity. Explicit setup order and fail-loud service conflicts
are sufficient.

## Verification

- unit tests cover reverse order, abort timing, children, concurrency, rollback,
  and failure aggregation;
- integration tests inject a failure at every initialization boundary;
- repeated create/destroy browser tests show no retained page DOM, Konva stages,
  observers, Worker leases, listeners, timers, or object URLs;
- two simultaneous Composition Roots remain isolated;
- existing low-level factory tests remain green.
