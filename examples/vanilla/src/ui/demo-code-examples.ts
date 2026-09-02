/**
 * @file Source-backed code examples for the three primary Vanilla demos.
 * @description Keeps every displayed snippet type-checkable and links deeper guides separately.
 */

import annotationsSource from '../snippets/annotations.ts?raw'
import customAnnotationsSource from '../snippets/custom-annotations.ts?raw'
import highlighterExportSource from '../snippets/highlighter-export.ts?raw'
import highlighterSource from '../snippets/highlighter.ts?raw'
import redactionSource from '../snippets/redaction.ts?raw'
import stampSignBatchSource from '../snippets/stamp-sign-batch.ts?raw'
import stampSignSource from '../snippets/stamp-sign.ts?raw'
import viewerSource from '../snippets/viewer.ts?raw'
import watermarkSource from '../snippets/watermark.ts?raw'
import issueMarkerSource from '../annotation-plugins/issue-marker.ts?raw'
import measurementSource from '../annotation-plugins/measurement.ts?raw'
import reviewAreaSource from '../annotation-plugins/review-area.ts?raw'

export type DemoCodeView =
  | 'viewer'
  | 'annotations'
  | 'stamp-sign'
  | 'highlighter'
  | 'redaction'
  | 'watermark'
  | 'custom-annotations'

export interface DemoCodeVariant {
  /** Compact label used by the code-drawer source switcher. */
  readonly label: string
  /** Type-checked source displayed and copied for this variant. */
  readonly source: string
}

export interface DemoCodeExample {
  /** Short outcome-oriented heading shown in the code drawer. */
  readonly title: string
  /** One-sentence explanation of the capability demonstrated by the snippet. */
  readonly summary: string
  /** Minimal application-owned DOM expected by the snippet. */
  readonly requirement: string
  /** Type-checked TypeScript source copied and displayed verbatim. */
  readonly source: string
  /** Optional additional type-checked source files within the same capability. */
  readonly variants?: readonly DemoCodeVariant[]
  /** Canonical documentation URL for the next implementation step. */
  readonly guideUrl: string
  /** Complete Vanilla implementation source URL. */
  readonly sourceUrl: string
}

/** Removes repository-only file metadata while retaining the type-checked example body. */
function presentSource(source: string): string {
  return source.replace(/^\/\*\*[\s\S]*?\*\/\s*/u, '').trim()
}

/** Type-checked minimal examples indexed by the capability route that displays them. */
export const DEMO_CODE_EXAMPLES: Readonly<Record<DemoCodeView, DemoCodeExample>> = {
  viewer: {
    title: 'Minimal PDF Viewer',
    summary: 'Load a PDF into Core-owned continuous pages with selectable text and zoom.',
    requirement: 'Requires #pdf-workspace and a sized #pages container.',
    source: presentSource(viewerSource),
    guideUrl: 'https://core.inklayer.dev/guide/getting-started',
    sourceUrl: 'https://github.com/inklayer-dev/inklayer-core/tree/main/examples/vanilla/src'
  },
  annotations: {
    title: 'Your first annotation tool',
    summary: 'Connect an application-owned button to Core drawing and selection behavior.',
    requirement: 'Requires #pdf-workspace, #pages and a #rectangle button.',
    source: presentSource(annotationsSource),
    guideUrl: 'https://core.inklayer.dev/guide/first-annotation',
    sourceUrl: 'https://github.com/inklayer-dev/inklayer-core/tree/main/examples/vanilla/src'
  },
  'stamp-sign': {
    title: 'Stamp and sign a PDF',
    summary: 'Place a prepared image once or repeat it across a product-selected page range.',
    requirement: 'Requires #pdf-workspace, #pages, #approved-stamp and application controls.',
    source: presentSource(stampSignSource),
    variants: [
      { label: 'Manual placement', source: presentSource(stampSignSource) },
      { label: 'Batch pages', source: presentSource(stampSignBatchSource) }
    ],
    guideUrl: 'https://core.inklayer.dev/guide/stamp-and-sign',
    sourceUrl: 'https://github.com/inklayer-dev/inklayer-core/tree/main/examples/vanilla/src'
  },
  highlighter: {
    title: 'Prepared keyword highlighting',
    summary: 'Pass system terms or review patterns to one controller and scan immediately.',
    requirement: 'Requires #pdf-workspace and #pages; the rules may come from your API.',
    source: presentSource(highlighterSource),
    variants: [
      { label: 'Highlight keywords', source: presentSource(highlighterSource) },
      { label: 'Export PDF', source: presentSource(highlighterExportSource) }
    ],
    guideUrl: 'https://core.inklayer.dev/guide/first-keyword-highlight',
    sourceUrl: 'https://github.com/inklayer-dev/inklayer-core/tree/main/examples/vanilla/src'
  },
  redaction: {
    title: 'Secure keyword redaction',
    summary: 'Review keyword matches, then create a new image-only PDF with no extractable text.',
    requirement: 'Requires #pdf-workspace and #pages; review included matches before exporting.',
    source: presentSource(redactionSource),
    guideUrl: 'https://core.inklayer.dev/guide/first-keyword-redaction',
    sourceUrl: 'https://github.com/inklayer-dev/inklayer-core/tree/main/examples/vanilla/src'
  },
  watermark: {
    title: 'Apply a document watermark',
    summary: 'Use one policy for Continuous viewing, printing, and exported PDF output.',
    requirement: 'Requires #pdf-workspace and #pages; configure the policy before loading.',
    source: presentSource(watermarkSource),
    guideUrl: 'https://core.inklayer.dev/guide/output-and-security#configure-a-watermark',
    sourceUrl: 'https://github.com/inklayer-dev/inklayer-core/tree/main/examples/vanilla/src'
  },
  'custom-annotations': {
    title: 'Application-owned annotation types',
    summary: 'Register semantic drawing tools while Core owns gestures, persistence, print, and export.',
    requirement: 'Requires #pdf-workspace, #pages and application-owned Definition modules.',
    source: presentSource(customAnnotationsSource),
    variants: [
      { label: 'Register tools', source: presentSource(customAnnotationsSource) },
      { label: 'Measurement', source: presentSource(measurementSource) },
      { label: 'Review area', source: presentSource(reviewAreaSource) },
      { label: 'Issue marker', source: presentSource(issueMarkerSource) }
    ],
    guideUrl: 'https://core.inklayer.dev/guide/first-custom-annotation',
    sourceUrl: 'https://github.com/inklayer-dev/inklayer-core/tree/main/examples/vanilla/src/annotation-plugins'
  }
}
