/**
 * @file Product-owned Vanilla controls for the public Highlighter Controller.
 * @description Projects immutable workflow snapshots into editable rules,
 * review controls, navigation, preview management, and permanent application.
 */

import type {
  KeywordHighlighter,
  KeywordHighlighterSnapshot,
  KeywordRule
} from '@inklayer-dev/core/highlighter'

const DEFAULT_RULES: readonly KeywordRule[] = [
  {
    id: 'core-concepts', label: 'Core concepts',
    terms: ['Core', 'Viewer'], color: '#20d3a5'
  },
  {
    id: 'review-actions', label: 'Review actions',
    terms: ['Search', 'highlight'], color: '#f4b860'
  },
  {
    id: 'structured-values', label: 'Structured values', color: '#8b5cf6',
    patterns: [
      { id: 'iso-date', kind: 'regex', source: '\\b\\d{4}-\\d{2}-\\d{2}\\b', flags: 'iu' },
      {
        id: 'amount', kind: 'regex',
        source: '(?:RMB\\s*)\\d+(?:,\\d{3})*(?:\\.\\d{2})?', flags: 'iu'
      }
    ]
  }
]

/** Owns the Vanilla UI projection without taking ownership of the Controller. */
export class HighlighterPanel {
  private readonly rulesHost: HTMLDivElement
  private readonly resultsHost: HTMLDivElement
  private readonly status: HTMLOutputElement
  private readonly progress: HTMLProgressElement
  private readonly scanButton: HTMLButtonElement
  private readonly cancelButton: HTMLButtonElement
  private readonly applyButton: HTMLButtonElement | null
  private readonly unsubscribe: () => void
  private nextRuleId = 1
  private actionMessage = ''
  private actionError = false

  /** Creates editable rule controls and subscribes to immutable snapshots. */
  public constructor(
    private readonly host: HTMLElement,
    private readonly controller: KeywordHighlighter,
    private readonly onError: (cause: unknown) => void,
    options: { readonly mode?: 'highlight' | 'redaction' } = {}
  ) {
    const redaction = options.mode === 'redaction'
    host.innerHTML = `
      <div class="panel-heading highlighter-heading">
        <div><strong>${redaction ? 'Keyword Redaction' : 'Keyword Highlighter'}</strong><span>${redaction ? 'Scan → review → secure export' : 'Scan → preview → review → apply'}</span></div>
        <button class="mobile-panel-close" type="button" aria-label="Close keyword rules">×</button>
      </div>
      <form class="highlighter-form">
        <div class="highlighter-rules" aria-label="Keyword rules"></div>
        <button class="highlighter-add-rule" type="button">+ Add rule</button>
        <div class="highlighter-primary-actions">
          <button class="highlighter-scan primary-action" type="submit">Scan document</button>
          <button class="highlighter-cancel quiet-action" type="button" disabled>Cancel</button>
        </div>
      </form>
      <div class="highlighter-summary">
        <output class="highlighter-status" aria-live="polite">Ready to scan</output>
        <span class="highlighter-counts">0 included · 0 excluded</span>
        <progress class="highlighter-progress" max="100" value="0" hidden></progress>
      </div>
      <div class="highlighter-results" aria-live="polite"></div>
      <div class="highlighter-footer-actions">
        ${redaction ? '' : '<button class="highlighter-apply primary-action" type="button" disabled>Apply included</button>'}
        <button class="highlighter-clear-preview quiet-action" type="button">Clear preview</button>
        <button class="highlighter-reset quiet-action" type="button">Reset</button>
      </div>`
    this.rulesHost = this.require('.highlighter-rules')
    this.resultsHost = this.require('.highlighter-results')
    this.status = this.require('.highlighter-status')
    this.progress = this.require('.highlighter-progress')
    this.scanButton = this.require('.highlighter-scan')
    this.cancelButton = this.require('.highlighter-cancel')
    this.applyButton = host.querySelector('.highlighter-apply')
    for (const rule of DEFAULT_RULES) this.appendRule(rule)
    this.bindControls()
    this.unsubscribe = controller.subscribe((snapshot) => this.render(snapshot))
    this.render(controller.getSnapshot())
  }

