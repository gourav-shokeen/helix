// utils/exportPdf.ts — Frontend-only PDF export via html2canvas + jsPDF
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

export async function exportPdf(elementId: string, filename: string): Promise<void> {
  const el = document.getElementById(elementId)
  if (!el) return

  const canvas = await html2canvas(el, { scale: 2, useCORS: true })
  const pdf = new jsPDF('p', 'mm', 'a4')
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297)
  pdf.save(`${filename}.pdf`)
}
