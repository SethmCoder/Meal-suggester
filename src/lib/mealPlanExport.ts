import type { MealCell } from '../data/types'
import { MEAL_SLOTS, SLOT_LABELS, WEEKDAYS } from '../data/types'
import { addDays, formatDayHeading, formatWeekRange } from './dates'
import { mealExplanation } from './planner'

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 48

export interface MealPlanLine {
  text: string
  size: number
  gap?: number
}

function pdfEscape(text: string): string {
  return text
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function wrap(text: string, size: number): string[] {
  const width = Math.max(20, Math.floor((PAGE_W - MARGIN * 2) / (size * 0.5)))
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > width && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines
}

export function mealPlanLines(weekStart: string, cells: MealCell[]): MealPlanLine[] {
  const lines: MealPlanLine[] = [
    { text: 'Planora meal plan', size: 18, gap: 4 },
    { text: formatWeekRange(weekStart), size: 12, gap: 14 },
  ]
  WEEKDAYS.forEach((day, index) => {
    const heading = formatDayHeading(weekStart, index)
    lines.push({ text: `${heading.weekday} ${heading.date}`, size: 14, gap: 4 })
    for (const slot of MEAL_SLOTS) {
      const cell = cells.find((item) => item.day === day && item.slot === slot)
      const meal = cell?.meal
      const label = meal ? meal.name : 'Open'
      lines.push({ text: `${SLOT_LABELS[slot]}: ${label}${meal?.eatingOut ? ' (eating out)' : ''}${meal?.simple ? ' (simple)' : ''}${meal?.isLeftover ? ' (leftovers)' : ''}`, size: 11 })
      if (meal?.ingredients.length) {
        const ingredients = meal.ingredients
          .map((item) => item.name)
          .filter(Boolean)
          .join(', ')
        lines.push({ text: `Ingredients: ${ingredients}`, size: 10 })
      }
      const why = meal ? mealExplanation(meal) : undefined
      if (why) lines.push({ text: why, size: 10, gap: 6 })
      else lines.push({ text: '', size: 4, gap: 4 })
    }
    lines.push({ text: '', size: 8 })
  })
  lines.push({ text: `Saved ${addDays(weekStart, 0)}`, size: 9 })
  return lines
}

export function mealPlanText(weekStart: string, cells: MealCell[]): string {
  return mealPlanLines(weekStart, cells)
    .map((line) => line.text)
    .filter((line, index, all) => line || all[index - 1])
    .join('\n')
}

export function buildMealPlanPdf(weekStart: string, cells: MealCell[]): Uint8Array {
  const pages: string[][] = []
  let content: string[] = []
  let y = PAGE_H - MARGIN

  function nextPage() {
    if (content.length) pages.push(content)
    content = []
    y = PAGE_H - MARGIN
  }

  for (const line of mealPlanLines(weekStart, cells)) {
    const parts = line.text ? wrap(line.text, line.size) : ['']
    for (const part of parts) {
      const step = line.size + 4
      if (y - step < MARGIN) nextPage()
      if (part) {
        content.push(`BT /F1 ${line.size} Tf ${MARGIN} ${Math.round(y - line.size)} Td (${pdfEscape(part)}) Tj ET`)
      }
      y -= step
    }
    y -= line.gap ?? 0
  }
  if (content.length || !pages.length) pages.push(content)

  const fontId = 3 + pages.length * 2
  const objects: string[] = []
  const kids = pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`
  pages.forEach((streamLines, index) => {
    const pageId = 3 + index * 2
    const stream = streamLines.join('\n')
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${pageId + 1} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`
    objects[pageId + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  })
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  let body = '%PDF-1.4\n'
  const offsets = [0]
  for (let id = 1; id <= fontId; id += 1) {
    offsets[id] = body.length
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xref = body.length
  body += `xref\n0 ${fontId + 1}\n`
  body += '0000000000 65535 f \n'
  for (let id = 1; id <= fontId; id += 1) {
    body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  body += `trailer << /Size ${fontId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new TextEncoder().encode(body)
}

export function downloadMealPlanPdf(weekStart: string, cells: MealCell[]) {
  const bytes = buildMealPlanPdf(weekStart, cells)
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `planora-meal-plan-${weekStart}.pdf`
  link.click()
  URL.revokeObjectURL(url)
}

const EMAIL_KEY = 'planora.emailWeekPlan.v1.'

export function emailWeekPlanEnabled(userId: string): boolean {
  try {
    return localStorage.getItem(EMAIL_KEY + userId) === '1'
  } catch {
    return false
  }
}

export function setEmailWeekPlanEnabled(userId: string, enabled: boolean) {
  localStorage.setItem(EMAIL_KEY + userId, enabled ? '1' : '0')
}

export function openMealPlanEmail(input: { to: string; weekStart: string; cells: MealCell[] }) {
  const subject = `Planora meal plan · ${formatWeekRange(input.weekStart)}`
  const href = `mailto:${encodeURIComponent(input.to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mealPlanText(input.weekStart, input.cells))}`
  window.location.href = href
}
