/**
 * @file Framework-neutral keyword Highlighter Controller workflow.
 * @description Composes scanning, temporary preview, review, navigation, and
 * permanent annotation application without product UI.
 */

import { InkLayerError } from '../domain/errors'
import { parseJsonObject, type JsonObject } from '../domain/json-value'
import type {
  KeywordHighlighter,
  KeywordHighlighterOptions,
  KeywordHighlighterSnapshot,
  KeywordMatch,
  KeywordMatchPattern,
  KeywordRegexPattern,
  KeywordRule,
  KeywordScanOptions,
  ApplyKeywordMatchesOptions,
  ApplyKeywordMatchesResult
} from './contracts'
import type {
  PdfSearchManyProgress,
  PdfSearchManyInputQuery,
  PdfSearchManyResult,
  PdfResolvedTextRange,
  PdfTextHighlightLayer
} from '../viewer/types'

const MAX_RULES = 10_000
const MAX_TOTAL_MATCHERS = 10_000
const MAX_RULE_ID_LENGTH = 512
const MAX_RULE_LABEL_LENGTH = 1_000_000
const MAX_TERM_LENGTH = 1_000_000
const MAX_PATTERN_ID_LENGTH = 512
const MAX_REGEX_SOURCE_LENGTH = 16_384
const MAX_COLOR_LENGTH = 256
const MAX_RESULTS_PER_TERM = 100_000
const MAX_TOTAL_RESULTS = 1_000_000
let nextControllerId = 0
const previewOwners = new WeakMap<object, Map<string, readonly PdfTextHighlightLayer[]>>()

interface ActiveScan {
  readonly controller: AbortController
  readonly controllerGeneration: number
  readonly viewerGeneration: number
  readonly priorStatus: 'idle' | 'ready'
  cancelledByController: boolean
}

interface QueryDescriptorBase {
  readonly ruleIndex: number
  readonly matcherIndex: number
  readonly rule: KeywordRule
  readonly pattern: KeywordMatchPattern
}

interface TextQueryDescriptor extends QueryDescriptorBase {
  readonly kind: 'text'
  readonly term: string
}

interface RegexQueryDescriptor extends QueryDescriptorBase {
  readonly kind: 'regex'
  readonly regex: KeywordRegexPattern
}

type QueryDescriptor = TextQueryDescriptor | RegexQueryDescriptor

interface ActiveApply {
  readonly controller: AbortController
  readonly controllerGeneration: number
  readonly viewerGeneration: number
}

interface ApplyCandidate {
  readonly match: KeywordMatch
  readonly annotationId: string
  readonly rule: KeywordRule
}

type SnapshotInput = Omit<KeywordHighlighterSnapshot, 'includedCount' | 'excludedCount'>
  & Partial<Pick<KeywordHighlighterSnapshot, 'includedCount' | 'excludedCount'>>

/** Creates one independently owned framework-neutral Highlighter Controller. */
export function createKeywordHighlighter(options: KeywordHighlighterOptions): KeywordHighlighter {
  return new KeywordHighlighterImpl(options)
}

/** Concrete headless Controller for the complete keyword-highlighting workflow. */
class KeywordHighlighterImpl implements KeywordHighlighter {
  private readonly options: KeywordHighlighterOptions
  private readonly listeners = new Set<(snapshot: KeywordHighlighterSnapshot) => void>()
  private readonly previewLayerIds = new Set<string>()
  private readonly ownerId = `controller-${nextControllerId += 1}`
  private snapshot: KeywordHighlighterSnapshot = createSnapshot({
    status: 'idle', generation: 0, rules: [], matches: [], activeMatchId: null,
    progress: null, truncated: false, error: null
  })
  private viewerGeneration: number
  private readonly unsubscribeViewer: () => void
  private activeScan: ActiveScan | null = null
  private activeApply: ActiveApply | null = null
  private previewVisible = false
  private destroyed = false

  /** Captures initial document generation without taking ownership of either port. */
  public constructor(options: KeywordHighlighterOptions) {
    if (typeof options !== 'object' || options === null
      || typeof options.viewer?.getSnapshot !== 'function'
      || typeof options.viewer?.subscribe !== 'function'
      || typeof options.viewer?.searchMany !== 'function'
      || typeof options.viewer?.resolveTextRanges !== 'function'
      || typeof options.viewer?.setTextHighlightLayers !== 'function'
      || typeof options.viewer?.clearTextHighlightLayers !== 'function'
      || typeof options.viewer?.goToPage !== 'function'
      || typeof options.annotations?.getAnnotations !== 'function'
      || typeof options.annotations?.createTextMarkupsFromRanges !== 'function'
      || (options.onListenerError !== undefined && typeof options.onListenerError !== 'function')) {
      throw ruleFailure('Highlighter Controller options are invalid.', 'createKeywordHighlighter')
    }
    this.options = options
    this.viewerGeneration = options.viewer.getSnapshot().generation
    this.unsubscribeViewer = options.viewer.subscribe((event) => {
      if (event.type === 'stateChanged') this.observeViewerGeneration(event.snapshot.generation)
      else if (event.type === 'destroyed') {
        this.observeViewerGeneration(options.viewer.getSnapshot().generation)
      }
    })
  }

  /** Stable getter function suitable for React useSyncExternalStore. */
  public readonly getSnapshot = (): KeywordHighlighterSnapshot => this.snapshot

