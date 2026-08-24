/**
 * @file Product UI state projection for the Vanilla showcase.
 * @description Owns DOM-only presentation state and never imports PDF.js or Konva.
 */

import type { Annotation, AnnotationTool } from '@inklayer-dev/core'

/** Small view boundary used by the Core session composition root. */
export class WorkspaceView {
  /** Creates a DOM-only projection for one workspace host. */
  public constructor(private readonly host: HTMLElement) {}

  /** Switches one sidebar tab while preserving accessible selected state. */
  public activatePanel(region: 'side' | 'right', name: string): void {
    for (const button of this.host.querySelectorAll<HTMLButtonElement>(`[data-${region}-tab]`)) {
      button.setAttribute('aria-selected', String(button.dataset[`${region}Tab`] === name))
    }
    for (const panel of this.host.querySelectorAll<HTMLElement>(`[data-${region}-panel]`)) {
      const active = panel.dataset[`${region}Panel`] === name
      panel.hidden = !active
      panel.classList.toggle('active', active)
    }
  }

  /** Opens a responsive navigation or inspector drawer. */
  public openMobilePanel(region: 'left' | 'right'): void {
    this.closeMobilePanels()
    this.host.classList.add(`${region}-panel-open`)
    this.require<HTMLElement>('.mobile-scrim').hidden = false
  }

  /** Closes every responsive drawer. */
  public closeMobilePanels(): void {
    this.host.classList.remove('left-panel-open', 'right-panel-open')
    this.require<HTMLElement>('.mobile-scrim').hidden = true
  }

  /** Mirrors the active Core tool into every product-owned tool control. */
  public syncToolButtons(activeTool: AnnotationTool): void {
    for (const button of this.host.querySelectorAll<HTMLButtonElement>('[data-tool], [data-tool-shortcut]')) {
      const selected = (button.dataset['tool'] ?? button.dataset['toolShortcut']) === activeTool
      button.classList.toggle('active', selected)
      button.setAttribute('aria-pressed', String(selected))
    }
  }

  /** Adds one compact sanitized Core activity item for the developer lab. */
  public pushEvent(message: string): void {
    const list = this.require<HTMLOListElement>('.event-list')
    const item = this.host.ownerDocument.createElement('li')
    const time = this.host.ownerDocument.createElement('time')
    time.textContent = new Date().toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
    const label = this.host.ownerDocument.createElement('span')
    label.textContent = message
    item.append(time, label)
    list.prepend(item)
    while (list.children.length > 10) list.lastElementChild?.remove()
  }

  /** Renders the canonical repository as a navigable product review list. */
  public renderAnnotationList(
    annotations: readonly Annotation[],
    selectedId: string | undefined,
    onSelect: (annotation: Annotation) => void
  ): void {
    const list = this.require<HTMLElement>('.annotation-list')
    list.replaceChildren()
    if (annotations.length === 0) {
      const empty = this.host.ownerDocument.createElement('p')
      empty.className = 'empty-message'
      empty.textContent = 'No annotations yet. Select text or choose a tool.'
      list.append(empty)
    }
    for (const annotation of annotations) {
      const button = this.host.ownerDocument.createElement('button')
      button.type = 'button'
      button.className = 'annotation-row'
      button.classList.toggle('active', annotation.id === selectedId)
      const swatch = this.host.ownerDocument.createElement('span')
      swatch.className = 'annotation-swatch'
      swatch.style.setProperty('--annotation-color', annotation.appearance.stroke?.color
        ?? annotation.appearance.fill?.color ?? annotation.appearance.text?.color ?? '#94a3b8')
      const copy = this.host.ownerDocument.createElement('span')
      copy.className = 'annotation-copy'
      const title = this.host.ownerDocument.createElement('strong')
      title.textContent = annotation.type
      const meta = this.host.ownerDocument.createElement('small')
      meta.textContent = `Page ${annotation.pageIndex + 1} · ${annotation.comments.length} comments`
      copy.append(title, meta)
      const arrow = this.host.ownerDocument.createElement('span')
      arrow.ariaHidden = 'true'
      arrow.textContent = '›'
      button.append(swatch, copy, arrow)
      button.addEventListener('click', () => onSelect(annotation))
      list.append(button)
    }
    this.require<HTMLElement>('.status-annotations').textContent = `${annotations.length} annotations`
  }

  /** Marks the current thumbnail for keyboard and visual navigation. */
  public updateActiveThumbnail(pageIndex: number): void {
    for (const button of this.host.querySelectorAll<HTMLButtonElement>('.thumbnail-button')) {
      const selected = Number(button.dataset['pageIndex']) === pageIndex
      button.classList.toggle('active', selected)
      button.setAttribute('aria-current', selected ? 'page' : 'false')
    }
  }

  /** Synchronizes layout buttons and the persistent status rail. */
  public updateLayoutControls(continuous: boolean): void {
    const single = this.require<HTMLButtonElement>('.single')
    const flow = this.require<HTMLButtonElement>('.continuous')
    single.classList.toggle('active', !continuous)
    flow.classList.toggle('active', continuous)
    single.setAttribute('aria-pressed', String(!continuous))
    flow.setAttribute('aria-pressed', String(continuous))
    this.require<HTMLElement>('.status-layout').textContent = continuous
      ? 'Continuous scroll' : 'Single page'
  }

  /** Updates product-owned file labels without changing the loaded source. */
  public setDocumentName(name: string): void {
    const display = name.endsWith('.pdf') ? name : `${name}.pdf`
    this.require<HTMLElement>('.document-name').textContent = display
    this.host.ownerDocument.querySelector<HTMLElement>('.global-document-name')?.replaceChildren(display)
  }

  /** Requires one view-owned descendant. */
  private require<T extends Element>(selector: string): T {
    const element = this.host.querySelector<T>(selector)
    if (element === null) throw new Error(`Required workspace view element is missing: ${selector}`)
    return element
  }
}