  /** Releases the UI subscription while the owner destroys the Controller separately. */
  public destroy(): void {
    this.unsubscribe()
  }

  /** Scans the currently prepared rules so a showcase can reveal results immediately. */
  public async scanPreparedRules(): Promise<void> {
    await this.scan()
  }

  /** Connects product controls to the public workflow methods. */
  private bindControls(): void {
    this.require<HTMLFormElement>('.highlighter-form').addEventListener('submit', (event) => {
      event.preventDefault()
      void this.scan().catch(this.onError)
    })
    this.require<HTMLButtonElement>('.highlighter-add-rule').addEventListener('click', () => {
      this.appendRule({
        id: `custom-rule-${this.nextRuleId}`, label: `Custom ${this.nextRuleId}`,
        terms: ['keyword'], color: '#8b5cf6'
      })
      this.nextRuleId += 1
    })
    this.cancelButton.addEventListener('click', () => this.controller.cancelScan())
    this.applyButton?.addEventListener('click', () => {
      void this.apply().catch(this.onError)
    })
    this.require<HTMLButtonElement>('.highlighter-clear-preview').addEventListener('click', () => {
      this.controller.clearPreview()
      this.actionMessage = 'Temporary preview cleared; review choices are retained.'
      this.actionError = false
      this.render(this.controller.getSnapshot())
    })
    this.require<HTMLButtonElement>('.highlighter-reset').addEventListener('click', () => {
      this.controller.reset()
      this.actionMessage = 'Workflow reset; editable rules remain available for the next scan.'
      this.actionError = false
      this.render(this.controller.getSnapshot())
    })
  }

  /** Normalizes current product inputs through the Controller and scans once. */
  private async scan(): Promise<void> {
    this.actionMessage = ''
    this.actionError = false
    try {
      this.controller.setRules(this.readRules())
      await this.controller.scan()
      const snapshot = this.controller.getSnapshot()
      this.actionMessage = snapshot.truncated
        ? `${snapshot.matches.length} matches ready; additional matches were omitted by the result limit.`
        : `${snapshot.matches.length} matches ready for review.`
      this.render(snapshot)
    } catch (cause) {
      if (isCancellation(cause)) {
        this.actionMessage = 'Scan cancelled; previous review state is retained.'
        this.render(this.controller.getSnapshot())
        return
      }
      this.actionMessage = cause instanceof Error ? cause.message : 'Highlighter scan failed.'
      this.actionError = true
      this.render(this.controller.getSnapshot())
      throw cause
    }
  }

  /** Applies reviewed matches and reports deterministic create/skip counts. */
  private async apply(): Promise<void> {
    this.actionMessage = ''
    this.actionError = false
    try {
      const result = await this.controller.applyMatches({
        extensions: { demo: { source: 'vanilla-highlighter-panel' } }
      })
      this.actionMessage = `Applied ${result.createdAnnotationIds.length}; skipped ${result.skippedMatchIds.length} existing.`
      this.render(this.controller.getSnapshot())
    } catch (cause) {
      this.actionMessage = cause instanceof Error ? cause.message : 'Highlighter apply failed.'
      this.actionError = true
      this.render(this.controller.getSnapshot())
      throw cause
    }
  }

  /** Reads application-owned form state into serializable public rules. */
  private readRules(): readonly KeywordRule[] {
    return [...this.rulesHost.querySelectorAll<HTMLElement>('[data-highlighter-rule]')]
      .map((row, index) => {
        const terms = this.requireFrom<HTMLTextAreaElement>(row, '.highlighter-rule-terms').value
          .split(/[\n,]/u).map((term) => term.trim()).filter((term) => term.length > 0)
        const regexFlags = this.requireFrom<HTMLInputElement>(row, '.highlighter-regex-flags')
          .value.trim()
        const patterns = this.requireFrom<HTMLTextAreaElement>(row, '.highlighter-rule-patterns')
          .value.split('\n').filter((source) => source.trim().length > 0)
          .map((source, patternIndex) => ({
            id: `pattern-${patternIndex + 1}`,
            kind: 'regex' as const,
            source,
            ...(regexFlags.length === 0 ? {} : { flags: regexFlags })
          }))
        return {
          id: row.dataset['ruleId'] ?? `rule-${index + 1}`,
          label: this.requireFrom<HTMLInputElement>(row, '.highlighter-rule-label').value,
          terms,
          patterns,
          color: this.requireFrom<HTMLInputElement>(row, '.highlighter-rule-color').value,
          enabled: this.requireFrom<HTMLInputElement>(row, '.highlighter-rule-enabled').checked,
          matchCase: this.requireFrom<HTMLInputElement>(row, '.highlighter-match-case').checked,
          wholeWord: this.requireFrom<HTMLInputElement>(row, '.highlighter-whole-word').checked
        }
      })
  }

