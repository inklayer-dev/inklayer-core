/**
 * @file In-memory canonical annotation repository.
 * @description Owns annotations, page indexes, selection, and listeners while
 * returning detached values at every public boundary.
 */

import { cloneAnnotation, type Annotation } from '../domain/annotation'
import { InkLayerError } from '../domain/errors'
import { parseAnnotation, parseAnnotations } from '../domain/validation'
import type {
  AnnotationRepository,
  AnnotationRepositoryEvent,
  AnnotationRepositoryListener,
  AnnotationSelection,
  AnnotationUpdater
} from './annotation-repository'

/** Creates an empty framework-independent in-memory repository. */
export function createMemoryAnnotationRepository(): AnnotationRepository {
  return new MemoryAnnotationRepository()
}

/** Concrete repository implementation hidden behind the public interface. */
class MemoryAnnotationRepository implements AnnotationRepository {
  private annotations = new Map<string, Annotation>()
  private pageIds = new Map<number, Set<string>>()
  private selection: AnnotationSelection = { ids: [] }
  private readonly listeners = new Set<AnnotationRepositoryListener>()
  private destroyed = false

  /** Returns detached annotations in insertion order. */
  public getAll(): readonly Annotation[] {
    this.assertActive('getAll')
    return [...this.annotations.values()].map(cloneAnnotation)
  }

  /** Returns a detached annotation by ID. */
  public getById(id: string): Annotation | undefined {
    this.assertActive('getById')
    const annotation = this.annotations.get(id)
    return annotation === undefined ? undefined : cloneAnnotation(annotation)
  }

  /** Returns detached annotations for one page. */
  public getByPage(pageIndex: number): readonly Annotation[] {
    this.assertActive('getByPage')
    const ids = this.pageIds.get(pageIndex)
    if (ids === undefined) return []
    return [...ids].flatMap((id) => {
      const annotation = this.annotations.get(id)
      return annotation === undefined ? [] : [cloneAnnotation(annotation)]
    })
  }

  /** Adds one validated annotation. */
  public add(annotation: Annotation): void {
    this.assertActive('add')
    const parsed = parseAnnotation(annotation)
    if (this.annotations.has(parsed.id)) throw duplicateError(parsed, 'add')
    this.annotations.set(parsed.id, parsed)
    this.addToPageIndex(parsed)
    this.emit({ type: 'add', annotation: cloneAnnotation(parsed) })
  }

