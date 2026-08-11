/**
 * @file Deterministic annotation reference numbering.
 * @description Preserves unique valid numbers and assigns conflicts in a stable
 * date, page, and identifier order without mutating annotations.
 */

import type { Annotation } from './annotation'

/** Returns whether a value is a positive safe annotation reference number. */
export function isValidReferenceNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/** Compares annotations using valid date, page, and identifier ordering. */
export function compareAnnotationsForNumbering(left: Annotation, right: Annotation): number {
  const leftTime = parseAnnotationDate(left.createdAt)
  const rightTime = parseAnnotationDate(right.createdAt)
  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) return leftTime - rightTime
  if (leftTime !== null && rightTime === null) return -1
  if (leftTime === null && rightTime !== null) return 1
  if (left.pageIndex !== right.pageIndex) return left.pageIndex - right.pageIndex
  return left.id.localeCompare(right.id)
}

/** Returns the greatest valid reference number in an annotation iterable. */
export function getGreatestReferenceNumber(annotations: Iterable<Annotation>): number {
  let greatest = 0
  for (const annotation of annotations) {
    if (isValidReferenceNumber(annotation.referenceNumber) && annotation.referenceNumber > greatest) {
      greatest = annotation.referenceNumber
    }
  }
  return greatest
}

/** Normalizes missing, invalid, and duplicate numbers deterministically. */
export function normalizeAnnotationReferenceNumbers(
  annotations: readonly Annotation[]
): Annotation[] {
  const ordered = [...annotations].sort(compareAnnotationsForNumbering)
  const used = new Set<number>()
  const assigned = new Map<string, number>()
  const pending: Annotation[] = []
  for (const annotation of ordered) {
    if (isValidReferenceNumber(annotation.referenceNumber) && !used.has(annotation.referenceNumber)) {
      used.add(annotation.referenceNumber)
      assigned.set(annotation.id, annotation.referenceNumber)
    } else {
      pending.push(annotation)
    }
  }
  let next = pending.length === 0 ? 1 : nextSafeReferenceNumber(getGreatestReferenceNumber(ordered))
  pending.forEach((annotation, index) => {
    assigned.set(annotation.id, next)
    if (index < pending.length - 1) next = nextSafeReferenceNumber(next)
  })
  return annotations.map((annotation) => {
    const referenceNumber = assigned.get(annotation.id)
    return referenceNumber === undefined || annotation.referenceNumber === referenceNumber
      ? annotation
      : { ...annotation, referenceNumber }
  })
}

/** Assigns a unique number to a newly created annotation. */
export function assignAnnotationReferenceNumber(
  annotation: Annotation,
  existingAnnotations: Iterable<Annotation>,
  nextReferenceNumber = 1
): Annotation {
  const existing = [...existingAnnotations]
  const used = new Set(existing.flatMap((item) =>
    isValidReferenceNumber(item.referenceNumber) ? [item.referenceNumber] : []))
  if (isValidReferenceNumber(annotation.referenceNumber) && !used.has(annotation.referenceNumber)) {
    return annotation
  }
  const referenceNumber = Math.max(
    nextSafeReferenceNumber(getGreatestReferenceNumber(existing)),
    nextReferenceNumber
  )
  if (!isValidReferenceNumber(referenceNumber)) throw new RangeError('Reference number limit reached.')
  return { ...annotation, referenceNumber }
}

/** Parses supported ISO and PDF date strings to a sortable timestamp. */
function parseAnnotationDate(value: string | null): number | null {
  if (value === null) return null
  const pdfMatch = /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:([Zz])|([+-])(\d{2})'?(\d{2})?'?)?$/.exec(value)
  if (pdfMatch !== null) return parsePdfDateMatch(pdfMatch)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

/** Converts a validated PDF date regex match to a timestamp. */
function parsePdfDateMatch(match: RegExpExecArray): number | null {
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second)
  const parsed = new Date(timestamp)
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null
  const offsetHour = Number(match[9] ?? 0)
  const offsetMinute = Number(match[10] ?? 0)
  if (offsetHour > 23 || offsetMinute > 59) return null
  if (match[7] !== undefined || match[8] === undefined) return timestamp
  const offset = (offsetHour * 60 + offsetMinute) * 60_000
  return timestamp - (match[8] === '+' ? offset : -offset)
}

/** Increments a reference number while guarding the safe-integer boundary. */
function nextSafeReferenceNumber(value: number): number {
  if (value >= Number.MAX_SAFE_INTEGER) throw new RangeError('Reference number limit reached.')
  return value + 1
}
