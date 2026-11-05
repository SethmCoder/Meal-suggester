import type { InventoryItem } from '../data/types'
import { expiryStatus, todayISO } from './dates'

export type MustEatReason = 'expired' | 'expiring' | 'freezer'

export interface MustEatFood {
  id: string
  name: string
  reason: MustEatReason
  detail: string
}

/** Foods the cook should use soon: expired, expiring within a few days, or stored frozen. */
export function foodsToUseFirst(inventory: InventoryItem[], today = todayISO()): MustEatFood[] {
  const rows: MustEatFood[] = []
  for (const item of inventory) {
    const status = expiryStatus(item.expiresOn, today)
    const frozen = item.category === 'frozen' || /\bfrozen\b/i.test(item.name)
    if (status === 'expired') {
      rows.push({
        id: item.id,
        name: item.name,
        reason: 'expired',
        detail: item.expiresOn ? `Expired ${item.expiresOn}` : 'Expired',
      })
      continue
    }
    if (status === 'soon') {
      rows.push({
        id: item.id,
        name: item.name,
        reason: 'expiring',
        detail: item.expiresOn ? `Use by ${item.expiresOn}` : 'Expiring soon',
      })
      continue
    }
    if (frozen) {
      rows.push({
        id: item.id,
        name: item.name,
        reason: 'freezer',
        detail: 'In the freezer',
      })
    }
  }
  const rank: Record<MustEatReason, number> = { expired: 0, expiring: 1, freezer: 2 }
  return rows.sort((a, b) => rank[a.reason] - rank[b.reason] || a.name.localeCompare(b.name))
}
