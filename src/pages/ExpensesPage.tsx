import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Loader2, ReceiptText } from 'lucide-react'
import { Badge, Button, EmptyState } from '../components/ui'
import { useSession } from '../context/SessionContext'
import { addLedgerReceipt, listLedgerReceipts } from '../data/ledgerStorage'
import type { Consumption, InventoryItem, MealSlot, Purchase, Receipt, Weekday } from '../data/types'
import { MEAL_SLOTS, SLOT_LABELS, WEEKDAY_LABELS, WEEKDAYS } from '../data/types'
import { expiryStatus, formatWeekRange, todayISO } from '../lib/dates'
import { roundMoney } from '../lib/finance'
import { formatQuantity } from '../lib/ingredients'
import { receiptFromScan, scanReceiptPhoto } from '../lib/receipts'
import { fileToDataUrl } from '../lib/vision'
import { cn } from '../lib/cn'

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function sourceLabel(source: Purchase['source']) {
  if (source === 'shopping') return 'Shopping list'
  if (source === 'inventory') return 'Inventory'
  return 'Manual'
}

interface WeekMeal {
  day: Weekday
  slot: MealSlot
  name: string
}

interface WeekBlock {
  weekStart: string
  subtotalUsd: number
  receipts: Receipt[]
}

function groupReceipts(receipts: Receipt[]): WeekBlock[] {
  const map = new Map<string, Receipt[]>()
  for (const receipt of receipts) {
    const list = map.get(receipt.weekStart) ?? []
    list.push(receipt)
    map.set(receipt.weekStart, list)
  }
  return [...map.entries()]
    .map(([weekStart, rows]) => ({
      weekStart,
      receipts: rows.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt)),
      subtotalUsd: roundMoney(rows.reduce((sum, row) => sum + row.subtotalUsd, 0)),
    }))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
}

