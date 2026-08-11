/**
 * @file Konva snapshot safety defaults.
 * @description Centralizes the node vocabulary and resource limits accepted by
 * both annotation rendering and export.
 */

/** Konva node classes emitted by verified InkLayer tools and native decoders. */
export const ALLOWED_KONVA_CLASS_NAMES = new Set([
  'Group', 'Rect', 'Circle', 'Ellipse', 'Line', 'Arrow', 'Path', 'Text', 'Image'
])

/** Default maximum serialized snapshot length in UTF-16 code units. */
export const DEFAULT_MAX_SNAPSHOT_LENGTH = 10_000_000

/** Default maximum nested node depth. */
export const DEFAULT_MAX_SNAPSHOT_DEPTH = 32

/** Default maximum node count in one annotation group. */
export const DEFAULT_MAX_SNAPSHOT_NODES = 10_000

/** Default maximum coordinate count in an attrs points array. */
export const DEFAULT_MAX_POINTS = 100_000

/** Default maximum image or data URL length. */
export const DEFAULT_MAX_DATA_URL_LENGTH = 7_000_000
