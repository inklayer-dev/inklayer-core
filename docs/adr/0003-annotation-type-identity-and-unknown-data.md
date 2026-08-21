# ADR 0003: Annotation Type Identity and Unknown-Data Preservation

> Status: Accepted
> Date: 2026-08-14
> Scope: built-in and custom type identity, persisted type data, missing definitions, and registration

## Context

The current V1 model uses a closed union of built-in type strings. Extensible
annotation types require persisted identity and type-owned data, but missing
plugins must not make a document invalid or cause annotations to disappear.

Using arbitrary unqualified strings risks collisions. Storing executable or
class-based plugin data risks unsafe parsing and non-deterministic transport.
Treating the current unpublished model as immutable would force a premature V2
before V1 is released.

## Decision

### Built-in identities

Current built-in type IDs remain canonical and reserved. Built-in definitions
use the same Annotation Type Registry internally but external code may not
replace, shadow, unregister, or redefine them.

### Custom identities

Custom types use:

```text
custom:<namespace>/<name>
```

Namespace and name are bounded lowercase ASCII identifiers. The persisted ID is
stable and independent of package name, UI label, localization, or load order.

### Type-owned persisted data

Annotation schema V1 is completed with optional `typeData`:

```ts
interface AnnotationTypeData {
  schemaVersion: number
  payload: JsonValue
}
```

The common Annotation envelope remains Core-owned. `typeData` is definition-owned
semantic data and is distinct from generic application `extensions`.

The payload accepts lossless JSON only. Core rejects executable values, DOM
objects, class instances, cycles, non-finite numbers, undefined values, hidden or
prototype keys, and oversized structures.

`AnnotationTypeDefinition.apiVersion` versions the public Definition protocol.
`typeData.schemaVersion` independently versions the custom persisted payload. A
data codec declares which payload versions it accepts.

This is completion of unpublished Annotation V1, not a V2 migration.

### Missing definitions

Envelope validation is always available. Definition validation occurs only when
a compatible definition is registered.

When a custom definition is absent or does not support the payload schema, Core:

- preserves the entire detached annotation;
- retains it in Repository operations and events;
- preserves type data, renderer state, and extensions within safety bounds;
- does not construct unknown Konva nodes;
- presents a safe unsupported placeholder using common bounds/metadata;
- permits generic permission-governed delete, comment, and transport operations;
- rejects type-specific creation/edit/render commands with
  `ANNOTATION_TYPE_UNAVAILABLE`;
- restores behavior when a compatible definition becomes available.

Core never deletes, coerces, or silently omits the annotation.

### Registry rules

The registry is instance-owned. It validates definitions before publication,
rejects duplicate or reserved IDs, accepts only supported Definition API
versions, and returns an idempotent disposer. Removing a custom definition
removes behavior and transient resources, not persisted annotations.

Runtime custom-definition removal may be deferred for the first implementation;
cleanup during instance destruction is mandatory.

## Consequences

### Positive

- domain-specific annotation types can persist safely;
- documents survive temporarily missing plugins;
- package/load order cannot change identity;
- collaboration and storage may transport unknown types losslessly;
- built-in semantics remain canonical.

### Costs

- the parser needs separate envelope and definition validation;
- UIs and exporters need explicit unsupported-type states;
- plugin authors must version and validate payloads;
- custom data cannot contain convenient runtime objects.

## Rejected alternatives

### Store custom data only in generic `extensions`

Rejected because ownership and schema version would be ambiguous and type
behavior would depend on undocumented keys.

### Reject a document when a plugin is missing

Rejected because availability of optional code must not determine whether
persisted user data is valid or recoverable.

### Rasterize and replace unknown annotations on load

Rejected because it destroys editable semantic data and can silently reduce
fidelity.

### Call the change Annotation Schema V2

Rejected because no public V1 package has been released; the work is completing
the intended first contract.

## Verification

- parser tests cover valid/invalid custom IDs and bounded lossless JSON;
- round-trip tests load, store, clone, serialize, and reload an unknown type;
- repository tests preserve unknown annotations and detached values;
- browser tests render a safe placeholder without evaluating renderer state;
- registration tests restore rendering when a compatible definition appears;
- export tests report unsupported annotations instead of silently dropping them.
