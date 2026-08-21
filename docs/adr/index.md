# Architecture Decision Records

Architecture Decision Records capture decisions that constrain InkLayer Core
implementation. An accepted ADR is normative for its stated scope. Reversing an
accepted decision requires a later ADR; implementation changes must not silently
rewrite an earlier record.

## Status vocabulary

- **Proposed** — under review and not yet an implementation contract.
- **Accepted** — approved and binding for implementation.
- **Superseded** — replaced by a named later ADR.
- **Rejected** — considered but not adopted.

## Index

- [ADR 0001](./0001-stable-kernel-capability-boundary.md) — stable domain kernel and Capability boundary.
- [ADR 0002](./0002-instance-lifecycle-composition-root.md) — instance lifecycle and Composition Root.
- [ADR 0003](./0003-annotation-type-identity-and-unknown-data.md) — annotation type identity and unknown-data preservation.
- [ADR 0004](./0004-controlled-rendering-and-konva-boundary.md) — controlled rendering and Konva boundary.
- [ADR 0005](./0005-optional-capability-seams.md) — defer optional Capability seams until a concrete consumer defines their semantics.

The governing public contracts are [the architecture overview](../architecture.md)
and [the Core responsibility boundary](../core-boundary.md).