  /** Stable synchronous subscription function with isolated listener failures. */
  public readonly subscribe = (
    listener: (snapshot: KeywordHighlighterSnapshot) => void
  ): (() => void) => {
    this.assertActive('subscribe')
    if (typeof listener !== 'function') {
      throw ruleFailure('Highlighter listener must be a function.', 'subscribe')
    }
    this.listeners.add(listener)
    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      this.listeners.delete(listener)
    }
  }

  /** Replaces normalized rules and invalidates results only when rules changed. */
  public setRules(rules: readonly KeywordRule[]): void {
    this.assertActive('setRules')
    const normalized = normalizeRules(rules)
    if (structurallyEqual(this.snapshot.rules, normalized)) return
    this.cancelActiveWork()
    this.clearOwnedPreview()
    this.commit({
      status: 'idle',
      generation: this.snapshot.generation + 1,
      rules: normalized,
      matches: [],
      activeMatchId: null,
      progress: null,
      truncated: false,
      error: null
    })
  }

  /** Runs one generation-guarded batch scan and atomically replaces matches. */
  public async scan(options: KeywordScanOptions = {}): Promise<void> {
    this.assertActive('scan')
    validateScanOptions(options)
    this.syncViewerGeneration()
    this.cancelActiveWork()
    const viewer = this.options.viewer.getSnapshot()
    const controllerGeneration = this.snapshot.generation + 1
    const task: ActiveScan = {
      controller: new AbortController(),
      controllerGeneration,
      viewerGeneration: viewer.generation,
      priorStatus: this.snapshot.matches.length === 0 ? 'idle' : 'ready',
      cancelledByController: false
    }
    this.activeScan = task
    const removeExternalAbort = forwardAbort(options.signal, task.controller)
    this.commit({
      ...this.snapshot,
      status: 'scanning',
      generation: controllerGeneration,
      progress: null,
      error: null
    })
    try {
      if (viewer.status !== 'ready' || viewer.document === null) {
        throw ruleFailure('A ready PDF document is required.', 'scan')
      }
      if (task.controller.signal.aborted) {
        throw new InkLayerError('PDF_FEATURE_CANCELLED', 'Highlighter scan was cancelled.', {
          operation: 'scan'
        })
      }
      const descriptors = createQueryDescriptors(this.snapshot.rules)
      const queries = descriptors.map(createSearchQuery)
      const result = queries.length === 0
        ? { queries: [], truncated: false }
        : await this.options.viewer.searchMany(queries, {
            signal: task.controller.signal,
            ...(options.maxTotalResults === undefined
              ? {}
              : { maxTotalResults: options.maxTotalResults }),
            onProgress: (progress) => this.commitScanProgress(task, progress)
          })
      this.assertScanOwnership(task)
      const matches = createMatches(
        viewer.document.fingerprints,
        viewer.generation,
        descriptors,
        result,
        this.snapshot.matches
      )
      const annotatedMatches = reconcileAnnotationIds(
        matches,
        documentFingerprint(viewer.document.fingerprints, viewer.generation),
        new Set(this.options.annotations.getAnnotations().map((annotation) => annotation.id))
      )
      const activeMatchId = annotatedMatches.some((match) => match.id === this.snapshot.activeMatchId)
        ? this.snapshot.activeMatchId
        : null
      this.setOwnedPreview(buildPreviewLayers(
        this.ownerId, this.snapshot.rules, annotatedMatches, activeMatchId
      ))
      this.previewVisible = true
      this.activeScan = null
      this.commit({
        status: 'ready',
        generation: controllerGeneration,
        rules: this.snapshot.rules,
        matches: annotatedMatches,
        activeMatchId,
        progress: null,
        truncated: result.truncated || result.queries.some((query) => query.truncated),
        error: null
      })
    } catch (cause) {
      const error = normalizeControllerError(cause, 'scan')
      if (this.ownsScan(task)) {
        this.activeScan = null
        if (this.options.viewer.getSnapshot().generation !== task.viewerGeneration) {
          this.viewerGeneration = this.options.viewer.getSnapshot().generation
          this.commit({
            status: 'idle', generation: controllerGeneration, rules: this.snapshot.rules,
            matches: [], activeMatchId: null, progress: null, truncated: false, error: null
          })
        } else if (task.cancelledByController) {
          this.commit({ ...this.snapshot, status: task.priorStatus, progress: null, error: null })
        } else {
          this.commit({ ...this.snapshot, status: 'error', progress: null, error })
        }
      }
      throw error
    } finally {
      removeExternalAbort()
    }
  }

  /** Cancels active Controller-owned scan work without entering error state. */
  public cancelScan(): void {
    this.assertActive('cancelScan')
    const task = this.activeScan
    if (task === null) return
    task.cancelledByController = true
    task.controller.abort()
    this.activeScan = null
    this.commit({ ...this.snapshot, status: task.priorStatus, progress: null, error: null })
  }

  /** Activates one current result, refreshes preview state, and navigates its page. */
  public activateMatch(id: string): void {
    const match = this.requireReadyMatch(id, 'activateMatch')
    if (this.previewVisible) {
      this.setOwnedPreview(buildPreviewLayers(
        this.ownerId, this.snapshot.rules, this.snapshot.matches, id
      ))
    }
    if (this.snapshot.activeMatchId !== id) this.commit({ ...this.snapshot, activeMatchId: id })
    this.options.viewer.goToPage(match.range.pageIndex)
  }

  /** Includes one current match and updates only this Controller's preview. */
  public includeMatch(id: string): void {
    this.setMatchReviewState(id, 'included', 'includeMatch')
  }

  /** Excludes one current match and updates only this Controller's preview. */
  public excludeMatch(id: string): void {
    this.setMatchReviewState(id, 'excluded', 'excludeMatch')
  }

  /** Includes every current match belonging to one rule. */
  public includeRule(ruleId: string): void {
    this.setRuleReviewState(ruleId, 'included', 'includeRule')
  }

  /** Excludes every current match belonging to one rule. */
  public excludeRule(ruleId: string): void {
    this.setRuleReviewState(ruleId, 'excluded', 'excludeRule')
  }

  /** Resolves included ranges and creates missing permanent Highlight annotations. */
  public async applyMatches(
    options: ApplyKeywordMatchesOptions = {}
  ): Promise<ApplyKeywordMatchesResult> {
    this.assertActive('applyMatches')
    validateApplyOptions(options)
    this.requireReady('applyMatches')
    this.syncViewerGeneration()
    this.requireReady('applyMatches')
    this.cancelActiveWork()
    const viewer = this.options.viewer.getSnapshot()
    if (viewer.status !== 'ready' || viewer.document === null) {
      throw ruleFailure('A ready PDF document is required.', 'applyMatches')
    }
    const extensions = parseApplyExtensions(options.extensions)
    const controllerGeneration = this.snapshot.generation + 1
    const task: ActiveApply = {
      controller: new AbortController(), controllerGeneration,
      viewerGeneration: viewer.generation
    }
    this.activeApply = task
    const removeExternalAbort = forwardAbort(options.signal, task.controller)
    const fingerprint = documentFingerprint(viewer.document.fingerprints, viewer.generation)
    this.commit({
      ...this.snapshot, status: 'applying', generation: controllerGeneration, error: null
    })
    try {
      if (task.controller.signal.aborted) throw applyCancelled()
      const candidates = createApplyCandidates(this.snapshot.matches, this.snapshot.rules, fingerprint)
      const existingBefore = new Set(
        this.options.annotations.getAnnotations().map((annotation) => annotation.id)
      )
      const missing = candidates.filter((candidate) => !existingBefore.has(candidate.annotationId))
      const skippedMatchIds = candidates
        .filter((candidate) => existingBefore.has(candidate.annotationId))
        .map((candidate) => candidate.match.id)
      const resolved = missing.length === 0
        ? []
        : await this.options.viewer.resolveTextRanges(
            missing.map((candidate) => candidate.match.range),
            { signal: task.controller.signal }
          )
      this.assertApplyOwnership(task)
      if (resolved.length !== missing.length) {
        throw ruleFailure('Resolved text range count does not match included matches.', 'applyMatches')
      }
      const createdAnnotationIds: string[] = []
      for (const rule of this.snapshot.rules) {
        const inputs = missing.flatMap((candidate, index) => candidate.rule.id !== rule.id
          ? []
          : [createMarkupInput(candidate, requireResolvedRange(resolved, index), extensions)])
        if (inputs.length === 0) continue
        this.assertApplyOwnership(task)
        const created = this.options.annotations.createTextMarkupsFromRanges(
          'highlight', inputs, { appearance: { fill: { color: rule.color } } }
        )
        createdAnnotationIds.push(...created.map((annotation) => annotation.id))
      }
      this.assertApplyOwnership(task)
      const existingAfter = new Set(
        this.options.annotations.getAnnotations().map((annotation) => annotation.id)
      )
      const createdSet = new Set(createdAnnotationIds)
      for (const candidate of missing) {
        if (existingAfter.has(candidate.annotationId) && !createdSet.has(candidate.annotationId)) {
          skippedMatchIds.push(candidate.match.id)
        }
      }
      this.assertApplyOwnership(task)
      this.activeApply = null
      this.commit({
        ...this.snapshot,
        status: 'ready',
        matches: reconcileAnnotationIds(this.snapshot.matches, fingerprint, existingAfter),
        error: null
      })
      return Object.freeze({
        createdAnnotationIds: Object.freeze([...createdAnnotationIds]),
        skippedMatchIds: Object.freeze([...skippedMatchIds])
      })
    } catch (cause) {
      const error = normalizeControllerError(cause, 'applyMatches')
      if (this.ownsApply(task)) {
        this.activeApply = null
        const currentViewer = this.options.viewer.getSnapshot()
        if (currentViewer.generation !== task.viewerGeneration) {
          this.viewerGeneration = currentViewer.generation
          this.clearOwnedPreview()
          this.commit({
            status: 'idle', generation: controllerGeneration, rules: this.snapshot.rules,
            matches: [], activeMatchId: null, progress: null, truncated: false, error: null
          })
        } else {
          this.commit({
            ...this.snapshot,
            status: 'error',
            matches: this.reconcileAvailableAnnotationIds(fingerprint),
            error
          })
        }
      }
      throw error
    } finally {
      removeExternalAbort()
    }
  }

  /** Clears only temporary Viewer layers registered by this Controller. */
  public clearPreview(): void {
    this.assertActive('clearPreview')
    this.clearOwnedPreview()
    this.previewVisible = false
  }

  /** Returns to initial live state without touching permanent annotations. */
  public reset(): void {
    this.assertActive('reset')
    const changed = this.snapshot.status !== 'idle' || this.snapshot.rules.length !== 0
      || this.snapshot.matches.length !== 0 || this.snapshot.error !== null
      || this.snapshot.progress !== null || this.snapshot.truncated
    this.cancelActiveWork()
    this.clearOwnedPreview()
    this.previewVisible = false
    if (!changed) return
    this.commit({
      status: 'idle', generation: this.snapshot.generation + 1, rules: [], matches: [],
      activeMatchId: null, progress: null, truncated: false, error: null
    })
  }

  /** Releases only Controller-owned work, preview state, and listeners. */
  public destroy(): void {
    if (this.destroyed) return
    this.cancelActiveWork()
    this.clearOwnedPreview()
    this.previewVisible = false
    this.unsubscribeViewer()
    this.destroyed = true
    this.commit({
      status: 'destroyed', generation: this.snapshot.generation + 1, rules: [], matches: [],
      activeMatchId: null, progress: null, truncated: false, error: null
    })
    this.listeners.clear()
  }

  /** Publishes scan progress only while the task and document still match. */
  private commitScanProgress(task: ActiveScan, progress: PdfSearchManyProgress): void {
    if (!this.ownsScan(task)) return
    if (this.options.viewer.getSnapshot().generation !== task.viewerGeneration) {
      task.cancelledByController = true
      task.controller.abort()
      return
    }
    if (structurallyEqual(this.snapshot.progress, progress)) return
    this.commit({ ...this.snapshot, progress: { ...progress } })
  }

  /** Rejects results that no longer own either Controller or Viewer generation. */
  private assertScanOwnership(task: ActiveScan): void {
    if (!this.ownsScan(task)
      || this.options.viewer.getSnapshot().generation !== task.viewerGeneration) {
      throw new InkLayerError('PDF_FEATURE_CANCELLED', 'Highlighter scan was superseded.', {
        operation: 'scan'
      })
    }
  }

  /** Returns whether this exact asynchronous task may still publish. */
  private ownsScan(task: ActiveScan): boolean {
    return !this.destroyed && this.activeScan === task
      && this.snapshot.generation === task.controllerGeneration
  }

  /** Invalidates retained matches when a public operation observes a new document. */
  private syncViewerGeneration(): void {
    this.observeViewerGeneration(this.options.viewer.getSnapshot().generation)
  }

  /** Clears stale results immediately when the Viewer publishes a new generation. */
  private observeViewerGeneration(generation: number): void {
    if (generation === this.viewerGeneration) return
    this.viewerGeneration = generation
    this.cancelActiveWork()
    this.clearOwnedPreview()
    this.previewVisible = false
    this.commit({
      status: 'idle', generation: this.snapshot.generation + 1, rules: this.snapshot.rules,
      matches: [], activeMatchId: null, progress: null, truncated: false, error: null
    })
  }

  /** Aborts a task without publishing; the owning caller commits its next state. */
  private cancelActiveScan(): void {
    const task = this.activeScan
    if (task === null) return
    task.cancelledByController = true
    task.controller.abort()
    this.activeScan = null
  }

  /** Aborts asynchronous work superseded by another Controller operation. */
  private cancelActiveWork(): void {
    this.cancelActiveScan()
    const apply = this.activeApply
    if (apply === null) return
    apply.controller.abort()
    this.activeApply = null
  }

  /** Removes only layer IDs retained by this Controller. */
  private clearOwnedPreview(): void {
    if (this.previewLayerIds.size === 0) return
    this.options.viewer.clearTextHighlightLayers([...this.previewLayerIds])
    removePreviewOwner(this.options.viewer, this.ownerId)
    this.previewLayerIds.clear()
  }

  /** Atomically replaces the aggregate preview collection for all Controller owners. */
  private setOwnedPreview(layers: readonly PdfTextHighlightLayer[]): void {
    replacePreviewOwner(this.options.viewer, this.ownerId, layers)
    this.previewLayerIds.clear()
    for (const layer of layers) this.previewLayerIds.add(layer.id)
  }

  /** Replaces one match review state only when it actually changes. */
  private setMatchReviewState(
    id: string,
    reviewState: KeywordMatch['reviewState'],
    operation: string
  ): void {
    const match = this.requireReadyMatch(id, operation)
    if (match.reviewState === reviewState) return
    const matches = this.snapshot.matches.map((entry) => entry.id === id
      ? { ...entry, reviewState }
      : entry)
    if (this.previewVisible) this.setOwnedPreview(buildPreviewLayers(
      this.ownerId, this.snapshot.rules, matches, this.snapshot.activeMatchId
    ))
    this.commit({ ...this.snapshot, matches })
  }

  /** Replaces every match review state for one existing rule. */
  private setRuleReviewState(
    ruleId: string,
    reviewState: KeywordMatch['reviewState'],
    operation: string
  ): void {
    this.requireReady(operation)
    if (!this.snapshot.rules.some((rule) => rule.id === ruleId)) {
      throw ruleFailure('Highlighter rule does not exist.', operation)
    }
    if (!this.snapshot.matches.some((match) => match.ruleId === ruleId
      && match.reviewState !== reviewState)) return
    const matches = this.snapshot.matches.map((match) => match.ruleId === ruleId
      ? { ...match, reviewState }
      : match)
    if (this.previewVisible) this.setOwnedPreview(buildPreviewLayers(
      this.ownerId, this.snapshot.rules, matches, this.snapshot.activeMatchId
    ))
    this.commit({ ...this.snapshot, matches })
  }

  /** Returns one current match after enforcing the ready workflow state. */
  private requireReadyMatch(id: string, operation: string): KeywordMatch {
    this.requireReady(operation)
    const match = this.snapshot.matches.find((entry) => entry.id === id)
    if (match === undefined) throw ruleFailure('Highlighter match does not exist.', operation)
    return match
  }

  /** Restricts review and application operations to a committed scan result. */
  private requireReady(operation: string): void {
    this.assertActive(operation)
    if (this.snapshot.status !== 'ready') {
      throw ruleFailure('Highlighter Controller is not ready.', operation)
    }
  }

  /** Returns whether this exact apply task may still publish or mutate. */
  private ownsApply(task: ActiveApply): boolean {
    return !this.destroyed && this.activeApply === task
      && this.snapshot.generation === task.controllerGeneration
  }

  /** Rejects geometry results that no longer own Controller or Viewer state. */
  private assertApplyOwnership(task: ActiveApply): void {
    if (task.controller.signal.aborted || !this.ownsApply(task)
      || this.options.viewer.getSnapshot().generation !== task.viewerGeneration) {
      throw applyCancelled()
    }
  }

  /** Reconciles partial apply output without allowing diagnostics to mask the primary error. */
  private reconcileAvailableAnnotationIds(fingerprint: string): readonly KeywordMatch[] {
    try {
      const existing = new Set(
        this.options.annotations.getAnnotations().map((annotation) => annotation.id)
      )
      return reconcileAnnotationIds(this.snapshot.matches, fingerprint, existing)
    } catch {
      return this.snapshot.matches
    }
  }

  /** Creates one frozen snapshot and synchronously isolates listener failures. */
  private commit(next: SnapshotInput): void {
    if (sameSnapshotState(this.snapshot, next)) return
    this.snapshot = createSnapshot(next)
    for (const listener of [...this.listeners]) {
      try {
        listener(this.snapshot)
      } catch (cause) {
        try {
          this.options.onListenerError?.(cause)
        } catch {
          // Diagnostics must never interrupt Controller state.
        }
      }
    }
  }

  /** Throws the shared lifecycle error after destruction. */
  private assertActive(operation: string): void {
    if (this.destroyed) {
      throw new InkLayerError('ENGINE_DESTROYED', 'Highlighter Controller has been destroyed.', {
        operation
      })
    }
  }

}