  /** Updates one annotation while preserving its stable ID. */
  public update(id: string, updater: AnnotationUpdater): Annotation {
    this.assertActive('update')
    const current = this.annotations.get(id)
    if (current === undefined) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Cannot update an unknown annotation.', {
        operation: 'update',
        annotationId: id
      })
    }
    const next = parseAnnotation(updater(cloneAnnotation(current)))
    if (next.id !== id) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Annotation updates cannot change the ID.', {
        operation: 'update',
        annotationId: id,
        pageIndex: current.pageIndex
      })
    }
    this.annotations.set(id, next)
    if (next.pageIndex !== current.pageIndex) {
      this.removeFromPageIndex(current)
      this.addToPageIndex(next)
    }
    this.emit({
      type: 'update',
      annotation: cloneAnnotation(next),
      previous: cloneAnnotation(current)
    })
    return cloneAnnotation(next)
  }

  /** Removes one annotation and reconciles selection. */
  public remove(id: string): Annotation | undefined {
    this.assertActive('remove')
    const annotation = this.annotations.get(id)
    if (annotation === undefined) return undefined
    this.annotations.delete(id)
    this.removeFromPageIndex(annotation)
    const selectionChanged = this.selection.ids.includes(id)
    if (selectionChanged) {
      const ids = this.selection.ids.filter((selectedId) => selectedId !== id)
      this.selection = {
        ids,
        ...(this.selection.primaryId === undefined || this.selection.primaryId === id
          ? {}
          : { primaryId: this.selection.primaryId })
      }
    }
    this.emit({ type: 'remove', annotation: cloneAnnotation(annotation) })
    if (selectionChanged) this.emit({ type: 'selection', selection: this.getSelectionValue() })
    return cloneAnnotation(annotation)
  }

  /** Atomically replaces annotations after validation and duplicate checking. */
  public replaceAll(annotations: readonly Annotation[]): void {
    this.assertActive('replaceAll')
    const parsed = parseAnnotations(annotations)
    const nextAnnotations = new Map(parsed.map((annotation) => [annotation.id, annotation]))
    const nextPageIds = buildPageIndex(parsed)
    this.annotations = nextAnnotations
    this.pageIds = nextPageIds
    const ids = this.selection.ids.filter((id) => nextAnnotations.has(id))
    this.selection = {
      ids,
      ...(this.selection.primaryId !== undefined && nextAnnotations.has(this.selection.primaryId)
        ? { primaryId: this.selection.primaryId }
        : {})
    }
    this.emit({ type: 'replace', annotations: parsed.map(cloneAnnotation) })
    this.emit({ type: 'selection', selection: this.getSelectionValue() })
  }

  /** Returns a detached selection. */
  public getSelection(): AnnotationSelection {
    this.assertActive('getSelection')
    return this.getSelectionValue()
  }

  /** Validates and replaces selection. */
  public setSelection(selection: AnnotationSelection): void {
    this.assertActive('setSelection')
    const ids = [...selection.ids]
    if (new Set(ids).size !== ids.length || ids.some((id) => !this.annotations.has(id))) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Selection must contain unique existing IDs.', {
        operation: 'setSelection'
      })
    }
    if (selection.primaryId !== undefined && !ids.includes(selection.primaryId)) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Primary selection must be selected.', {
        operation: 'setSelection',
        annotationId: selection.primaryId
      })
    }
    this.selection = {
      ids,
      ...(selection.primaryId === undefined ? {} : { primaryId: selection.primaryId })
    }
    this.emit({ type: 'selection', selection: this.getSelectionValue() })
  }

  /** Registers a listener and returns an idempotent unsubscribe. */
  public subscribe(listener: AnnotationRepositoryListener): () => void {
    this.assertActive('subscribe')
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Destroys state and listeners exactly once. */
  public destroy(): void {
    if (this.destroyed) return
    this.emit({ type: 'destroy' })
    this.destroyed = true
    this.annotations.clear()
    this.pageIds.clear()
    this.selection = { ids: [] }
    this.listeners.clear()
  }

  /** Adds one ID to its page index. */
  private addToPageIndex(annotation: Annotation): void {
    const ids = this.pageIds.get(annotation.pageIndex) ?? new Set<string>()
    ids.add(annotation.id)
    this.pageIds.set(annotation.pageIndex, ids)
  }

  /** Removes one ID and prunes empty page indexes. */
  private removeFromPageIndex(annotation: Annotation): void {
    const ids = this.pageIds.get(annotation.pageIndex)
    if (ids === undefined) return
    ids.delete(annotation.id)
    if (ids.size === 0) this.pageIds.delete(annotation.pageIndex)
  }

  /** Emits one detached event to current listeners. */
  private emit(event: AnnotationRepositoryEvent): void {
    for (const listener of [...this.listeners]) listener(structuredClone(event))
  }

  /** Returns selection without consulting lifecycle state. */
  private getSelectionValue(): AnnotationSelection {
    return {
      ids: [...this.selection.ids],
      ...(this.selection.primaryId === undefined ? {} : { primaryId: this.selection.primaryId })
    }
  }

  /** Throws a stable error after repository destruction. */
  private assertActive(operation: string): void {
    if (this.destroyed) {
      throw new InkLayerError('ENGINE_DESTROYED', 'Annotation repository has been destroyed.', {
        operation
      })
    }
  }
}

/** Builds a fresh page index for an annotation collection. */
function buildPageIndex(annotations: readonly Annotation[]): Map<number, Set<string>> {
  const pageIds = new Map<number, Set<string>>()
  for (const annotation of annotations) {
    const ids = pageIds.get(annotation.pageIndex) ?? new Set<string>()
    ids.add(annotation.id)
    pageIds.set(annotation.pageIndex, ids)
  }
  return pageIds
}

/** Creates a duplicate-ID repository error. */
function duplicateError(annotation: Annotation, operation: string): InkLayerError {
  return new InkLayerError('ANNOTATION_DUPLICATE_ID', 'Annotation ID already exists.', {
    operation,
    annotationId: annotation.id,
    pageIndex: annotation.pageIndex
  })
}
