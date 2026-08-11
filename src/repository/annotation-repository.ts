/**
 * @file Canonical annotation repository contract.
 * @description Defines mutation, page indexing, selection, subscription, and
 * lifecycle semantics without a framework state dependency.
 */

import type { Annotation } from '../domain/annotation'

/** Current engine selection expressed only through stable annotation IDs. */
export interface AnnotationSelection {
  /** Selected annotation IDs in interaction order. */
  ids: readonly string[]
  /** Primary selection receiving single-target controls. */
  primaryId?: string
}

/** Functional annotation update applied by a repository. */
export type AnnotationUpdater = (
  annotation: Readonly<Annotation>
) => Annotation

/** Mutation events emitted after repository state is consistent. */
export type AnnotationRepositoryEvent =
  | {
    /** Event discriminator. */
    type: 'add'
    /** Added detached annotation. */
    annotation: Annotation
  }
  | {
    /** Event discriminator. */
    type: 'update'
    /** Updated detached annotation. */
    annotation: Annotation
    /** Annotation value before the update. */
    previous: Annotation
  }
  | {
    /** Event discriminator. */
    type: 'remove'
    /** Removed detached annotation. */
    annotation: Annotation
  }
  | {
    /** Event discriminator. */
    type: 'replace'
    /** Complete detached replacement collection. */
    annotations: readonly Annotation[]
  }
  | {
    /** Event discriminator. */
    type: 'selection'
    /** Current detached selection. */
    selection: AnnotationSelection
  }
  | {
    /** Event discriminator. */
    type: 'destroy'
  }

/** Listener invoked synchronously after one repository change. */
export type AnnotationRepositoryListener = (event: AnnotationRepositoryEvent) => void

/** Framework-independent repository used by annotation engines. */
export interface AnnotationRepository {
  /** Returns detached annotations in insertion order. */
  getAll(): readonly Annotation[]
  /** Returns a detached annotation by stable ID. */
  getById(id: string): Annotation | undefined
  /** Returns detached annotations for one zero-based page. */
  getByPage(pageIndex: number): readonly Annotation[]
  /** Adds one validated annotation and rejects duplicate IDs. */
  add(annotation: Annotation): void
  /** Replaces one annotation through a functional updater. */
  update(id: string, updater: AnnotationUpdater): Annotation
  /** Removes and returns one annotation when present. */
  remove(id: string): Annotation | undefined
  /** Atomically replaces all annotations after full validation. */
  replaceAll(annotations: readonly Annotation[]): void
  /** Returns a detached selection consistent with current annotations. */
  getSelection(): AnnotationSelection
  /** Replaces selection after verifying all selected IDs. */
  setSelection(selection: AnnotationSelection): void
  /** Subscribes to synchronous changes and returns an idempotent unsubscribe. */
  subscribe(listener: AnnotationRepositoryListener): () => void
  /** Releases all state and listeners; repeated calls have no effect. */
  destroy(): void
}