/** Validates, normalizes, and detaches a complete ordered rule collection. */
function normalizeRules(rules: readonly KeywordRule[]): KeywordRule[] {
  if (!Array.isArray(rules) || rules.length > MAX_RULES) {
    throw ruleFailure('Highlighter rules must be a bounded array.', 'setRules')
  }
  const ids = new Set<string>()
  let totalMatchers = 0
  return rules.map((rule) => {
    if (typeof rule !== 'object' || rule === null
      || typeof rule.id !== 'string' || typeof rule.label !== 'string'
      || (rule.terms !== undefined && !Array.isArray(rule.terms))
      || (rule.patterns !== undefined && !Array.isArray(rule.patterns))
      || typeof rule.color !== 'string') {
      throw ruleFailure('Highlighter rule is invalid.', 'setRules')
    }
    const id = rule.id.trim()
    const label = rule.label.trim()
    if (id.length === 0 || id.length > MAX_RULE_ID_LENGTH || ids.has(id)
      || label.length === 0 || label.length > MAX_RULE_LABEL_LENGTH
      || !isCssColor(rule.color)
      || (rule.enabled !== undefined && typeof rule.enabled !== 'boolean')
      || (rule.matchCase !== undefined && typeof rule.matchCase !== 'boolean')
      || (rule.wholeWord !== undefined && typeof rule.wholeWord !== 'boolean')
      || (rule.matchDiacritics !== undefined && typeof rule.matchDiacritics !== 'boolean')
      || (rule.maxResultsPerTerm !== undefined
        && (!Number.isSafeInteger(rule.maxResultsPerTerm)
          || rule.maxResultsPerTerm <= 0 || rule.maxResultsPerTerm > MAX_RESULTS_PER_TERM))) {
      throw ruleFailure('Highlighter rule is invalid.', 'setRules')
    }
    ids.add(id)
    const seenTerms = new Set<string>()
    const terms: string[] = []
    for (const value of rule.terms ?? []) {
      if (typeof value !== 'string') throw ruleFailure('Highlighter rule term is invalid.', 'setRules')
      const term = value.trim()
      if (term.length === 0 || seenTerms.has(term)) continue
      if (term.length > MAX_TERM_LENGTH) {
        throw ruleFailure('Highlighter rule term is oversized.', 'setRules')
      }
      seenTerms.add(term)
      terms.push(term)
    }
    const patternIds = new Set<string>()
    const patterns: KeywordRegexPattern[] = []
    for (const value of rule.patterns ?? []) {
      if (typeof value !== 'object' || value === null || value.kind !== 'regex'
        || typeof value.id !== 'string' || typeof value.source !== 'string') {
        throw ruleFailure('Highlighter rule pattern is invalid.', 'setRules')
      }
      const patternId = value.id.trim()
      if (patternId.length === 0 || patternId.length > MAX_PATTERN_ID_LENGTH
        || patternIds.has(patternId) || value.source.trim().length === 0
        || value.source.length > MAX_REGEX_SOURCE_LENGTH
        || (value.maxResults !== undefined
          && (!Number.isSafeInteger(value.maxResults)
            || value.maxResults <= 0 || value.maxResults > MAX_RESULTS_PER_TERM))) {
        throw ruleFailure('Highlighter rule pattern is invalid.', 'setRules')
      }
      const flags = normalizeRegexFlags(value.flags)
      validateRegexSyntax(value.source, flags, 'setRules')
      patternIds.add(patternId)
      patterns.push({
        id: patternId,
        kind: 'regex',
        source: value.source,
        flags,
        ...(value.maxResults === undefined ? {} : { maxResults: value.maxResults })
      })
    }
    totalMatchers += terms.length + patterns.length
    if (terms.length + patterns.length === 0 || totalMatchers > MAX_TOTAL_MATCHERS) {
      throw ruleFailure('Highlighter rules contain an invalid number of matchers.', 'setRules')
    }
    let metadata = rule.metadata
    if (metadata !== undefined) {
      try {
        metadata = parseJsonObject(metadata, 'setRules')
      } catch (cause) {
        throw ruleFailure('Highlighter rule metadata is invalid.', 'setRules', cause)
      }
    }
    return {
      id,
      label,
      terms,
      ...(patterns.length === 0 ? {} : { patterns }),
      color: rule.color.trim(),
      enabled: rule.enabled ?? true,
      matchCase: rule.matchCase ?? false,
      wholeWord: rule.wholeWord ?? false,
      matchDiacritics: rule.matchDiacritics ?? false,
      ...(rule.maxResultsPerTerm === undefined
        ? {}
        : { maxResultsPerTerm: rule.maxResultsPerTerm }),
      ...(metadata === undefined ? {} : { metadata })
    }
  })
}