  /** Adds one editable rule without interpreting its values in the view layer. */
  private appendRule(rule: KeywordRule): void {
    const row = this.host.ownerDocument.createElement('section')
    row.className = 'highlighter-rule-editor'
    row.dataset['highlighterRule'] = ''
    row.dataset['ruleId'] = rule.id
    row.innerHTML = `
      <div class="highlighter-rule-title">
        <label class="check-field"><input class="highlighter-rule-enabled" type="checkbox" checked><span>Enabled</span></label>
        <button class="highlighter-remove-rule" type="button" aria-label="Remove keyword rule">×</button>
      </div>
      <label><span>Name</span><input class="highlighter-rule-label" type="text" maxlength="120"></label>
      <label><span>Terms</span><textarea class="highlighter-rule-terms" rows="2" placeholder="One term per line"></textarea></label>
      <label><span>Regex sources</span><textarea class="highlighter-rule-patterns" rows="2" placeholder="One ECMAScript source per line"></textarea></label>
      <div class="highlighter-rule-options">
        <label><span>Color</span><input class="highlighter-rule-color" type="color"></label>
        <label><span>Regex flags</span><input class="highlighter-regex-flags" type="text" maxlength="4" pattern="[imsu]*" placeholder="u"></label>
        <label class="check-field"><input class="highlighter-match-case" type="checkbox"><span>Case</span></label>
        <label class="check-field"><input class="highlighter-whole-word" type="checkbox"><span>Whole word</span></label>
      </div>`
    this.requireFrom<HTMLInputElement>(row, '.highlighter-rule-label').value = rule.label
    this.requireFrom<HTMLTextAreaElement>(row, '.highlighter-rule-terms').value = (rule.terms ?? []).join('\n')
    this.requireFrom<HTMLTextAreaElement>(row, '.highlighter-rule-patterns').value =
      (rule.patterns ?? []).map((pattern) => pattern.source).join('\n')
    this.requireFrom<HTMLInputElement>(row, '.highlighter-regex-flags').value =
      rule.patterns?.[0]?.flags ?? 'u'
    this.requireFrom<HTMLInputElement>(row, '.highlighter-rule-color').value = rule.color
    this.requireFrom<HTMLInputElement>(row, '.highlighter-rule-enabled').checked = rule.enabled !== false
    this.requireFrom<HTMLInputElement>(row, '.highlighter-match-case').checked = rule.matchCase === true
    this.requireFrom<HTMLInputElement>(row, '.highlighter-whole-word').checked = rule.wholeWord === true
    this.requireFrom<HTMLButtonElement>(row, '.highlighter-remove-rule').addEventListener('click', () => row.remove())
    this.rulesHost.append(row)
  }

  /** Projects one immutable snapshot into status, progress, and review controls. */
  private render(snapshot: KeywordHighlighterSnapshot): void {
    const working = snapshot.status === 'scanning' || snapshot.status === 'applying'
    this.scanButton.disabled = working
    this.scanButton.textContent = snapshot.matches.length > 0 ? 'Rescan document' : 'Scan document'
    this.cancelButton.disabled = snapshot.status !== 'scanning'
    if (this.applyButton !== null) {
      this.applyButton.disabled = snapshot.status !== 'ready' || snapshot.includedCount === 0
    }
    this.progress.hidden = snapshot.status !== 'scanning'
    this.progress.value = snapshot.progress?.percentage ?? 0
    const stateMessage = snapshot.error?.message ?? (this.actionMessage
      || (snapshot.status === 'idle' ? 'Ready to scan'
        : snapshot.status === 'scanning' ? `Scanning ${snapshot.progress?.percentage ?? 0}%`
          : snapshot.status === 'applying' ? 'Creating permanent annotations…'
            : `${snapshot.includedCount} included · ${snapshot.excludedCount} excluded`))
    this.status.value = stateMessage
    this.status.dataset['state'] = snapshot.error !== null || this.actionError
      ? 'error' : snapshot.truncated ? 'warning' : snapshot.status
    this.require<HTMLElement>('.highlighter-counts').textContent =
      `${snapshot.includedCount} included · ${snapshot.excludedCount} excluded`
    this.renderResults(snapshot)
  }

