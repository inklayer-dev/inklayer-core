/**
 * @file Vue consumption fixture for the public Highlighter Controller.
 * @description Demonstrates direct snapshot projection and scope disposal
 * without publishing or depending on an InkLayer Vue adapter.
 */

import {
  onScopeDispose,
  readonly,
  shallowRef,
  watch,
  type DeepReadonly,
  type Ref,
  type ShallowRef
} from 'vue'
import {
  createKeywordHighlighter,
  type KeywordHighlighter,
  type KeywordHighlighterAnnotationPort,
  type KeywordHighlighterSnapshot,
  type KeywordHighlighterViewerPort,
  type KeywordRule
} from '@inklayer-dev/core/highlighter'

export interface VueKeywordHighlighterBinding {
  /** Direct public Controller used by product event handlers. */
  readonly controller: KeywordHighlighter
  /** Read-only reactive projection of the latest immutable snapshot. */
  readonly snapshot: DeepReadonly<ShallowRef<KeywordHighlighterSnapshot>>
}

/** Directly consumes one Core Controller inside the active Vue effect scope. */
export function useKeywordHighlighter(
  viewer: KeywordHighlighterViewerPort,
  annotations: KeywordHighlighterAnnotationPort,
  rules: Ref<readonly KeywordRule[]>
): VueKeywordHighlighterBinding {
  const controller = createKeywordHighlighter({ viewer, annotations })
  const snapshot = shallowRef(controller.getSnapshot())
  const unsubscribe = controller.subscribe((next) => { snapshot.value = next })
  watch(rules, (next) => controller.setRules(next), { immediate: true })
  onScopeDispose(() => {
    unsubscribe()
    controller.destroy()
  })
  return { controller, snapshot: readonly(snapshot) }
}