/** Validates and canonicalizes one regex flag string for stable snapshots and IDs. */
function normalizeRegexFlags(value: string | undefined): string {
  const flags = value ?? ''
  if (typeof flags !== 'string' || !/^[imsu]*$/u.test(flags)
    || new Set(flags).size !== flags.length) {
    throw ruleFailure('Highlighter regex flags are invalid.', 'setRules')
  }
  return [...flags].sort((left, right) => 'imsu'.indexOf(left) - 'imsu'.indexOf(right)).join('')
}

/** Compiles one regex source during atomic rule validation without executing it. */
function validateRegexSyntax(source: string, flags: string, operation: string): void {
  try {
    void new RegExp(source, flags)
  } catch (cause) {
    throw ruleFailure('Highlighter regex syntax is invalid.', operation, cause)
  }
}

/** Flattens enabled literal terms and regex patterns into ordered Viewer descriptors. */
function createQueryDescriptors(rules: readonly KeywordRule[]): QueryDescriptor[] {
  return rules.flatMap((rule, ruleIndex) => rule.enabled === false
    ? []
    : [
        ...(rule.terms ?? []).map((term, matcherIndex): TextQueryDescriptor => ({
          kind: 'text',
          ruleIndex,
          matcherIndex,
          rule,
          term,
          pattern: {
            id: `text-${stableHash([
              term,
              String(rule.matchCase ?? false),
              String(rule.wholeWord ?? false),
              String(rule.matchDiacritics ?? false)
            ].join('\u0000'))}`,
            kind: 'text',
            source: term
          }
        })),
        ...(rule.patterns ?? []).map((regex, patternIndex): RegexQueryDescriptor => ({
          kind: 'regex',
          ruleIndex,
          matcherIndex: (rule.terms?.length ?? 0) + patternIndex,
          rule,
          regex,
          pattern: {
            id: regex.id,
            kind: 'regex',
            source: regex.source,
            ...(regex.flags === undefined ? {} : { flags: regex.flags })
          }
        }))
      ])
}

