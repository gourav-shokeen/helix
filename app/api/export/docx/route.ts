// app/api/export/docx/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/requireAuth'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, LevelFormat, BorderStyle, WidthType, ShadingType,
  ImageRun,
} from 'docx'

// A4 with 1" margins: 11906 - 2880 = 9026 DXA content width
const CONTENT_WIDTH = 9026

// ── Text run builder — handles bold, italic, inline code marks ──────────────
function getTextRuns(node: any): TextRun[] {
  if (!node?.content) return [new TextRun('')]
  return node.content.flatMap((child: any) => {
    if (child.type !== 'text') return []
    const marks: string[] = (child.marks ?? []).map((m: any) => m.type)
    return [new TextRun({
      text: child.text ?? '',
      bold: marks.includes('bold'),
      italics: marks.includes('italic'),
      strike: marks.includes('strike'),
      font: marks.includes('code') ? 'Courier New' : 'Calibri',
      size: marks.includes('code') ? 20 : 24,
      highlight: marks.includes('code') ? 'yellow' : undefined,
    })]
  })
}

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' }
const CELL_BORDERS = {
  top: CELL_BORDER, bottom: CELL_BORDER,
  left: CELL_BORDER, right: CELL_BORDER,
  insideH: CELL_BORDER, insideV: CELL_BORDER,
}

