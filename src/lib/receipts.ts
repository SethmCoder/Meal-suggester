import type { Receipt, ReceiptLineItem } from '../data/types'
import { aiApiKey, aiBaseUrl, aiConfigured, extractJsonObject, readApiError, visionModel } from './aiConfig'
import { mondayOf, parseISODate } from './dates'
import { roundMoney } from './finance'
import { createId } from './id'

export interface ReceiptScan {
  merchant: string | null
  date: string | null
  subtotalUsd: number | null
  taxUsd: number | null
  grandTotalUsd: number | null
  lineItems: ReceiptLineItem[]
}

function positiveMoney(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  return roundMoney(value)
}

function nearly(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.02
}

/**
 * Choose the pre-tax amount to store.
 * An explicit subtotal wins. A tax-inclusive grand total is used only after subtracting tax.
 * A grand total alone is rejected.
 */
export function selectPreTaxTotal(input: {
  subtotalUsd: number | null
  taxUsd: number | null
  grandTotalUsd: number | null
  lineItems?: { priceUsd: number | null }[]
}): number | null {
  const subtotal = positiveMoney(input.subtotalUsd)
  const tax = input.taxUsd != null && Number.isFinite(input.taxUsd) && input.taxUsd > 0 ? roundMoney(input.taxUsd) : null
  const grand = positiveMoney(input.grandTotalUsd)
  const lineSum = roundMoney(
    (input.lineItems ?? []).reduce((sum, row) => sum + (positiveMoney(row.priceUsd) ?? 0), 0),
  )

  if (subtotal != null) {
    if (grand != null && tax != null && nearly(subtotal, grand) && grand > tax) {
      return roundMoney(grand - tax)
    }
    return subtotal
  }

  if (grand != null && tax != null && grand > tax) {
    return roundMoney(grand - tax)
  }

  if (lineSum > 0) return lineSum
  return null
}

export function readMoney(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return roundMoney(value)
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').replace(/[^0-9.-]/g, '')
    if (!cleaned || cleaned === '-' || cleaned === '.') return null
    const amount = Number(cleaned)
    if (!Number.isFinite(amount)) return null
    return roundMoney(amount)
  }
  return null
}

function pickMoney(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (!(key in record)) continue
    const amount = readMoney(record[key])
    if (amount != null) return amount
  }
  return null
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const iso = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const us = iso.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (!us) return null
  const month = Number(us[1])
  const day = Number(us[2])
  let year = Number(us[3])
  if (year < 100) year += 2000
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isSummaryLine(name: string): boolean {
  return /^(sub\s*total|total|grand total|balance|tax|sales tax|vat)\b/i.test(name.trim())
}

export function normalizeReceiptPayload(value: unknown): ReceiptScan {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const rawLines = record.lineItems ?? record.items ?? record.lines
  const lineItems: ReceiptLineItem[] = []
  if (Array.isArray(rawLines)) {
    for (const row of rawLines) {
      if (!row || typeof row !== 'object') continue
      const line = row as Record<string, unknown>
      const name = String(line.name ?? line.description ?? '').trim()
      if (!name || isSummaryLine(name)) continue
      lineItems.push({
        name,
        priceUsd: readMoney(line.priceUsd ?? line.price ?? line.amount),
      })
    }
  }
  const merchantRaw = record.merchant ?? record.store
  const merchant = typeof merchantRaw === 'string' && merchantRaw.trim() ? merchantRaw.trim() : null
  return {
    merchant,
    date: normalizeDate(record.date ?? record.purchasedAt),
    subtotalUsd: pickMoney(record, ['subtotalUsd', 'subtotal', 'subTotal', 'sub_total']),
    taxUsd: pickMoney(record, ['taxUsd', 'tax', 'salesTax', 'sales_tax']),
    grandTotalUsd: pickMoney(record, ['grandTotalUsd', 'grandTotal', 'totalUsd', 'total']),
    lineItems,
  }
}

export function receiptWeekStart(date: string | null, fallback = new Date()): string {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return mondayOf(parseISODate(date))
  return mondayOf(fallback)
}

function purchasedAtFromDate(date: string | null, fallback: Date): string {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split('-').map(Number)
    return new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0).toISOString()
  }
  return fallback.toISOString()
}

export function receiptFromScan(input: {
  scan: ReceiptScan
  imageDataUrl: string | null
  id?: string
  now?: Date
}): Receipt | null {
  const subtotalUsd = selectPreTaxTotal(input.scan)
  if (subtotalUsd == null) return null
  const now = input.now ?? new Date()
  return {
    id: input.id ?? createId(),
    purchasedAt: purchasedAtFromDate(input.scan.date, now),
    weekStart: receiptWeekStart(input.scan.date, now),
    subtotalUsd,
    taxUsd: input.scan.taxUsd != null && input.scan.taxUsd > 0 ? roundMoney(input.scan.taxUsd) : null,
    merchant: input.scan.merchant,
    imageDataUrl: input.imageDataUrl,
    lineItems: input.scan.lineItems,
  }
}

function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
      ? (part as { text: string }).text
      : ''))
    .join('\n')
}

export async function scanReceiptPhoto(dataUrl: string): Promise<ReceiptScan> {
  const base = aiBaseUrl()
  const key = aiApiKey()
  if (!base || !key || !aiConfigured()) {
    throw new Error('Add VITE_AI_BASE_URL and VITE_AI_API_KEY to read receipt photos.')
  }

  let response: Response
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: visionModel(),
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content:
              'You read grocery receipts for Planora. Return JSON only, no markdown: {"merchant": string|null, "date": "YYYY-MM-DD"|null, "subtotalUsd": number|null, "taxUsd": number|null, "grandTotalUsd": number|null, "lineItems":[{"name":string,"priceUsd":number}]}. subtotalUsd is the pre-tax subtotal and must not be the tax-inclusive grand total. If the receipt prints Subtotal, Tax, and Total, put those in subtotalUsd, taxUsd, and grandTotalUsd. lineItems are product lines only, not tax, subtotal, or total. Use null when a number is not visible. Never invent items.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Read the merchant, date, line prices, tax, and the pre-tax subtotal. Do not treat the tax-inclusive total as the subtotal.',
              },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    })
  } catch {
    throw new Error('Could not reach the vision model. Check your connection and AI keys.')
  }

  if (!response.ok) throw new Error(await readApiError(response))
  const payload = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[]
  }
  const content = messageText(payload.choices?.[0]?.message?.content)
  if (!content) throw new Error('The vision model returned an empty receipt reading.')
  const jsonMatch = extractJsonObject(content)
  if (!jsonMatch) throw new Error('Could not parse the receipt response.')
  try {
    return normalizeReceiptPayload(JSON.parse(jsonMatch))
  } catch {
    throw new Error('Could not parse the receipt response.')
  }
}