/** Converts one Controller descriptor into the generic Viewer query contract. */
function createSearchQuery(descriptor: QueryDescriptor): PdfSearchManyInputQuery {
  if (descriptor.kind === 'regex') {
    return {
      id: `rule-${descriptor.ruleIndex}-pattern-${descriptor.matcherIndex}`,
      kind: 'regex',
      source: descriptor.regex.source,
      options: {
        ...(descriptor.regex.flags === undefined ? {} : { flags: descriptor.regex.flags }),
        ...(descriptor.regex.maxResults === undefined
          ? {}
          : { maxResults: descriptor.regex.maxResults })
      }
    }
  }
  return {
    id: `rule-${descriptor.ruleIndex}-term-${descriptor.matcherIndex}`,
    query: descriptor.term,
    options: {
      matchCase: descriptor.rule.matchCase ?? false,
      wholeWord: descriptor.rule.wholeWord ?? false,
      matchDiacritics: descriptor.rule.matchDiacritics ?? false,
      ...(descriptor.rule.maxResultsPerTerm === undefined
        ? {}
        : { maxResults: descriptor.rule.maxResultsPerTerm })
    }
  }
}

/** Converts ordered per-query results into page-first deterministic matches. */
function createMatches(
  fingerprints: readonly (string | null)[],
  viewerGeneration: number,
  descriptors: readonly QueryDescriptor[],
  result: PdfSearchManyResult,
  previous: readonly KeywordMatch[]
): KeywordMatch[] {
  const fingerprint = fingerprints.find((value): value is string => value !== null && value.length > 0)
    ?? `viewer-generation-${viewerGeneration}`
  const previousById = new Map(previous.map((match) => [match.id, match]))
  const matches = result.queries.flatMap((query, queryIndex) => {
    const descriptor = descriptors[queryIndex]
    if (descriptor === undefined) return []
    return query.matches.map((match) => {
      const id = `highlighter-match-${stableHash([
        fingerprint,
        descriptor.rule.id,
        ...(descriptor.kind === 'text'
          ? [descriptor.term]
          : ['regex', descriptor.regex.id, descriptor.regex.source, descriptor.regex.flags ?? '']),
        match.pageIndex,
        match.start,
        match.length
      ].join('\u0000'))}`
      const retained = previousById.get(id)
      return {
        id,
        ruleId: descriptor.rule.id,
        term: descriptor.pattern.source,
        pattern: { ...descriptor.pattern },
        matchedText: match.text,
        range: { pageIndex: match.pageIndex, start: match.start, length: match.length },
        preview: match.preview,
        reviewState: retained?.reviewState ?? 'included',
        ...(retained?.annotationId === undefined ? {} : { annotationId: retained.annotationId }),
        ruleIndex: descriptor.ruleIndex,
        matcherIndex: descriptor.matcherIndex,
        matchIndex: match.matchIndex
      }
    })
  })
  matches.sort((left, right) => left.range.pageIndex - right.range.pageIndex
    || left.ruleIndex - right.ruleIndex || left.matcherIndex - right.matcherIndex
    || left.range.start - right.range.start || left.range.length - right.range.length
    || left.matchIndex - right.matchIndex)
  return matches.map(({
    ruleIndex: _rule,
    matcherIndex: _matcher,
    matchIndex: _match,
    ...match
  }) => match)
}

