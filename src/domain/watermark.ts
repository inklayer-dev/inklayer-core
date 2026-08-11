/**
 * @file Framework-neutral document watermark policy.
 * @description Defines and validates presentation semantics shared by Canvas
 * and PDF output backends without depending on either renderer.
 */

import { InkLayerError } from './errors'

/** Watermark policy shared by Viewer Canvas and print/export backends. */
export interface PdfWatermarkSpec {
  /** Resolved display text; Core does not read authentication state. */
  text: string
  /** Repeated document pattern or one centered occurrence. */
  layout?: 'repeated' | 'center'
  /** Text opacity from zero-exclusive to one. */
  opacity?: number
  /** Clockwise rotation in degrees. */
  rotation?: number
  /** Layout font size in CSS pixels. */
  fontSize?: number
  /** Browser Canvas font-family value. */
  fontFamily?: string
  /** Canvas-compatible watermark color. */
  color?: string
  /** Horizontal space between repeated occurrences. */
  horizontalGap?: number
  /** Vertical space between repeated occurrences. */
  verticalGap?: number
  /** Independent output targets using one immutable semantic policy. */
  targets?: {
    viewer?: boolean
    print?: boolean
    export?: boolean
    thumbnails?: boolean
  }
}

/** Returns a detached, validated watermark policy. */
export function normalizeWatermarkSpec(spec: PdfWatermarkSpec | null): PdfWatermarkSpec | null {
  if (spec === null) return null
  const text = spec.text.trim()
  const opacity = spec.opacity ?? 0.12
  const rotation = spec.rotation ?? -30
  const fontSize = spec.fontSize ?? 18
  const horizontalGap = spec.horizontalGap ?? 120
  const verticalGap = spec.verticalGap ?? 90
  if (text.length === 0 || text.length > 1_000 || !finiteBetween(opacity, 0.01, 1)
    || !finiteBetween(rotation, -360, 360) || !finiteBetween(fontSize, 6, 256)
    || !finiteBetween(horizontalGap, 0, 2_048) || !finiteBetween(verticalGap, 0, 2_048)) {
    throw new InkLayerError('PDF_FEATURE_FAILED', 'PDF watermark configuration is invalid.', {
      operation: 'setWatermark'
    })
  }
  return {
    text,
    layout: spec.layout ?? 'repeated',
    opacity,
    rotation,
    fontSize,
    fontFamily: spec.fontFamily?.trim() || 'system-ui, sans-serif',
    color: spec.color?.trim() || '#334155',
    horizontalGap,
    verticalGap,
    targets: {
      viewer: spec.targets?.viewer ?? true,
      print: spec.targets?.print ?? true,
      export: spec.targets?.export ?? false,
      thumbnails: spec.targets?.thumbnails ?? false
    }
  }
}

/** Returns whether one numeric option is finite and inside its closed range. */
function finiteBetween(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum
}
