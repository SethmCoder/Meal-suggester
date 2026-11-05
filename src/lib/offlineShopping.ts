import type { ShoppingRow } from './ingredients'
import { formatQuantity } from './ingredients'

const CACHE_KEY = 'planora.offlineShopping.v1'

export interface OfflineShoppingSnapshot {
  savedAt: string
  weekLabel: string
  rows: ShoppingRow[]
  prices: Record<string, number | null>
  storeNames: string[]
}

export function saveOfflineShopping(snapshot: OfflineShoppingSnapshot) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot))
}

export function loadOfflineShopping(): OfflineShoppingSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as OfflineShoppingSnapshot
    if (!parsed || !Array.isArray(parsed.rows)) return null
    return parsed
  } catch {
    return null
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function shoppingListHtml(snapshot: OfflineShoppingSnapshot): string {
  const items = snapshot.rows
    .map((row) => {
      const price = snapshot.prices[row.key]
      const priceText = price != null ? `$${price.toFixed(2)} avg` : ''
      const qty = formatQuantity(row.quantity, row.unit)
      const meals = row.mealNames.length ? `For ${row.mealNames.join(', ')}` : ''
      return `<li><label><input type="checkbox" ${row.status === 'purchased' ? 'checked' : ''}/> <strong>${escapeHtml(row.name)}</strong> ${escapeHtml(qty)} <span>${escapeHtml(priceText)}</span><br/><small>${escapeHtml(meals)}</small></label></li>`
    })
    .join('')
  const stores = snapshot.storeNames.length
    ? `<p>Nearby stores: ${escapeHtml(snapshot.storeNames.join(', '))}</p>`
    : ''
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Planora shopping list</title>
<style>
  body { font-family: Inter, system-ui, sans-serif; margin: 24px; color: #0e1525; }
  h1 { font-size: 1.5rem; }
  li { list-style: none; margin: 0 0 12px; padding: 12px; border: 1px solid #e1e7f0; border-radius: 12px; }
  ul { padding: 0; }
  small { color: #5c6b80; }
  span { color: #035bff; font-weight: 600; }
</style>
<h1>Planora shopping list</h1>
<p>${escapeHtml(snapshot.weekLabel)} · saved ${escapeHtml(new Date(snapshot.savedAt).toLocaleString())}</p>
${stores}
<p>Check items off as you shop. This file works without internet.</p>
<ul>${items || '<li>Nothing to buy.</li>'}</ul>
<p><small>Prices, when shown, are community averages from Open Food Facts Open Prices.</small></p>
</html>`
}

export function downloadShoppingList(snapshot: OfflineShoppingSnapshot) {
  saveOfflineShopping(snapshot)
  const blob = new Blob([shoppingListHtml(snapshot)], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'planora-shopping-list.html'
  link.click()
  URL.revokeObjectURL(url)
}