/** Returns the stable document identity used by Match and Annotation IDs. */
function documentFingerprint(
  fingerprints: readonly (string | null)[],
  viewerGeneration: number
): string {
  return fingerprints.find((value): value is string => value !== null && value.length > 0)
    ?? `viewer-generation-${viewerGeneration}`
}

/** Builds one included-range preview layer for every rule that still has visible matches. */
function buildPreviewLayers(
  ownerId: string,
  rules: readonly KeywordRule[],
  matches: readonly KeywordMatch[],
  activeMatchId: string | null
): PdfTextHighlightLayer[] {
  return rules.flatMap((rule) => {
    const included = matches.filter((match) => match.ruleId === rule.id
      && match.reviewState === 'included')
    if (included.length === 0) return []
    const activeIndex = activeMatchId === null
      ? null
      : included.findIndex((match) => match.id === activeMatchId)
    return [{
      id: `highlighter-preview-${ownerId}-${stableHash(rule.id)}`,
      ranges: included.map((match) => ({ ...match.range })),
      style: { color: rule.color },
      activeRangeIndex: activeIndex === null || activeIndex < 0 ? null : activeIndex,
      visible: true
    }]
  })
}

/** Atomically replaces one owner's layers while preserving other Controller owners. */
function replacePreviewOwner(
  viewer: KeywordHighlighterOptions['viewer'],
  ownerId: string,
  layers: readonly PdfTextHighlightLayer[]
): void {
  const current = previewOwners.get(viewer) ?? new Map<string, readonly PdfTextHighlightLayer[]>()
  const next = new Map(current)
  if (layers.length === 0) next.delete(ownerId)
  else next.set(ownerId, structuredClone(layers))
  viewer.setTextHighlightLayers([...next.values()].flat())
  if (next.size === 0) previewOwners.delete(viewer)
  else previewOwners.set(viewer, next)
}

