/**
 * @file Excel byte export integration tests.
 * @description Reloads generated XLSX bytes to verify workbook schema, values,
 * comments, references, localization boundaries, authors, and dates.
 */

import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { buildAnnotationWorkbook } from '../../../src/export/excel'
import { createTestAnnotation } from '../../helpers/annotation'

describe('buildAnnotationWorkbook', () => {
  it('writes localized headers with stable semantic row and comment values', async () => {
    const annotation = createTestAnnotation({
      referenceNumber: 7,
      content: {
        text: 'See #8',
        selectedText: 'Selected',
        references: [{ type: 'annotation', annotationId: 'annotation-8', label: '#8' }]
      },
      comments: [{
        id: 'comment-1',
        title: 'Review',
        content: 'Reply to #8',
        author: { id: 'bob', name: 'Bob' },
        date: '2025-08-11T12:00:00Z',
        status: 'Accepted',
        references: [{ type: 'annotation', annotationId: 'annotation-8', label: '#8' }]
      }]
    })

    const bytes = await buildAnnotationWorkbook([annotation], {
      creator: 'InkLayer Test',
      labels: {
        annotationsSheet: '批注',
        commentsSheet: '评论',
        columns: { annotationId: '批注 ID', type: '类型' }
      }
    })
    expect(bytes.byteLength).toBeGreaterThan(1_000)

    const workbook = new ExcelJS.Workbook()
    const arrayBuffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(arrayBuffer).set(bytes)
    await workbook.xlsx.load(arrayBuffer)
    const annotations = workbook.getWorksheet('批注')
    const comments = workbook.getWorksheet('评论')
    expect(annotations?.getCell('A1').value).toBe('批注 ID')
    expect(annotations?.getCell('D1').value).toBe('类型')
    expect(annotations?.getCell('A2').value).toBe('annotation-1')
    expect(annotations?.getCell('B2').value).toBe(7)
    expect(annotations?.getCell('C2').value).toBe(1)
    expect(annotations?.getCell('D2').value).toBe('rectangle')
    expect(annotations?.getCell('G2').value).toBe('alice')
    expect(annotations?.getCell('H2').value).toBe('Alice')
    expect(annotations?.getCell('I2').value).toBe('2025-08-10T12:00:00Z')
    expect(annotations?.getCell('L2').value).toBe('#8 (annotation-8)')
    expect(comments?.getCell('D2').value).toBe('comment-1')
    expect(comments?.getCell('F2').value).toBe('Reply to #8')
    expect(comments?.getCell('G2').value).toBe('bob')
    expect(comments?.getCell('H2').value).toBe('Bob')
    expect(comments?.getCell('I2').value).toBe('2025-08-11T12:00:00Z')
    expect(comments?.getCell('J2').value).toBe('Accepted')
  })
})