// ── Main node converter ──────────────────────────────────────────────────────
function convertNode(node: any, extra?: { boards?: Record<string, any>; diagramImages?: Record<string, string> }): (Paragraph | Table)[] {
  switch (node.type) {

    case 'heading': {
      const levelMap: Record<number, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
      }
      return [new Paragraph({
        heading: levelMap[node.attrs?.level ?? 1] ?? HeadingLevel.HEADING_1,
        children: getTextRuns(node),
      })]
    }

    case 'paragraph': {
      return [new Paragraph({
        children: node.content?.length ? getTextRuns(node) : [new TextRun('')],
        spacing: { after: 120 },
      })]
    }

    case 'blockquote': {
      return (node.content ?? []).flatMap((child: any) => {
        if (child.type !== 'paragraph') return convertNode(child)
        return [new Paragraph({
          indent: { left: 720 },
          border: { left: { style: BorderStyle.SINGLE, size: 16, color: '00a67d', space: 12 } },
          spacing: { after: 120 },
          children: getTextRuns(child),
        })]
      })
    }

    case 'codeBlock': {
      const raw = node.content?.[0]?.text ?? ''
      const lines = raw.split('\n')
      return lines.map((line: string, i: number) =>
        new Paragraph({
          shading: { fill: 'F4F4F4', type: ShadingType.CLEAR },
          indent: { left: 480, right: 480 },
          spacing: { before: i === 0 ? 160 : 0, after: i === lines.length - 1 ? 160 : 0, line: 276 },
          border: i === 0 ? { top: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' }, left: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' }, right: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' } }
            : i === lines.length - 1 ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' }, left: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' }, right: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' } }
            : { left: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' }, right: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' } },
          children: [new TextRun({ text: line || ' ', font: 'Courier New', size: 20 })],
        })
      )
    }

    case 'bulletList': {
      return (node.content ?? []).flatMap((item: any) =>
        (item.content ?? []).flatMap((child: any) =>
          child.type === 'paragraph'
            ? [new Paragraph({
                numbering: { reference: 'bullets', level: 0 },
                children: getTextRuns(child),
                spacing: { after: 80 },
              })]
            : convertNode(child)
        )
      )
    }

    case 'orderedList': {
      return (node.content ?? []).flatMap((item: any) =>
        (item.content ?? []).flatMap((child: any) =>
          child.type === 'paragraph'
            ? [new Paragraph({
                numbering: { reference: 'numbers', level: 0 },
                children: getTextRuns(child),
                spacing: { after: 80 },
              })]
            : convertNode(child)
        )
      )
    }

    case 'taskList': {
      return (node.content ?? []).flatMap((item: any) => {
        const checked = item.attrs?.checked ?? false
        return (item.content ?? []).flatMap((child: any) =>
          child.type === 'paragraph'
            ? [new Paragraph({
                children: [
                  new TextRun({ text: checked ? '☑  ' : '☐  ', font: 'Calibri', size: 24 }),
                  ...getTextRuns(child),
                ],
                spacing: { after: 80 },
              })]
            : convertNode(child)
        )
      })
    }

    case 'horizontalRule': {
      return [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 1 } },
        spacing: { before: 200, after: 200 },
        children: [],
      })]
    }

    case 'table': {
      const rows = node.content ?? []
      if (!rows.length) return []
      const colCount = Math.max(...rows.map((r: any) => r.content?.length ?? 1))
      const colWidth = Math.floor(CONTENT_WIDTH / colCount)
      return [new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: Array(colCount).fill(colWidth),
        rows: rows.map((row: any, rowIdx: number) =>
          new TableRow({
            tableHeader: rowIdx === 0,
            children: (row.content ?? []).map((cell: any) =>
              new TableCell({
                borders: CELL_BORDERS,
                width: { size: colWidth, type: WidthType.DXA },
                margins: { top: 80, bottom: 80, left: 140, right: 140 },
                shading: {
                  fill: rowIdx === 0 ? 'F0F0F0' : 'FFFFFF',
                  type: ShadingType.CLEAR,
                },
                children: (cell.content ?? []).map((p: any) =>
                  new Paragraph({
                    children: getTextRuns(p),
                    ...(rowIdx === 0 ? { run: { bold: true } } : {}),
                  })
                ),
              })
            ),
          })
        ),
      })]
    }

    case 'kanbanBlock': {
      const boardId = node.attrs?.boardId
      const boardData = boardId
        ? extra?.boards?.[boardId]
        : Object.values(extra?.boards ?? {})[0]

      const COLUMN_ORDER = ['idea', 'building', 'testing', 'done']
      const rawColumns = boardData?.columns
      console.log('[docx] columns fetched:', rawColumns?.length ?? 0)
      const columns: { title: string; cards: { title: string }[] }[] = rawColumns
        ? Array.isArray(rawColumns)
          ? rawColumns
          : COLUMN_ORDER.map(key => ({
              title: key.charAt(0).toUpperCase() + key.slice(1),
              cards: Array.isArray(rawColumns[key]) ? rawColumns[key] : [],
            }))
        : []

      if (!columns.length) {
        return [new Paragraph({
          spacing: { before: 160, after: 160 },
          children: [new TextRun({ text: '[ Kanban Board — no data ]', italics: true, color: '888888', size: 20 })],
        })]
      }

      const colCount = columns.length
      const colWidth = Math.floor(CONTENT_WIDTH / colCount)

      const headerRow = new TableRow({
        tableHeader: true,
        children: columns.map(col =>
          new TableCell({
            borders: CELL_BORDERS,
            width: { size: colWidth, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 140, right: 140 },
            shading: { fill: 'E8F5F0', type: ShadingType.CLEAR },
            children: [new Paragraph({
              children: [new TextRun({ text: col.title ?? 'Column', bold: true, size: 22, font: 'Calibri', color: '00a67d' })],
            })],
          })
        ),
      })

      const maxCards = Math.max(...columns.map(col => col.cards?.length ?? 0), 1)
      const cardRows = Array.from({ length: maxCards }, (_, rowIdx) =>
        new TableRow({
          children: columns.map(col => {
            const card = col.cards?.[rowIdx]
            return new TableCell({
              borders: CELL_BORDERS,
              width: { size: colWidth, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 140, right: 140 },
              shading: { fill: card ? 'FFFFFF' : 'FAFAFA', type: ShadingType.CLEAR },
              children: [new Paragraph({
                children: card
                  ? [new TextRun({ text: card.title ?? '', size: 20, font: 'Calibri' })]
                  : [new TextRun({ text: '', size: 20 })],
              })],
            })
          }),
        })
      )

      return [
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: Array(colCount).fill(colWidth),
          rows: [headerRow, ...cardRows],
        }),
        new Paragraph({ children: [], spacing: { after: 160 } }),
      ]
    }

    // ✅ FIX: was 'diagramNode', extension name is 'diagram'
    case 'diagram': {
      const diagramId = node.attrs?.id
      const base64Png = diagramId ? extra?.diagramImages?.[diagramId] : undefined

      if (base64Png) {
        // Embed as PNG image — 500pt wide, 300pt tall (fits A4 content width)
        return [
          new Paragraph({
            spacing: { before: 160, after: 160 },
            children: [
              new ImageRun({
                data: Buffer.from(base64Png, 'base64'),
                transformation: { width: 700, height: 450 },
                type: 'png',
              }),
            ],
          }),
        ]
      }

      // Fallback if PNG wasn't provided
      return [new Paragraph({
        spacing: { before: 160, after: 160 },
        children: [new TextRun({
          text: '[ Diagram — open document in Helix to view ]',
          italics: true,
          color: '888888',
          size: 20,
        })],
      })]
    }

    default:
      return []
  }
}

// ── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult instanceof NextResponse) return authResult

    const { content, title, documentId, diagramImages } = await req.json()

    const docTitle = title ?? 'Document'

    const boards: Record<string, any> = {}
    if (documentId) {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const { data: rows, error } = await supabase
          .from('project_boards')
          .select('*')
          .eq('project_id', documentId)
        console.log('[docx] boards fetched:', rows?.length ?? 0)
        if (rows?.length) {
          const best = rows.reduce((prev, curr) => {
            const countCards = (d: any) => {
              const cols = d?.data?.columns ?? {}
              return Array.isArray(cols)
                ? cols.reduce((s: number, c: any) => s + (c.cards?.length ?? 0), 0)
                : Object.values(cols).reduce((s: number, c: any) => s + (Array.isArray(c) ? c.length : 0), 0)
            }
            return countCards(curr) >= countCards(prev) ? curr : prev
          })
          if (best?.data && best?.id) {
            boards[best.id] = best.data
            if (content?.content) {
              content.content = content.content.map((node: any) => {
                if (node.type === 'kanbanBlock') {
                  return { ...node, attrs: { ...node.attrs, boardId: best.id } }
                }
                return node
              })
            }
          }
        }
      } catch (e) {
        console.error('[docx] board fetch error:', e)
      }
    }

    const extra = { boards, diagramImages: diagramImages ?? {} }

    const bodyChildren: (Paragraph | Table)[] = []

    bodyChildren.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        spacing: { after: 480 },
        children: [new TextRun({ text: docTitle, bold: true, size: 52, font: 'Calibri' })],
      })
    )

    for (const node of (content?.content ?? [])) {
      bodyChildren.push(...convertNode(node, extra))
    }

    const doc = new Document({
      styles: {
        default: {
          document: { run: { font: 'Calibri', size: 24, color: '1a1a1a' } },
        },
        paragraphStyles: [
          {
            id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 40, bold: true, font: 'Calibri', color: '111111' },
            paragraph: { spacing: { before: 400, after: 160 }, outlineLevel: 0 },
          },
          {
            id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 32, bold: true, font: 'Calibri', color: '222222' },
            paragraph: { spacing: { before: 320, after: 120 }, outlineLevel: 1 },
          },
          {
            id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 26, bold: true, font: 'Calibri', color: '444444' },
            paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 2 },
          },
        ],
      },
      numbering: {
        config: [
          {
            reference: 'bullets',
            levels: [{
              level: 0,
              format: LevelFormat.BULLET,
              text: '\u2022',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            }],
          },
          {
            reference: 'numbers',
            levels: [{
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            }],
          },
        ],
      },
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: bodyChildren,
      }],
    })

    const buffer = await Packer.toBuffer(doc)
    const safeTitle = docTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase()

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeTitle}.docx"`,
      },
    })
  } catch (err) {
    console.error('DOCX export error:', err)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}