/** Removes one owner from the shared registry after selective Viewer clearing succeeds. */
function removePreviewOwner(
  viewer: KeywordHighlighterOptions['viewer'],
  ownerId: string
): void {
  const current = previewOwners.get(viewer)
  if (current === undefined) return
  const next = new Map(current)
  next.delete(ownerId)
  if (next.size === 0) previewOwners.delete(viewer)
  else previewOwners.set(viewer, next)
}

/** Produces stable permanent-annotation candidates for included matches. */
function createApplyCandidates(
  matches: readonly KeywordMatch[],
  rules: readonly KeywordRule[],
  fingerprint: string
): ApplyCandidate[] {
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]))
  return matches.flatMap((match) => {
    if (match.reviewState !== 'included') return []
    const rule = rulesById.get(match.ruleId)
    if (rule === undefined) throw ruleFailure('Highlighter match rule does not exist.', 'applyMatches')
    return [{
      match,
      rule,
      annotationId: permanentAnnotationId(fingerprint, match.id)
    }]
  })
}

/** Adds or removes optional annotation IDs based on current repository identity. */
function reconcileAnnotationIds(
  matches: readonly KeywordMatch[],
  fingerprint: string,
  existingIds: ReadonlySet<string>
): KeywordMatch[] {
  return matches.map((match) => {
    const annotationId = permanentAnnotationId(fingerprint, match.id)
    const { annotationId: previous, ...base } = match
    void previous
    return existingIds.has(annotationId) ? { ...base, annotationId } : base
  })
}

/** Derives one bounded stable annotation identity independently from array order. */
function permanentAnnotationId(fingerprint: string, matchId: string): string {
  return `highlighter-annotation-${stableHash(`${fingerprint}\u0000${matchId}`)}`
}

