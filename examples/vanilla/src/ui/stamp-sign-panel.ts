/**
 * @file Application-owned Stamp & Sign controls for the Vanilla demo.
 * @description Composes existing image annotations into manual and multi-page product workflows.
 */

import type { Annotation, AnnotationEngine } from '@inklayer-dev/core'
import {
  parseStampSignPages,
  resolveStampSignBounds,
  type StampSignAssetType,
  type StampSignPageSize,
  type StampSignPosition
} from '../stamp-sign-workflow'

export interface StampSignPanelOptions {
  /** Static product panel receiving controls and asset previews. */
  readonly root: HTMLElement
  /** Core engine that owns prepared assets and canonical annotations. */
  readonly annotations: AnnotationEngine
  /** Returns the current ready document page count. */
  readonly getPageCount: () => number
  /** Returns the currently visible zero-based page index. */
  readonly getCurrentPageIndex: () => number
  /** Resolves one rotation-aware unscaled page size. */
  readonly getPageSize: (pageIndex: number) => Promise<StampSignPageSize>
  /** Navigates the Demo to one created annotation page. */
  readonly showPage: (pageIndex: number) => Promise<void>
  /** Projects a concise workflow outcome into the workspace status rail. */
  readonly onStatus: (message: string) => void
  /** Reports one asynchronous workflow failure through the Demo error boundary. */
  readonly onError: (cause: unknown) => void
}

/** Owns only Demo product controls; all persisted drawing behavior remains in Core. */
export class StampSignPanel {
  private readonly root: HTMLElement
  private readonly annotations: AnnotationEngine
  private readonly options: StampSignPanelOptions
  private readonly opacity: HTMLInputElement
  private readonly width: HTMLInputElement
  private readonly range: HTMLInputElement
  private readonly position: HTMLSelectElement
  private readonly batchButton: HTMLButtonElement
  private assetType: StampSignAssetType = 'stamp'

  /** Binds one panel to the independently owned Core Annotation Engine. */
  public constructor(options: StampSignPanelOptions) {
    this.options = options
    this.root = options.root
    this.annotations = options.annotations
    this.opacity = requireElement(this.root, '.stamp-sign-opacity')
    this.width = requireElement(this.root, '.stamp-sign-width')
    this.range = requireElement(this.root, '.stamp-sign-pages')
    this.position = requireElement(this.root, '.stamp-sign-position')
    this.batchButton = requireElement(this.root, '.stamp-sign-batch')
    this.renderAssets()
    this.bind()
    this.syncOutputs()
    this.syncAssetButtons()
  }

  /** Mirrors a selected placed mark into product controls without duplicating annotation state. */
  public syncSelection(annotation: Annotation | undefined): void {
    if (annotation?.type !== 'stamp' && annotation?.type !== 'signature') return
    this.assetType = annotation.type
    this.opacity.value = String(annotation.appearance.opacity)
    this.syncOutputs()
    this.syncAssetButtons()
  }

  /** Begins one-shot pointer placement with the selected default image and opacity. */
  private prepareManualPlacement(): void {
    this.annotations.setSelection({ ids: [] })
    this.annotations.setToolAppearance(this.assetType, { opacity: this.readOpacity() })
    this.annotations.setTool(this.assetType)
    this.options.onStatus(`Click the PDF to place the ${this.assetType}.`)
  }

  /** Creates one proportional image annotation on every selected page with rollback on failure. */
  private async applyBatch(): Promise<void> {
    const pageCount = this.options.getPageCount()
    const pages = parseStampSignPages(
      this.range.value,
      pageCount,
      this.options.getCurrentPageIndex()
    )
    const asset = this.requireAsset(this.assetType)
    const opacity = this.readOpacity()
    const requestedWidth = Number.parseFloat(this.width.value)
    const position = this.position.value as StampSignPosition
    const createdIds: string[] = []
    this.batchButton.disabled = true
    try {
      for (const pageIndex of pages) {
        const page = await this.options.getPageSize(pageIndex)
        const annotation = this.annotations.createAnnotation({
          type: this.assetType,
          pageIndex,
          bounds: resolveStampSignBounds(page, asset, requestedWidth, 24, position),
          content: this.assetType === 'stamp'
            ? { text: asset.text ?? 'Stamp', image: asset.image }
            : {
                text: asset.text ?? 'Signature',
                signature: { kind: 'image', image: asset.image }
              },
          appearance: { opacity },
          extensions: {
            stampSignDemo: { placement: 'batch', position, requestedWidth }
          }
        })
        createdIds.push(annotation.id)
      }
      const primaryId = createdIds[0]
      if (primaryId !== undefined) {
        this.annotations.setSelection({ ids: createdIds, primaryId })
        await this.options.showPage(pages[0] ?? 0)
      }
      this.options.onStatus(
        `Placed ${createdIds.length} ${this.assetType}${createdIds.length === 1 ? '' : 's'} across ${pages.length} page${pages.length === 1 ? '' : 's'}.`
      )
    } catch (cause) {
      for (const id of createdIds.reverse()) this.annotations.deleteAnnotation(id)
      throw cause
    } finally {
      this.batchButton.disabled = false
    }
  }

