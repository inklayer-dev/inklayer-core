/**
 * @file Annotation reference normalization and synchronization.
 * @description Separates stable annotation targets from visible #N labels and
 * keeps comment text aligned after document renumbering.
 */


/** Minimal annotation identity needed to synchronize visible reference labels. */
interface NumberedAnnotationTarget {
  /** Stable annotation identifier. */
  id: string
  /** Current positive display number when assigned. */
  referenceNumber?: number
}

/** A stable annotation target stored beside readable reference text. */
export interface AnnotationReference {
  /** Reference discriminator reserved for future target kinds. */
  type: 'annotation'
  /** Stable annotation identifier used for navigation. */
  annotationId: string
  /** Visible positive-integer label such as `#12`. */
  label: string
}

/** Text and structured references returned by normalization operations. */
export interface AnnotationReferenceContent {
  /** Possibly synchronized visible text. */
  content: string
  /** Valid targets present in the text, or undefined when none remain. */
  references?: AnnotationReference[]
}

/** Pattern accepted for visible positive safe-integer reference labels. */
export const ANNOTATION_REFERENCE_LABEL_PATTERN = /^#([1-9]\d*)$/

/** Returns whether an unknown value is a valid canonical annotation reference. */
export function isValidAnnotationReference(value: unknown): value is AnnotationReference {
  if (!isRecord(value)) return false
  if (value['type'] !== 'annotation' || typeof value['annotationId'] !== 'string') return false
  if (value['annotationId'].length === 0 || typeof value['label'] !== 'string') return false
  const match = ANNOTATION_REFERENCE_LABEL_PATTERN.exec(value['label'])
  return match !== null && Number.isSafeInteger(Number(match[1]))
}

/** Normalizes valid, unambiguous references by their first text occurrence. */
export function normalizeAnnotationReferences(
  content: string,
  references: readonly unknown[] | undefined
): AnnotationReference[] | undefined {
  if (references === undefined || references.length === 0) return undefined
  const unique = new Map<string, { reference: AnnotationReference; index: number }>()
  const idsByLabel = new Map<string, string>()
  const ambiguous = new Set<string>()

  for (const value of references) {
    if (!isValidAnnotationReference(value) || ambiguous.has(value.label)) continue
    const index = findReferenceLabel(content, value.label)
    if (index === -1) continue
    const existingId = idsByLabel.get(value.label)
    if (existingId !== undefined && existingId !== value.annotationId) {
      ambiguous.add(value.label)
      idsByLabel.delete(value.label)
      for (const [key, entry] of unique) {
        if (entry.reference.label === value.label) unique.delete(key)
      }
      continue
    }
    idsByLabel.set(value.label, value.annotationId)
    const key = `${value.annotationId}\u0000${value.label}`
    if (!unique.has(key)) unique.set(key, { reference: { ...value }, index })
  }

  const normalized = [...unique.values()]
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.reference)
  return normalized.length === 0 ? undefined : normalized
}

/** Rewrites stale visible labels from current annotation numbers in one pass. */
export function synchronizeAnnotationReferenceLabels(
  content: string,
  references: readonly unknown[] | undefined,
  annotations: readonly NumberedAnnotationTarget[]
): AnnotationReferenceContent {
  const normalized = normalizeAnnotationReferences(content, references)
  if (normalized === undefined) return { content }
  const annotationsById = new Map(annotations.map((annotation) => [annotation.id, annotation]))
  const replacements = new Map<string, string>()
  const updated = normalized.map((reference) => {
    const number = annotationsById.get(reference.annotationId)?.referenceNumber
    if (number === undefined) return reference
    const currentLabel = `#${number}`
    replacements.set(reference.label, currentLabel)
    return currentLabel === reference.label ? reference : { ...reference, label: currentLabel }
  })
  const labels = [...replacements.entries()].filter(([oldLabel, newLabel]) => oldLabel !== newLabel)
  if (labels.length === 0) return { content, references: normalized }
  const escaped = labels.map(([label]) => escapeRegExp(label)).sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`(?:${escaped.join('|')})(?!\\d)`, 'g')
  const synchronized = content.replace(pattern, (label) => replacements.get(label) ?? label)
  const synchronizedReferences = normalizeAnnotationReferences(synchronized, updated)
  return {
    content: synchronized,
    ...(synchronizedReferences === undefined ? {} : { references: synchronizedReferences })
  }
}

/** Returns whether a value is a plain record-like object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Locates a label that is not the prefix of a longer numeric label. */
function findReferenceLabel(content: string, label: string): number {
  let fromIndex = 0
  while (fromIndex < content.length) {
    const index = content.indexOf(label, fromIndex)
    if (index === -1) return -1
    const next = content[index + label.length]
    if (next === undefined || !/\d/.test(next)) return index
    fromIndex = index + label.length
  }
  return -1
}

/** Escapes a literal for insertion into a regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