export function ExpensesPage() {
  const { store, profile, persistenceNote } = useSession()
  const uploadRef = useRef<HTMLInputElement>(null)
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [consumptions, setConsumptions] = useState<Consumption[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scanNote, setScanNote] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set())
  const [weekMeals, setWeekMeals] = useState<Record<string, WeekMeal[]>>({})
  const [weekError, setWeekError] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!store || !profile) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [next, used, stock] = await Promise.all([
          store.listPurchases(),
          store.listConsumptions(),
          store.listInventory(),
        ])
        if (!cancelled) {
          setPurchases(next)
          setConsumptions(used)
          setInventory(stock)
          setReceipts(listLedgerReceipts(profile.id))
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load expenses.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store, profile])

  const blocks = useMemo(() => groupReceipts(receipts), [receipts])
  const receiptTotal = useMemo(
    () => roundMoney(receipts.reduce((sum, row) => sum + row.subtotalUsd, 0)),
    [receipts],
  )
  const purchaseTotal = useMemo(
    () => roundMoney(purchases.reduce((sum, row) => sum + (row.estimatedCostUsd ?? 0), 0)),
    [purchases],
  )
  const expiredItems = useMemo(() => {
    const today = todayISO()
    return inventory.filter((item) => expiryStatus(item.expiresOn, today) === 'expired')
  }, [inventory])

  async function loadWeekMeals(weekStart: string) {
    if (weekMeals[weekStart] || !store) return
    try {
      const plan = await store.getWeek(weekStart)
      const meals = WEEKDAYS.flatMap((day) =>
        MEAL_SLOTS.map((slot) => {
          const cell = plan.cells.find((item) => item.day === day && item.slot === slot)
          if (!cell?.meal) return null
          return { day, slot, name: cell.meal.name }
        }),
      ).filter((meal): meal is WeekMeal => Boolean(meal))
      setWeekMeals((prev) => ({ ...prev, [weekStart]: meals }))
    } catch (err) {
      setWeekError((prev) => ({
        ...prev,
        [weekStart]: err instanceof Error ? err.message : 'Could not load that week.',
      }))
    }
  }

  async function toggleWeek(weekStart: string) {
    const opening = !openWeeks.has(weekStart)
    setOpenWeeks((prev) => {
      const next = new Set(prev)
      if (next.has(weekStart)) next.delete(weekStart)
      else next.add(weekStart)
      return next
    })
    if (opening) await loadWeekMeals(weekStart)
  }

  async function onUpload(file: File | null) {
    if (!file || !profile) return
    if (!file.type.startsWith('image/')) {
      setError('Choose a receipt photo (JPG, PNG, or WebP).')
      return
    }
    setScanning(true)
    setError(null)
    setScanNote(null)
    try {
      const imageDataUrl = await fileToDataUrl(file, { maxEdge: 900, quality: 0.58 })
      const scan = await scanReceiptPhoto(imageDataUrl)
      const receipt = receiptFromScan({ scan, imageDataUrl })
      if (!receipt) {
        setError('Could not find a pre-tax subtotal. The tax-inclusive total was not saved.')
        return
      }
      const saved = addLedgerReceipt(profile.id, receipt)
      setReceipts(listLedgerReceipts(profile.id))
      setOpenWeeks((prev) => new Set(prev).add(saved.weekStart))
      void loadWeekMeals(saved.weekStart)
      setScanNote(
        saved.imageDataUrl
          ? `Saved $${saved.subtotalUsd.toFixed(2)} before tax${saved.merchant ? ` from ${saved.merchant}` : ''}.`
          : `Saved $${saved.subtotalUsd.toFixed(2)} before tax. The photo was left off because browser storage is full.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that receipt.')
    } finally {
      setScanning(false)
      if (uploadRef.current) uploadRef.current.value = ''
    }
  }

  if (!store || !profile) return <p className="text-muted">Session unavailable.</p>

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          <Link to="/app/inventory" className="text-primary hover:underline">
            Food inventory
          </Link>
          <span className="mx-1.5 text-line">/</span>
          Expenses
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Expenses</h1>
        <p className="mt-1 text-sm text-muted">
          Receipt totals are the pre-tax subtotal. Tax is left out of what you spent.
          {persistenceNote ? ` ${persistenceNote}` : ''}
        </p>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {scanNote ? <p className="text-sm text-ink">{scanNote}</p> : null}

      <section className="soft-shadow rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">What I spent</h2>
            <p className="mt-1 text-sm text-muted">
              {blocks.length
                ? `${blocks.length} week${blocks.length === 1 ? '' : 's'} with receipt${receipts.length === 1 ? '' : 's'}`
                : 'Upload a receipt to start a week block'}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <p className="text-right">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted">Pre-tax total</span>
              <span className="text-2xl font-bold text-ink">${receiptTotal.toFixed(2)}</span>
            </p>
            <div>
              <input
                ref={uploadRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(event) => void onUpload(event.target.files?.[0] ?? null)}
              />
              <Button type="button" onClick={() => uploadRef.current?.click()} disabled={scanning}>
                {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
                {scanning ? 'Reading receipt…' : 'Upload receipt photo'}
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {loading ? (
            <p className="text-sm text-muted">Loading receipts…</p>
          ) : !blocks.length ? (
            <EmptyState
              title="No receipts yet"
              body="Upload a grocery receipt. Planora stores the subtotal before tax, then you can expand the week to see meals and the photo."
            />
          ) : (
            blocks.map((block) => {
              const open = openWeeks.has(block.weekStart)
              const meals = weekMeals[block.weekStart]
              return (
                <div key={block.weekStart} className="rounded-xl border border-line bg-canvas/40">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                    aria-expanded={open}
                    onClick={() => void toggleWeek(block.weekStart)}
                  >
                    <span className="min-w-0">
                      <span className="block text-lg font-bold text-ink">${block.subtotalUsd.toFixed(2)}</span>
                      <span className="mt-0.5 block text-sm text-muted">
                        {formatWeekRange(block.weekStart)}
                        {block.receipts.length === 1
                          ? ` · ${formatWhen(block.receipts[0].purchasedAt)}`
                          : ` · ${block.receipts.length} receipts`}
                        {block.receipts.length === 1 && block.receipts[0].merchant
                          ? ` · ${block.receipts[0].merchant}`
                          : ''}
                      </span>
                    </span>
                    <ChevronDown className={cn('h-5 w-5 shrink-0 text-muted transition', open && 'rotate-180')} />
                  </button>
                  {open ? (
                    <div className="space-y-4 border-t border-line px-3 py-3">
                      <div>
                        <h3 className="text-sm font-semibold text-ink">Meals that week</h3>
                        {weekError[block.weekStart] ? (
                          <p className="mt-1 text-sm text-danger">{weekError[block.weekStart]}</p>
                        ) : !meals ? (
                          <p className="mt-1 text-sm text-muted">Loading meals…</p>
                        ) : meals.length ? (
                          <ul className="mt-2 space-y-1 text-sm text-muted">
                            {meals.map((meal) => (
                              <li key={`${meal.day}-${meal.slot}`}>
                                <span className="font-medium text-ink">
                                  {WEEKDAY_LABELS[meal.day]} {SLOT_LABELS[meal.slot]}:
                                </span>{' '}
                                {meal.name}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-sm text-muted">No saved meals for this week.</p>
                        )}
                      </div>
                      {block.receipts.map((receipt) => (
                        <div key={receipt.id} className="rounded-xl border border-line bg-surface p-3">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="font-semibold text-ink">
                              {receipt.merchant || 'Receipt'} · ${receipt.subtotalUsd.toFixed(2)} before tax
                            </p>
                            <p className="text-xs text-muted">{formatWhen(receipt.purchasedAt)}</p>
                          </div>
                          {receipt.taxUsd != null ? (
                            <p className="mt-1 text-xs text-muted">Tax ${receipt.taxUsd.toFixed(2)} was not included.</p>
                          ) : null}
                          {receipt.lineItems.length ? (
                            <ul className="mt-2 space-y-1 text-sm text-muted">
                              {receipt.lineItems.map((line, index) => (
                                <li key={`${receipt.id}-${index}`} className="flex justify-between gap-3">
                                  <span>{line.name}</span>
                                  <span>{line.priceUsd != null ? `$${line.priceUsd.toFixed(2)}` : '—'}</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {receipt.imageDataUrl ? (
                            <img
                              src={receipt.imageDataUrl}
                              alt={receipt.merchant ? `Receipt from ${receipt.merchant}` : 'Receipt photo'}
                              className="mt-3 max-h-80 w-full rounded-xl object-contain ring-1 ring-line"
                            />
                          ) : (
                            <p className="mt-2 text-xs text-muted">Receipt photo was not stored.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </section>

      <section className="soft-shadow rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="text-lg font-bold text-ink">Used from inventory</h2>
        <p className="mt-1 text-sm text-muted">
          Ingredients already deducted when a meal was marked finished. These amounts are not prices.
        </p>
        {loading ? (
          <p className="mt-3 text-sm text-muted">Loading inventory use…</p>
        ) : consumptions.length ? (
          <ul className="mt-4 space-y-2">
            {consumptions.slice(0, 20).map((entry) => (
              <li key={entry.id} className="rounded-xl border border-line bg-canvas/40 p-3">
                <p className="font-semibold text-ink">
                  {entry.mealName}
                  <span className="ml-2 text-sm font-normal text-muted">
                    {WEEKDAY_LABELS[entry.day]} {SLOT_LABELS[entry.slot]}
                  </span>
                </p>
                {entry.items.length ? (
                  <ul className="mt-1 text-sm text-muted">
                    {entry.items.map((item, index) => (
                      <li key={`${entry.id}-${index}`}>
                        {formatQuantity(item.quantity, item.unit)} {item.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-muted">{entry.note || 'No inventory was deducted.'}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">No meals have been marked finished yet.</p>
        )}
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-ink">Expired in inventory</h3>
          {expiredItems.length ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {expiredItems.map((item) => (
                <li key={item.id}>
                  <Badge tone="danger">
                    {item.name}
                    {item.expiresOn ? ` · ${item.expiresOn}` : ''}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted">Nothing in inventory is past its expiration date.</p>
          )}
        </div>
      </section>

      <section className="soft-shadow rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">Ingredient purchases</h2>
            <p className="mt-1 text-sm text-muted">
              {purchases.length
                ? `${purchases.length} purchase${purchases.length === 1 ? '' : 's'} logged from the shopping list`
                : 'No ingredient purchases yet'}
            </p>
          </div>
          <p className="text-right">
            <span className="block text-xs font-semibold uppercase tracking-wide text-muted">Est. total</span>
            <span className="text-2xl font-bold text-ink">${purchaseTotal.toFixed(2)}</span>
          </p>
        </div>

        <div className="mt-4 space-y-2">
          {loading ? (
            <p className="text-sm text-muted">Loading purchases…</p>
          ) : !purchases.length ? (
            <EmptyState
              title="No ingredient purchases yet"
              body="Mark items purchased on your shopping list to build this ledger."
            />
          ) : (
            purchases.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-2 rounded-xl border border-line bg-canvas/40 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{row.name}</p>
                    <Badge tone="neutral">{sourceLabel(row.source)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {formatQuantity(row.quantity, row.unit)} · {formatWhen(row.purchasedAt)}
                  </p>
                </div>
                <p className="text-sm font-semibold text-ink">
                  {row.estimatedCostUsd != null ? `$${row.estimatedCostUsd.toFixed(2)}` : '—'}
                </p>
              </div>
            ))
          )}
        </div>

        <p className="mt-4 text-xs text-muted">
          Ingredient costs are package-based estimates, separate from receipt subtotals.{' '}
          <Link to="/app/shopping" className="font-semibold text-primary hover:underline">
            Open shopping list
          </Link>
        </p>
      </section>
    </div>
  )
}
