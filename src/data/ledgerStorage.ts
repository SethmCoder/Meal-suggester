import type { Consumption, Purchase, Receipt } from './types'

/** Client-side ledger for purchases, consumptions, and receipt photos (no migration required). */
const KEY_PREFIX = 'planora.ledger.v1.'

interface LedgerBlob {
  purchases: Purchase[]
  consumptions: Consumption[]
  receipts: Receipt[]
}

function empty(): LedgerBlob {
  return { purchases: [], consumptions: [], receipts: [] }
}

function read(userId: string): LedgerBlob {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userId)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Partial<LedgerBlob>
    return {
      purchases: Array.isArray(parsed.purchases) ? parsed.purchases : [],
      consumptions: Array.isArray(parsed.consumptions) ? parsed.consumptions : [],
      receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [],
    }
  } catch {
    return empty()
  }
}

function write(userId: string, blob: LedgerBlob) {
  localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(blob))
}

export function listLedgerPurchases(userId: string): Purchase[] {
  return [...read(userId).purchases].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt))
}

export function addLedgerPurchase(userId: string, purchase: Purchase): Purchase {
  const blob = read(userId)
  blob.purchases.push(purchase)
  write(userId, blob)
  return purchase
}

export function listLedgerConsumptions(userId: string): Consumption[] {
  return [...read(userId).consumptions].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
}

export function addLedgerConsumption(userId: string, entry: Consumption): Consumption {
  const blob = read(userId)
  blob.consumptions.push(entry)
  write(userId, blob)
  return entry
}

export function listLedgerReceipts(userId: string): Receipt[] {
  return [...read(userId).receipts].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt))
}

export function addLedgerReceipt(userId: string, receipt: Receipt): Receipt {
  const blob = read(userId)
  blob.receipts.push(receipt)
  try {
    write(userId, blob)
    return receipt
  } catch {
    const slim: Receipt = { ...receipt, imageDataUrl: null }
    blob.receipts[blob.receipts.length - 1] = slim
    write(userId, blob)
    return slim
  }
}