/** Creates one permanent markup request with protected Highlighter provenance. */
function createMarkupInput(
  candidate: ApplyCandidate,
  range: PdfResolvedTextRange,
  extensions: JsonObject
): {
    readonly id: string
    readonly range: PdfResolvedTextRange
    readonly extensions: JsonObject
  } {
  return {
    id: candidate.annotationId,
    range,
    extensions: {
      ...extensions,
      highlighter: {
        source: 'keyword-highlighter',
        ruleId: candidate.rule.id,
        matchId: candidate.match.id,
        pattern: { ...candidate.match.pattern },
        matchedText: candidate.match.matchedText,
        range: { ...candidate.match.range }
      }
    }
  }
}

/** Returns one resolved range or fails before repository mutation. */
function requireResolvedRange(
  ranges: readonly PdfResolvedTextRange[],
  index: number
): PdfResolvedTextRange {
  const range = ranges[index]
  if (range === undefined) {
    throw ruleFailure('Resolved text range is missing.', 'applyMatches')
  }
  return range
}

/** Validates and detaches caller application metadata before apply state changes. */
function parseApplyExtensions(extensions: JsonObject | undefined): JsonObject {
  if (extensions === undefined) return {}
  try {
    return parseJsonObject(extensions, 'applyMatches')
  } catch (cause) {
    throw ruleFailure('Highlighter apply extensions are invalid.', 'applyMatches', cause)
  }
}

/** Validates external cancellation and bounded application metadata controls. */
function validateApplyOptions(options: ApplyKeywordMatchesOptions): void {
  if (typeof options !== 'object' || options === null
    || (options.signal !== undefined && !isAbortSignal(options.signal))
    || (options.extensions !== undefined
      && (typeof options.extensions !== 'object' || options.extensions === null))) {
    throw ruleFailure('Highlighter apply options are invalid.', 'applyMatches')
  }
}

/** Creates one structured cancellation shared by apply supersession paths. */
function applyCancelled(): InkLayerError {
  return new InkLayerError('PDF_FEATURE_CANCELLED', 'Highlighter apply was cancelled.', {
    operation: 'applyMatches'
  })
}

/** Validates caller controls even when no enabled rule produces a Viewer query. */
function validateScanOptions(options: KeywordScanOptions): void {
  if (typeof options !== 'object' || options === null
    || (options.signal !== undefined && !isAbortSignal(options.signal))
    || (options.maxTotalResults !== undefined
      && (!Number.isSafeInteger(options.maxTotalResults)
        || options.maxTotalResults <= 0 || options.maxTotalResults > MAX_TOTAL_RESULTS))) {
    throw ruleFailure('Highlighter scan options are invalid.', 'scan')
  }
}

/** Accepts AbortSignals across browser realms without relying on instanceof. */
function isAbortSignal(value: unknown): value is AbortSignal {
  return typeof value === 'object' && value !== null
    && typeof (value as AbortSignal).aborted === 'boolean'
    && typeof (value as AbortSignal).addEventListener === 'function'
    && typeof (value as AbortSignal).removeEventListener === 'function'
}

/** Creates a deeply detached and frozen snapshot with derived review counts. */
function createSnapshot(input: SnapshotInput): KeywordHighlighterSnapshot {
  const rules = structuredClone(input.rules)
  const matches = structuredClone(input.matches)
  deepFreeze(rules)
  deepFreeze(matches)
  const snapshot: KeywordHighlighterSnapshot = {
    status: input.status,
    generation: input.generation,
    rules,
    matches,
    activeMatchId: input.activeMatchId,
    includedCount: matches.filter((match) => match.reviewState === 'included').length,
    excludedCount: matches.filter((match) => match.reviewState === 'excluded').length,
    progress: input.progress === null ? null : Object.freeze({ ...input.progress }),
    truncated: input.truncated,
    error: input.error
  }
  return Object.freeze(snapshot)
}

/** Forwards one caller AbortSignal into Controller-owned work. */
function forwardAbort(signal: AbortSignal | undefined, controller: AbortController): () => void {
  if (signal === undefined) return () => {}
  const abort = () => controller.abort()
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
  return () => signal.removeEventListener('abort', abort)
}

/** Produces a stable compact hexadecimal identity from UTF-16 input. */
function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, '0')
}

/** Checks one bounded CSS color using the host parser when available. */
function isCssColor(value: string): boolean {
  if (value.trim().length === 0 || value.length > MAX_COLOR_LENGTH) return false
  return typeof CSS === 'undefined' || typeof CSS.supports !== 'function'
    || CSS.supports('color', value)
}

/** Creates one structured Controller validation or staged-operation error. */
function ruleFailure(message: string, operation: string, cause?: unknown): InkLayerError {
  return new InkLayerError('PDF_FEATURE_FAILED', message, {
    operation,
    ...(cause === undefined ? {} : { cause })
  })
}

/** Retains structured Core errors and contains arbitrary port failures. */
function normalizeControllerError(cause: unknown, operation: string): InkLayerError {
  return cause instanceof InkLayerError
    ? cause
    : ruleFailure('Highlighter Controller operation failed.', operation, cause)
}

/** Deeply freezes detached JSON-shaped rule and match containers. */
function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
}

/** Compares serializable Controller state without observing object identity. */
function structurallyEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Avoids publishing a new object when every observable field is unchanged. */
function sameSnapshotState(
  current: KeywordHighlighterSnapshot,
  next: SnapshotInput
): boolean {
  return current.status === next.status && current.generation === next.generation
    && current.rules === next.rules && current.matches === next.matches
    && current.activeMatchId === next.activeMatchId
    && structurallyEqual(current.progress, next.progress)
    && current.truncated === next.truncated && current.error === next.error
}
