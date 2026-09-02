/**
 * @file Browser-only functional probe for temporary TextLayer highlights.
 * @description Exercises the internal DOM projector without exposing a demo UI
 * or performing screenshot-based visual validation.
 */

import type { PDFDocumentProxy } from 'pdfjs-dist'
import { PdfTextLayerController } from '../../../src/viewer/text-layer'

interface ProbeMark {
  layer: string | undefined
  range: string | undefined
  state: string | undefined
  text: string | null
  color: string
  activeColor: string
  parentLayer: string | undefined
}

export interface TextHighlightLayerProbeResult {
  /** Initial ordered semantic marks. */
  initial: readonly ProbeMark[]
  /** Coexisting legacy search-mark text. */
  searchText: string | null
  /** Structured operation retained from one invalid replacement. */
  invalidOperation: string
  /** Marks retained after atomic validation failure. */
  afterInvalid: readonly ProbeMark[]
  /** Child count immediately after page detachment. */
  detachedChildCount: number
  /** Marks restored after page reattachment. */
  restored: readonly ProbeMark[]
  /** Marks retained after clearing one named layer. */
  selectivelyCleared: readonly ProbeMark[]
  /** Projected mark count for one retained invisible layer. */
  hiddenCount: number
  /** Projected layer mark count after clearing all layers. */
  clearedCount: number
  /** Legacy search-mark text after clearing caller layers. */
  searchAfterLayerClear: string | null
  /** Text projected after one PDF.js presentation line break. */
  afterLineBreakText: string | null
}

