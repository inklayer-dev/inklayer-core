/**
 * @file Framework-neutral page Canvas watermark rendering.
 * @description Validates one document presentation policy and composites it
 * after PDF.js rendering without persisting it as an annotation.
 */

import { InkLayerError } from '../domain/errors'
import { normalizeWatermarkSpec, type PdfWatermarkSpec } from '../domain/watermark'
import type { PdfCanvasWatermarkRequest } from './types'

/** Composites one configured watermark onto an already-rendered page Canvas. */
export function drawCanvasWatermark(
  spec: PdfWatermarkSpec | null,
  request: PdfCanvasWatermarkRequest,
  target: 'viewer' | 'print' = 'viewer'
): void {
  if (spec === null || !(spec.targets?.[target] ?? true)) return
  const canvas = request.canvas
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new InkLayerError('PDF_FEATURE_FAILED', 'Canvas watermark context is unavailable.', {
      operation: 'drawWatermark', pageIndex: request.pageIndex
    })
  }
  const pixelRatio = request.pixelRatio ?? 1
  const width = canvas.width / pixelRatio
  const height = canvas.height / pixelRatio
  context.save()
  context.scale(pixelRatio, pixelRatio)
  context.globalAlpha = spec.opacity ?? 0.12
  context.fillStyle = spec.color ?? '#334155'
  context.font = `${spec.fontSize ?? 18}px ${spec.fontFamily ?? 'system-ui, sans-serif'}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  const angle = ((spec.rotation ?? -30) * Math.PI) / 180
  if ((spec.layout ?? 'repeated') === 'center') {
    drawRotatedText(context, spec.text, width / 2, height / 2, angle)
  } else {
    const metrics = context.measureText(spec.text)
    const stepX = Math.max(metrics.width + (spec.horizontalGap ?? 120), 40)
    const stepY = Math.max((spec.fontSize ?? 18) + (spec.verticalGap ?? 90), 40)
    for (let y = -height; y <= height * 2; y += stepY) {
      for (let x = -width; x <= width * 2; x += stepX) {
        drawRotatedText(context, spec.text, x, y, angle)
      }
    }
  }
  context.restore()
}

/** Draws one text occurrence around its own center. */
function drawRotatedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  angle: number
): void {
  context.save()
  context.translate(x, y)
  context.rotate(angle)
  context.fillText(text, 0, 0)
  context.restore()
}

export { normalizeWatermarkSpec }
