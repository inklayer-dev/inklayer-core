/**
 * @file Product-owned annotation tool catalogue for the Vanilla showcase.
 * @description Keeps labels, groups, and icons out of the Core domain API.
 */

import type { AnnotationTool } from '@inklayer-dev/core'

export interface DemoToolDefinition {
  /** Core tool identifier activated by the product control. */
  tool: AnnotationTool
  /** Human-readable name shown in the tool palette. */
  label: string
  /** Product-owned palette section. */
  group: 'Navigate' | 'Markup' | 'Draw' | 'Shapes' | 'Content'
  /** Inline SVG markup used by the framework-free demo. */
  icon: string
}

const icon = (paths: string): string => `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    ${paths}
  </svg>`

const lineIcon = (paths: string): string => icon(
  `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`
)

export const DEMO_TOOLS: readonly DemoToolDefinition[] = [
  { tool: 'select', label: 'Select', group: 'Navigate', icon: lineIcon('<path d="M5 3l12 8-6 1.5L8 18z"/>') },
  { tool: 'text-select', label: 'Select text', group: 'Navigate', icon: lineIcon('<path d="M7 4H5v16h2M17 4h2v16h-2M9 7h6M12 7v10"/>') },
  { tool: 'highlight', label: 'Highlight', group: 'Markup', icon: lineIcon('<path d="M7 17l8-8 3 3-8 8H7zM13 7l2-2 3 3-2 2M5 20h14"/>') },
  { tool: 'underline', label: 'Underline', group: 'Markup', icon: lineIcon('<path d="M7 4v7a5 5 0 0010 0V4M5 21h14"/>') },
  { tool: 'strikeout', label: 'Strikeout', group: 'Markup', icon: lineIcon('<path d="M17 6.5C16.1 5 14.4 4 12 4c-3 0-5 1.5-5 3.6 0 1.6 1.1 2.5 3.2 3.1M4 12h16M7 17.5c1 1.6 2.7 2.5 5.2 2.5 3 0 4.8-1.4 4.8-3.5 0-1.7-1.2-2.7-3.6-3.4"/>') },
  { tool: 'freehand', label: 'Freehand', group: 'Draw', icon: lineIcon('<path d="M4 18c3-7 5-9 7-9 2 0 0 6 2 6 1.5 0 2-5 4-5 1.5 0 .5 5 3 7"/>') },
  { tool: 'free-highlight', label: 'Free highlight', group: 'Draw', icon: lineIcon('<path d="M5 17l9-9 3 3-9 9H5zM13 6l2-2 3 3-2 2"/><path d="M4 20h16" stroke-width="3.4" opacity=".45"/>') },
  { tool: 'line', label: 'Line', group: 'Draw', icon: lineIcon('<path d="M5 19L19 5"/>') },
  { tool: 'arrow', label: 'Arrow', group: 'Draw', icon: lineIcon('<path d="M5 19L19 5M12 5h7v7"/>') },
  { tool: 'rectangle', label: 'Rectangle', group: 'Shapes', icon: lineIcon('<rect x="4" y="5" width="16" height="14" rx="1"/>') },
  { tool: 'circle', label: 'Ellipse', group: 'Shapes', icon: lineIcon('<ellipse cx="12" cy="12" rx="8" ry="7"/>') },
  { tool: 'polygon', label: 'Polygon', group: 'Shapes', icon: lineIcon('<path d="M12 3l8 6-3 10H7L4 9z"/>') },
  { tool: 'polyline', label: 'Polyline', group: 'Shapes', icon: lineIcon('<path d="M3 17l5-9 5 6 4-9 4 12"/>') },
  { tool: 'cloud', label: 'Cloud', group: 'Shapes', icon: lineIcon('<path d="M7 18a4 4 0 01-1-7.9A6 6 0 0117.5 9 4.5 4.5 0 0117 18z"/>') },
  { tool: 'note', label: 'Note', group: 'Content', icon: lineIcon('<path d="M5 5h14v11H9l-4 4z"/>') },
  { tool: 'free-text', label: 'Free text', group: 'Content', icon: lineIcon('<path d="M5 5h14M12 5v14M8 19h8"/>') },
  { tool: 'signature', label: 'Signature', group: 'Content', icon: lineIcon('<path d="M3 17c3-7 4-9 6-9 2 0-1 7 1 7 1.5 0 2-5 4-5 1.5 0 .5 5 3 5 1 0 1.5-1 4-1M4 20h16"/>') },
  { tool: 'stamp', label: 'Stamp', group: 'Content', icon: lineIcon('<path d="M8 14h8M7 18h10M9 14v-2c0-1-1-2-1-4a4 4 0 118 0c0 2-1 3-1 4v2M5 18v3h14v-3"/>') }
]

/** Resolves the product icon for a Core annotation tool. */
export function toolIcon(tool: AnnotationTool): string {
  return DEMO_TOOLS.find((definition) => definition.tool === tool)?.icon ?? ''
}