/** Runs deterministic semantic-DOM assertions consumed by Playwright. */
export async function runTextHighlightLayerProbe(): Promise<TextHighlightLayerProbeResult> {
  const text = 'alpha beta gamma'
  const createPage = (): object => ({
    getViewport: ({ scale }: { scale: number }) => ({
      width: 200 * scale,
      height: 100 * scale,
      scale,
      rotation: 0,
      rawDims: { pageWidth: 200, pageHeight: 100, pageX: 0, pageY: 0 }
    }),
    streamTextContent: () => new ReadableStream({
      /** Emits one deterministic PDF.js TextContent chunk. */
      start(controller) {
        controller.enqueue({
          items: [{
            str: text,
            dir: 'ltr',
            transform: [12, 0, 0, 12, 10, 80],
            width: 96,
            height: 12,
            fontName: 'fixture',
            hasEOL: false
          }],
          styles: {
            fixture: {
              fontFamily: 'sans-serif',
              ascent: 0.8,
              descent: -0.2,
              vertical: false
            }
          },
          lang: 'en'
        })
        controller.close()
      }
    })
  })
  const documentProxy = {
    numPages: 1,
    getPage: async () => createPage()
  }
  const controller = new PdfTextLayerController(
    documentProxy as unknown as PDFDocumentProxy,
    () => undefined
  )
  const host = document.createElement('div')
  document.body.append(host)
  const attach = async (): Promise<void> => {
    await controller.attach({ pageIndex: 0, container: host, scale: 1 })
  }
  const readMarks = (): ProbeMark[] => Array.from(host.querySelectorAll<HTMLElement>(
    'mark[data-inklayer-highlight-layer]'
  )).map((mark) => ({
    layer: mark.dataset['inklayerHighlightLayer'],
    range: mark.dataset['inklayerHighlightRange'],
    state: mark.dataset['inklayerHighlightState'],
    text: mark.textContent,
    color: mark.style.getPropertyValue('--inklayer-text-highlight-color'),
    activeColor: mark.style.getPropertyValue('--inklayer-text-highlight-active-color'),
    parentLayer: mark.parentElement?.dataset['inklayerHighlightLayer']
  }))

  const lineBreakHost = document.createElement('div')
  document.body.append(lineBreakHost)
  const lineBreakPage = {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 200 * scale,
      height: 100 * scale,
      scale,
      rotation: 0,
      rawDims: { pageWidth: 200, pageHeight: 100, pageX: 0, pageY: 0 }
    }),
    streamTextContent: () => new ReadableStream({
      /** Emits two PDF.js text items separated by one presentation line break. */
      start(stream) {
        stream.enqueue({
          items: [
            {
              str: 'first', dir: 'ltr', transform: [12, 0, 0, 12, 10, 80],
              width: 30, height: 12, fontName: 'fixture', hasEOL: true
            },
            {
              str: 'Search', dir: 'ltr', transform: [12, 0, 0, 12, 10, 60],
              width: 38, height: 12, fontName: 'fixture', hasEOL: false
            }
          ],
          styles: {
            fixture: {
              fontFamily: 'sans-serif', ascent: 0.8, descent: -0.2, vertical: false
            }
          },
          lang: 'en'
        })
        stream.close()
      }
    })
  }
  const lineBreakController = new PdfTextLayerController({
    numPages: 1,
    getPage: async () => lineBreakPage
  } as unknown as PDFDocumentProxy, () => undefined)
  await lineBreakController.attach({ pageIndex: 0, container: lineBreakHost, scale: 1 })
  lineBreakController.setTextHighlightLayers([{
    id: 'after-line-break',
    ranges: [{ pageIndex: 0, start: 6, length: 6 }],
    style: { color: '#f59e0b' }
  }])
  const afterLineBreakText = lineBreakHost.querySelector<HTMLElement>(
    'mark[data-inklayer-highlight-layer="after-line-break"]'
  )?.textContent ?? null
  lineBreakController.destroy()
  lineBreakHost.remove()

  await attach()
  controller.setSearchHighlights([{
    pageIndex: 0,
    matchIndex: 0,
    start: 6,
    length: 4,
    text: text.slice(6, 10),
    preview: text
  }], null)
  const layers = [
    {
      id: 'bottom',
      ranges: [{ pageIndex: 0, start: 0, length: 5 }],
      style: { color: '#ef4444' },
      activeRangeIndex: null
    },
    {
      id: 'top',
      ranges: [{ pageIndex: 0, start: 0, length: 5 }],
      style: { color: '#f59e0b', activeColor: '#d97706' },
      activeRangeIndex: 0
    }
  ]
  controller.setTextHighlightLayers(layers)
  const initial = readMarks()
  const searchText = host.querySelector<HTMLElement>(
    'mark[data-inklayer-search-match]'
  )?.textContent ?? null

  const bottom = layers[0]
  if (bottom === undefined || bottom.ranges[0] === undefined) {
    throw new Error('Temporary highlight probe fixture is incomplete.')
  }
  bottom.id = 'mutated'
  bottom.ranges[0] = { pageIndex: 0, start: 6, length: 4 }
  bottom.style.color = '#000000'
  let invalidOperation = ''
  try {
    controller.setTextHighlightLayers([
      { id: 'duplicate', ranges: [], style: { color: '#fff' } },
      { id: 'duplicate', ranges: [], style: { color: '#000' } }
    ])
  } catch (cause) {
    if (typeof cause === 'object' && cause !== null && 'operation' in cause) {
      invalidOperation = String(cause.operation)
    }
  }
  const afterInvalid = readMarks()

  controller.detach(0)
  const detachedChildCount = host.childNodes.length
  await attach()
  const restored = readMarks()

  controller.clearTextHighlightLayers(['top'])
  const selectivelyCleared = readMarks()
  controller.setTextHighlightLayers([{
    id: 'hidden',
    ranges: [{ pageIndex: 0, start: 6, length: 4 }],
    style: { color: '#3b82f6' },
    visible: false
  }])
  const hiddenCount = readMarks().length
  controller.clearTextHighlightLayers()
  const clearedCount = readMarks().length
  const searchAfterLayerClear = host.querySelector<HTMLElement>(
    'mark[data-inklayer-search-match]'
  )?.textContent ?? null
  controller.destroy()
  host.remove()

  return {
    initial,
    searchText,
    invalidOperation,
    afterInvalid,
    detachedChildCount,
    restored,
    selectivelyCleared,
    hiddenCount,
    clearedCount,
    searchAfterLayerClear,
    afterLineBreakText
  }
}
