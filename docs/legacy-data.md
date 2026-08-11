# Legacy Data Compatibility

Historical React/Vue payload handling is isolated under `src/compat/legacy`.
Legacy shapes are not accepted directly by Viewer, Annotation Engine, repository,
importers, or exporters.

## Verified mapping

- one-based `pageNumber` becomes zero-based `pageIndex`;
- `konvaClientRect` is labeled truthfully as `konva-stage`;
- `konvaString` is preserved byte-for-byte in versioned renderer state;
- verified legacy tool numbers map to canonical annotation types;
- legacy comments, author, dates, content, permissions-relevant ownership, and
  reference numbers are normalized;
- unknown fields survive under `extensions.legacyUnknown` and are restored by
  legacy serialization.

Serialization rejects `pdf-user-space` canonical values rather than silently
writing them as historical Stage coordinates. Types without a verified legacy
tool number fail with `ANNOTATION_TYPE_UNSUPPORTED`.

Compatibility claims are fixture-backed and intentionally limited: no private
production backend payload was available in the repository. Consumers should
retain backups and validate additional historical payload families before a bulk
migration.
