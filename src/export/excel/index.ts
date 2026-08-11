/**
 * @file Framework-independent Excel annotation export.
 * @description Produces workbook bytes with stable annotation and comment
 * schemas while allowing consumers to localize only human-readable labels.
 */

import ExcelJS from 'exceljs'

import type { Annotation } from '../../domain/annotation'
import type { AnnotationReference } from '../../domain/references'
import { parseAnnotations } from '../../domain/validation'

/** Localizable workbook and column labels. */
export interface ExcelExportLabels {
  /** Annotation worksheet name. */
  annotationsSheet: string
  /** Comment worksheet name. */
  commentsSheet: string
  /** Human-readable column labels keyed by stable field name. */
  columns: Partial<Record<ExcelExportColumn, string>>
}

/** Stable semantic columns available to label translators. */
export type ExcelExportColumn =
  | 'annotationId'
  | 'referenceNumber'
  | 'pageNumber'
  | 'type'
  | 'text'
  | 'selectedText'
  | 'authorId'
  | 'authorName'
  | 'createdAt'
  | 'updatedAt'
  | 'native'
  | 'references'
  | 'commentId'
  | 'commentTitle'
  | 'commentContent'
  | 'commentAuthorId'
  | 'commentAuthorName'
  | 'commentDate'
  | 'commentStatus'

/** Excel byte export options independent from browser download behavior. */
export interface ExcelExportOptions {
  /** Optional localized worksheet and header labels. */
  labels?: Partial<Omit<ExcelExportLabels, 'columns'>> & {
    /** Optional localized header labels. */
    columns?: Partial<Record<ExcelExportColumn, string>>
  }
  /** Workbook creator metadata. */
  creator?: string
}

const DEFAULT_LABELS: ExcelExportLabels = {
  annotationsSheet: 'Annotations',
  commentsSheet: 'Comments',
  columns: {
    annotationId: 'Annotation ID',
    referenceNumber: 'Reference',
    pageNumber: 'Page',
    type: 'Type',
    text: 'Text',
    selectedText: 'Selected text',
    authorId: 'Author ID',
    authorName: 'Author',
    createdAt: 'Created at',
    updatedAt: 'Updated at',
    native: 'Native',
    references: 'References',
    commentId: 'Comment ID',
    commentTitle: 'Comment title',
    commentContent: 'Comment',
    commentAuthorId: 'Comment author ID',
    commentAuthorName: 'Comment author',
    commentDate: 'Comment date',
    commentStatus: 'Comment status'
  }
}

/** Builds a complete XLSX file as filename-independent bytes. */
export async function buildAnnotationWorkbook(
  annotationsInput: readonly Annotation[],
  options: ExcelExportOptions = {}
): Promise<Uint8Array> {
  const annotations = parseAnnotations(annotationsInput)
  const labels = resolveLabels(options.labels)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = options.creator ?? 'InkLayer Core'
  workbook.created = new Date(0)
  workbook.modified = new Date(0)

  const annotationSheet = workbook.addWorksheet(labels.annotationsSheet)
  annotationSheet.columns = annotationColumns(labels)
  for (const annotation of annotations) annotationSheet.addRow(annotationRow(annotation))
  formatSheet(annotationSheet)

  const commentSheet = workbook.addWorksheet(labels.commentsSheet)
  commentSheet.columns = commentColumns(labels)
  for (const annotation of annotations) {
    for (const comment of annotation.comments) commentSheet.addRow(commentRow(annotation, comment))
  }
  formatSheet(commentSheet)

  const bytes = await workbook.xlsx.writeBuffer()
  return new Uint8Array(bytes)
}

/** Resolves optional localized labels without translating semantic values. */
function resolveLabels(options: ExcelExportOptions['labels']): ExcelExportLabels {
  return {
    annotationsSheet: options?.annotationsSheet ?? DEFAULT_LABELS.annotationsSheet,
    commentsSheet: options?.commentsSheet ?? DEFAULT_LABELS.commentsSheet,
    columns: { ...DEFAULT_LABELS.columns, ...options?.columns }
  }
}

/** Returns the localized label for one stable column key. */
function label(labels: ExcelExportLabels, key: ExcelExportColumn): string {
  return labels.columns[key] ?? key
}

/** Builds the annotation worksheet column schema. */
function annotationColumns(labels: ExcelExportLabels): Partial<ExcelJS.Column>[] {
  return [
    column(labels, 'annotationId', 24), column(labels, 'referenceNumber', 12),
    column(labels, 'pageNumber', 10), column(labels, 'type', 18),
    column(labels, 'text', 40), column(labels, 'selectedText', 40),
    column(labels, 'authorId', 20), column(labels, 'authorName', 24),
    column(labels, 'createdAt', 24), column(labels, 'updatedAt', 24),
    column(labels, 'native', 10), column(labels, 'references', 30)
  ]
}

/** Builds the comment worksheet column schema. */
function commentColumns(labels: ExcelExportLabels): Partial<ExcelJS.Column>[] {
  return [
    column(labels, 'annotationId', 24), column(labels, 'referenceNumber', 12),
    column(labels, 'pageNumber', 10), column(labels, 'commentId', 24),
    column(labels, 'commentTitle', 24), column(labels, 'commentContent', 50),
    column(labels, 'commentAuthorId', 20), column(labels, 'commentAuthorName', 24),
    column(labels, 'commentDate', 24), column(labels, 'commentStatus', 18),
    column(labels, 'references', 30)
  ]
}

/** Creates one ExcelJS column from a stable semantic key. */
function column(labels: ExcelExportLabels, key: ExcelExportColumn, width: number): Partial<ExcelJS.Column> {
  return { header: label(labels, key), key, width }
}

/** Converts one canonical annotation to an annotation worksheet row. */
function annotationRow(annotation: Annotation): Record<string, string | number | boolean | null> {
  return {
    annotationId: annotation.id,
    referenceNumber: annotation.referenceNumber ?? null,
    pageNumber: annotation.pageIndex + 1,
    type: annotation.type,
    text: annotation.content?.text ?? '',
    selectedText: annotation.content?.selectedText ?? '',
    authorId: annotation.author.id,
    authorName: annotation.author.name,
    createdAt: annotation.createdAt,
    updatedAt: annotation.updatedAt ?? null,
    native: annotation.native,
    references: formatReferences(annotation.content?.references)
  }
}

/** Converts one canonical comment to a comment worksheet row. */
function commentRow(
  annotation: Annotation,
  comment: Annotation['comments'][number]
): Record<string, string | number | null> {
  return {
    annotationId: annotation.id,
    referenceNumber: annotation.referenceNumber ?? null,
    pageNumber: annotation.pageIndex + 1,
    commentId: comment.id,
    commentTitle: comment.title,
    commentContent: comment.content,
    commentAuthorId: comment.author?.id ?? '',
    commentAuthorName: comment.author?.name ?? '',
    commentDate: comment.date,
    commentStatus: comment.status ?? '',
    references: formatReferences(comment.references)
  }
}

/** Formats structured references into a readable, stable cell value. */
function formatReferences(references: readonly AnnotationReference[] | undefined): string {
  return references?.map((reference) => `${reference.label} (${reference.annotationId})`).join(', ') ?? ''
}

/** Applies simple readable header and text wrapping styles. */
function formatSheet(sheet: ExcelJS.Worksheet): void {
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  const header = sheet.getRow(1)
  header.font = { bold: true }
  header.alignment = { vertical: 'middle' }
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.alignment = { vertical: 'top', wrapText: true }
  })
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: sheet.columnCount } }
}