  /** Applies opacity to a selected mark or to the next creation of the chosen asset. */
  private applyOpacity(): void {
    const selected = this.selectedImageAnnotation()
    const opacity = this.readOpacity()
    if (selected === undefined) {
      this.annotations.setToolAppearance(this.assetType, { opacity })
      this.options.onStatus(`Next ${this.assetType} opacity: ${Math.round(opacity * 100)}%.`)
    } else {
      this.annotations.updateAppearance(selected.id, { opacity })
      this.options.onStatus(`Updated selected ${selected.type} opacity to ${Math.round(opacity * 100)}%.`)
    }
    this.syncOutputs()
  }

  /** Removes only the selected Stamp or Signature from the canonical repository. */
  private removeSelected(): void {
    const selected = this.selectedImageAnnotation()
    if (selected === undefined) {
      this.options.onStatus('Select a placed stamp or signature before removing it.')
      return
    }
    this.annotations.deleteAnnotation(selected.id)
    this.options.onStatus(`Removed selected ${selected.type}.`)
  }

  /** Connects the static panel markup to the existing Annotation Engine. */
  private bind(): void {
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-stamp-sign-type]')) {
      button.addEventListener('click', () => {
        const type = button.dataset['stampSignType']
        if (type !== 'stamp' && type !== 'signature') return
        this.assetType = type
        this.annotations.setSelection({ ids: [] })
        this.opacity.value = String(this.annotations.getToolAppearance(type).opacity)
        this.syncOutputs()
        this.syncAssetButtons()
        this.options.onStatus(`${type === 'stamp' ? 'Stamp' : 'Signature'} selected.`)
      })
    }
    requireElement<HTMLButtonElement>(this.root, '.stamp-sign-manual')
      .addEventListener('click', () => this.prepareManualPlacement())
    this.batchButton.addEventListener('click', () => {
      void this.applyBatch().catch(this.options.onError)
    })
    this.opacity.addEventListener('input', () => this.applyOpacity())
    this.width.addEventListener('input', () => this.syncOutputs())
    requireElement<HTMLButtonElement>(this.root, '.stamp-sign-remove')
      .addEventListener('click', () => this.removeSelected())
  }

  /** Displays the actual default image assets prepared through Core. */
  private renderAssets(): void {
    for (const type of ['stamp', 'signature'] as const) {
      const asset = this.requireAsset(type)
      const image = requireElement<HTMLImageElement>(this.root, `.stamp-sign-${type}-preview`)
      image.src = asset.image
      image.alt = type === 'stamp' ? 'Default Approved stamp' : 'Default Demo signature'
    }
  }

  /** Updates numeric output text without owning any persistent state. */
  private syncOutputs(): void {
    requireElement<HTMLOutputElement>(this.root, '.stamp-sign-opacity-value').value =
      `${Math.round(this.readOpacity() * 100)}%`
    requireElement<HTMLOutputElement>(this.root, '.stamp-sign-width-value').value =
      `${Math.round(Number.parseFloat(this.width.value))} pt`
  }

  /** Projects the chosen asset into accessible pressed states. */
  private syncAssetButtons(): void {
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-stamp-sign-type]')) {
      const active = button.dataset['stampSignType'] === this.assetType
      button.setAttribute('aria-pressed', String(active))
      button.classList.toggle('active', active)
    }
  }

  /** Returns a detached prepared image asset or fails with a product-facing message. */
  private requireAsset(type: StampSignAssetType) {
    const asset = this.annotations.getImageAsset(type)
    if (asset === null) throw new Error(`The default ${type} image is unavailable.`)
    return asset
  }

  /** Narrows the primary selection to the two image annotation kinds managed here. */
  private selectedImageAnnotation(): Annotation | undefined {
    const primaryId = this.annotations.repository.getSelection().primaryId
    const annotation = primaryId === undefined
      ? undefined
      : this.annotations.repository.getById(primaryId)
    return annotation?.type === 'stamp' || annotation?.type === 'signature'
      ? annotation
      : undefined
  }

  /** Parses the bounded opacity range controlled by the product input. */
  private readOpacity(): number {
    const value = Number.parseFloat(this.opacity.value)
    return Number.isFinite(value) ? Math.min(1, Math.max(0.05, value)) : 1
  }
}

/** Requires one static panel descendant and preserves the requested DOM type. */
function requireElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector)
  if (element === null) throw new Error(`Required Stamp & Sign element is missing: ${selector}`)
  return element
}