  /** Renders grouped review controls from current rule and match identities. */
  private renderResults(snapshot: KeywordHighlighterSnapshot): void {
    this.resultsHost.replaceChildren()
    if (snapshot.matches.length === 0) {
      const empty = this.host.ownerDocument.createElement('p')
      empty.className = 'empty-message'
      empty.textContent = snapshot.status === 'scanning'
        ? 'Scanning document text…' : 'No matches yet.'
      this.resultsHost.append(empty)
      return
    }
    for (const rule of snapshot.rules) {
      const matches = snapshot.matches.filter((match) => match.ruleId === rule.id)
      if (matches.length === 0) continue
      const group = this.host.ownerDocument.createElement('section')
      group.className = 'highlighter-result-group'
      const heading = this.host.ownerDocument.createElement('div')
      heading.className = 'highlighter-result-heading'
      const title = this.host.ownerDocument.createElement('strong')
      title.textContent = `${rule.label} · ${matches.length}`
      title.style.setProperty('--highlighter-rule-color', rule.color)
      const actions = this.host.ownerDocument.createElement('span')
      const include = this.actionButton('All', () => this.controller.includeRule(rule.id))
      const exclude = this.actionButton('None', () => this.controller.excludeRule(rule.id))
      actions.append(include, exclude)
      heading.append(title, actions)
      const list = this.host.ownerDocument.createElement('div')
      list.className = 'highlighter-match-list'
      for (const match of matches) {
        const row = this.host.ownerDocument.createElement('label')
        row.className = 'highlighter-match-row'
        row.classList.toggle('active', snapshot.activeMatchId === match.id)
        row.classList.toggle('applied', match.annotationId !== undefined)
        const checkbox = this.host.ownerDocument.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.checked = match.reviewState === 'included'
        checkbox.setAttribute('aria-label', `Include ${match.matchedText} on page ${match.range.pageIndex + 1}`)
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) this.controller.includeMatch(match.id)
          else this.controller.excludeMatch(match.id)
        })
        const activate = this.host.ownerDocument.createElement('button')
        activate.type = 'button'
        activate.innerHTML = `<strong></strong><span></span>`
        this.requireFrom<HTMLElement>(activate, 'strong').textContent = `Page ${match.range.pageIndex + 1} · ${match.matchedText}`
        activate.title = match.pattern.kind === 'regex'
          ? `Regex: ${match.pattern.source}` : `Term: ${match.pattern.source}`
        this.requireFrom<HTMLElement>(activate, 'span').textContent = match.preview
        activate.addEventListener('click', () => this.controller.activateMatch(match.id))
        const state = this.host.ownerDocument.createElement('small')
        state.textContent = match.annotationId === undefined ? '' : 'Applied'
        row.append(checkbox, activate, state)
        list.append(row)
      }
      group.append(heading, list)
      this.resultsHost.append(group)
    }
  }

  /** Creates one compact rule-level action button. */
  private actionButton(label: string, action: () => void): HTMLButtonElement {
    const button = this.host.ownerDocument.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.addEventListener('click', action)
    return button
  }

  /** Requires one panel-owned element. */
  private require<T extends Element>(selector: string): T {
    return this.requireFrom<T>(this.host, selector)
  }

  /** Requires one descendant while preserving a specific DOM type. */
  private requireFrom<T extends Element>(parent: ParentNode, selector: string): T {
    const element = parent.querySelector<T>(selector)
    if (element === null) throw new Error(`Required Highlighter control is missing: ${selector}`)
    return element
  }
}

/** Identifies the public structured cancellation without depending on error classes. */
function isCancellation(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null
    && 'code' in cause && cause.code === 'PDF_FEATURE_CANCELLED'
}
