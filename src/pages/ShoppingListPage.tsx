import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { RunningLowPanel } from '../components/RunningLowPanel'
import { ShoppingCoach } from '../components/ShoppingCoach'
import { ShoppingPanel } from '../components/ShoppingPanel'
import { Button, EmptyState } from '../components/ui'
import { useSession } from '../context/SessionContext'
import type { InventoryItem, MealFeedback, Preferences, WeekPlan } from '../data/types'
import { addWeeks, formatWeekRange, mondayOf } from '../lib/dates'
import { estimatePurchaseCost } from '../lib/finance'
import { buildShoppingList, ingredientKey } from '../lib/ingredients'
import { downloadShoppingList, loadOfflineShopping } from '../lib/offlineShopping'
import { optimizeWeekForShopping } from '../lib/optimizeShopping'
import { estimateIngredientPrices, requestDeviceLocation, type IngredientPrice, type NearbyStore } from '../lib/openPrices'
import {
  detectRunningLow,
  loadCachedRunningLow,
  loadDismissedRunningLow,
  refreshRunningLow,
  saveDismissedRunningLow,
  type RunningLowItem,
} from '../lib/runningLow'

export function ShoppingListPage() {
  const { store, profile, persistenceNote } = useSession()
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [week, setWeek] = useState<WeekPlan | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [feedback, setFeedback] = useState<MealFeedback[]>([])
  const [purchased, setPurchased] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [optimizeBusy, setOptimizeBusy] = useState(false)
  const [optimizeMessage, setOptimizeMessage] = useState<string | null>(null)
  const [runningLow, setRunningLow] = useState<RunningLowItem[]>([])
  const [runningLowBusy, setRunningLowBusy] = useState(false)
  const [runningLowMessage, setRunningLowMessage] = useState<string | null>(null)
  const [prices, setPrices] = useState<Record<string, IngredientPrice>>({})
  const [stores, setStores] = useState<NearbyStore[]>([])
  const [priceBusy, setPriceBusy] = useState(false)
  const [priceNote, setPriceNote] = useState<string | null>(null)
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(() => loadOfflineShopping()?.savedAt ?? null)

  const reload = useCallback(
    async (start: string) => {
      if (!store) return
      setLoading(true)
      setError(null)
      try {
        const [nextWeek, nextInventory, nextPrefs, nextFeedback, nextPurchased] = await Promise.all([
          store.getWeek(start),
          store.listInventory(),
          store.getPreferences(),
          store.listFeedback(),
          store.listPurchased(start),
        ])
        setWeek(nextWeek)
        setInventory(nextInventory)
        setPreferences(nextPrefs)
        setFeedback(nextFeedback)
        setPurchased(nextPurchased)
        await store.setLastWeekStart(start)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load the shopping list.')
      } finally {
        setLoading(false)
      }
    },
    [store],
  )

  useEffect(() => {
    if (!store || !profile) return
    let cancelled = false
    ;(async () => {
      let start = mondayOf(new Date())
      if (!profile.openOnCurrentWeek) {
        const last = await store.getLastWeekStart()
        if (last) start = last
      }
      if (!cancelled) {
        setWeekStart(start)
        await reload(start)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store, profile, reload])

  const plannedMeals = useMemo(() => {
    if (!week) return []
    return week.cells.filter((cell) => cell.meal).map((cell) => cell.meal!)
  }, [week])

  const shoppingRows = useMemo(
    () => buildShoppingList(plannedMeals, inventory, purchased),
    [plannedMeals, inventory, purchased],
  )

  const needKeys = useMemo(
    () => new Set(shoppingRows.filter((row) => row.status === 'missing').map((row) => row.key)),
    [shoppingRows],
  )

  const visibleRunningLow = useMemo(
    () => runningLow.filter((item) => !needKeys.has(item.key)),
    [runningLow, needKeys],
  )

  const needCount = shoppingRows.filter((row) => row.status !== 'purchased').length

  useEffect(() => {
    if (!profile || loading) return
    const cached = loadCachedRunningLow(weekStart, profile.id)
    if (cached) setRunningLow(cached)
  }, [profile, weekStart, loading])

  async function refreshLow(useAi: boolean) {
    if (!profile || !preferences) return
    setRunningLowBusy(true)
    setRunningLowMessage(null)
    try {
      if (!useAi) {
        const dismissed = new Set(loadDismissedRunningLow(weekStart, profile.id))
        setRunningLow(detectRunningLow(plannedMeals, inventory).filter((item) => !dismissed.has(item.key)))
        return
      }
      const result = await refreshRunningLow({
        meals: plannedMeals,
        inventory,
        preferences,
        weekStart,
        profileId: profile.id,
        excludeKeys: [...needKeys],
      })
      setRunningLow(result.items)
      setRunningLowMessage(result.reply)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh running-low staples.')
    } finally {
      setRunningLowBusy(false)
    }
  }

  useEffect(() => {
    if (!profile || !preferences || loading || !week) return
    const dismissed = new Set(loadDismissedRunningLow(weekStart, profile.id))
    setRunningLow(detectRunningLow(plannedMeals, inventory).filter((item) => !dismissed.has(item.key)))
  }, [profile, preferences, loading, week, weekStart, plannedMeals, inventory])

  async function optimize(goal?: string) {
    if (!store || !week || !preferences || optimizeBusy) return 'Plan meals before asking to shorten the list.'
    setOptimizeBusy(true)
    setOptimizeMessage(null)
    setError(null)
    try {
      const result = await optimizeWeekForShopping({
        week,
        inventory,
        preferences,
        feedback,
        goal,
      })
      setWeek(result.week)
      await store.saveWeek(result.week)
      setOptimizeMessage(result.reply)
      return result.reply
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not optimize meals for shopping.'
      setError(message)
      throw err
    } finally {
      setOptimizeBusy(false)
    }
  }

  async function loadNearbyPrices() {
    const targets = shoppingRows.filter((row) => row.status !== 'purchased')
    if (!targets.length) {
      setPriceNote('Nothing left to price.')
      return
    }
    setPriceBusy(true)
    setPriceNote(null)
    setError(null)
    try {
      const location = await requestDeviceLocation()
      const quote = await estimateIngredientPrices(
        targets.map((row) => ({ key: row.key, name: row.name })),
        location.lat,
        location.lon,
      )
      setPrices(quote.byKey)
      setStores(quote.stores)
      const priced = Object.values(quote.byKey).filter((item) => item.averageUsd != null).length
      setPriceNote(
        quote.stores.length
          ? `Compared ${quote.stores.length} nearby stores with Open Prices data. ${priced} ingredient${priced === 1 ? '' : 's'} have an average.`
          : `No priced grocery stores were found within ${quote.radiusKm} km, so averages use US community prices when a match exists.`,
      )
    } catch (err) {
      setPriceNote(err instanceof Error ? err.message : 'Could not load nearby prices.')
    } finally {
      setPriceBusy(false)
    }
  }

  function saveOffline() {
    downloadShoppingList({
      savedAt: new Date().toISOString(),
      weekLabel: formatWeekRange(weekStart),
      rows: shoppingRows,
      prices: Object.fromEntries(shoppingRows.map((row) => [row.key, prices[row.key]?.averageUsd ?? null])),
      storeNames: stores.map((storeItem) => `${storeItem.name}${storeItem.city ? ` (${storeItem.city})` : ''}`),
    })
    setOfflineSavedAt(new Date().toISOString())
  }

  const pricedTotal = shoppingRows.reduce((sum, row) => {
    if (row.status === 'purchased') return sum
    return sum + (prices[row.key]?.averageUsd ?? 0)
  }, 0)
  const pricedCount = shoppingRows.filter((row) => row.status !== 'purchased' && prices[row.key]?.averageUsd != null).length

  if (!store) return <p className="text-muted">Session unavailable.</p>

  return (
    <div data-tutorial="shopping" className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Shopping list</h1>
          <p className="mt-1 text-sm text-muted">
            Built from this week’s planned meals minus what you already have.
            {persistenceNote ? ` ${persistenceNote}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="px-3"
            onClick={() => {
              const next = addWeeks(weekStart, -1)
              setWeekStart(next)
              void reload(next)
            }}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="min-w-[180px] text-center text-sm font-semibold text-ink">{formatWeekRange(weekStart)}</p>
          <Button
            type="button"
            variant="ghost"
            className="px-3"
            onClick={() => {
              const next = addWeeks(weekStart, 1)
              setWeekStart(next)
              void reload(next)
            }}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <section className="soft-shadow rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink">Optimize for fewer groceries</h2>
            <p className="mt-1 text-sm text-muted">
              Adjust planned meals so ingredients are reused across the week, then refresh what you still need to buy.
            </p>
          </div>
          <Button type="button" onClick={() => void optimize()} disabled={optimizeBusy || loading || plannedMeals.length < 2}>
            <Sparkles className="h-4 w-4" />
            {optimizeBusy ? 'Optimizing…' : 'Optimize meals'}
          </Button>
        </div>
        {optimizeMessage ? <p className="mt-3 text-sm text-ink">{optimizeMessage}</p> : null}
        <p className="mt-3 text-xs text-muted">
          {plannedMeals.length
            ? `${plannedMeals.length} planned meal${plannedMeals.length === 1 ? '' : 's'} · ${needCount} shopping item${needCount === 1 ? '' : 's'}`
            : 'No meals planned yet.'}{' '}
          <Link to="/app" className="font-semibold text-primary hover:underline">
            Open Current Meals
          </Link>
        </p>
      </section>

      {loading || !week ? (
        <EmptyState title="Loading shopping list…" />
      ) : (
        <>
          <section className="soft-shadow rounded-2xl border border-line bg-surface p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-ink">Prices and offline list</h2>
                <p className="mt-1 text-sm text-muted">
                  Download a checklist you can open with no connection. Prices are community averages from{' '}
                  <a
                    href="https://prices.openfoodfacts.org/countries/United%20States"
                    className="font-semibold text-primary hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Food Facts Open Prices
                  </a>
                  , using grocery stores nearest to you when location is allowed.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" onClick={saveOffline} disabled={!shoppingRows.length}>
                  Download list
                </Button>
                <Button type="button" onClick={() => void loadNearbyPrices()} disabled={priceBusy || !shoppingRows.length}>
                  {priceBusy ? 'Finding stores…' : 'Estimate prices near me'}
                </Button>
              </div>
            </div>
            {pricedCount ? (
              <p className="mt-3 text-sm font-semibold text-ink">
                About ${pricedTotal.toFixed(2)} across {pricedCount} priced ingredient{pricedCount === 1 ? '' : 's'}
              </p>
            ) : null}
            {priceNote ? <p className="mt-2 text-sm text-ink">{priceNote}</p> : null}
            {offlineSavedAt ? (
              <p className="mt-2 text-xs text-muted">Last offline copy saved {new Date(offlineSavedAt).toLocaleString()}.</p>
            ) : null}
            {stores.length ? (
              <ul className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                {stores.map((item) => (
                  <li key={item.id} className="rounded-full border border-line px-2 py-1">
                    {item.name}
                    {item.city ? ` · ${item.city}` : ''} · {item.distanceKm} km
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
          <ShoppingCoach busy={optimizeBusy} onAsk={(goal) => optimize(goal)} />
          <ShoppingPanel
            rows={shoppingRows}
            prices={prices}
            onTogglePurchased={async (key, purchasedFlag) => {
              await store.setPurchased(weekStart, key, purchasedFlag)
              setPurchased(await store.listPurchased(weekStart))
              if (purchasedFlag) {
                const row = shoppingRows.find((item) => item.key === key)
                if (row) {
                  const qty = row.quantity && row.quantity > 0 ? row.quantity : 1
                  const unit = row.unit || 'piece'
                  await store.addPurchase({
                    name: row.name,
                    quantity: qty,
                    unit,
                    estimatedCostUsd: estimatePurchaseCost(row.name, qty, unit),
                    source: 'shopping',
                    ingredientKey: key,
                  })
                }
              }
            }}
            onAddToInventory={async (item) => {
              await store.upsertInventory(item)
              setInventory(await store.listInventory())
              const key = ingredientKey(item.name)
              await store.addPurchase({
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                estimatedCostUsd: estimatePurchaseCost(item.name, item.quantity, item.unit),
                source: 'inventory',
                ingredientKey: key,
              })
            }}
          />
          <RunningLowPanel
            items={visibleRunningLow}
            busy={runningLowBusy}
            message={runningLowMessage}
            onRefresh={() => void refreshLow(true)}
            onDismiss={(key) => {
              if (!profile) return
              const dismissed = new Set(loadDismissedRunningLow(weekStart, profile.id))
              dismissed.add(key)
              saveDismissedRunningLow(weekStart, profile.id, [...dismissed])
              setRunningLow((prev) => prev.filter((item) => item.key !== key))
            }}
            onMarkPurchased={(key) => {
              void (async () => {
                await store.setPurchased(weekStart, key, true)
                setPurchased(await store.listPurchased(weekStart))
                const item = visibleRunningLow.find((row) => row.key === key)
                if (item) {
                  await store.addPurchase({
                    name: item.name,
                    quantity: 1,
                    unit: 'piece',
                    estimatedCostUsd: estimatePurchaseCost(item.name, 1, 'piece'),
                    source: 'shopping',
                    ingredientKey: key,
                  })
                }
              })()
              if (!profile) return
              const dismissed = new Set(loadDismissedRunningLow(weekStart, profile.id))
              dismissed.add(key)
              saveDismissedRunningLow(weekStart, profile.id, [...dismissed])
              setRunningLow((prev) => prev.filter((item) => item.key !== key))
            }}
            onAddToInventory={async (item) => {
              await store.upsertInventory(item)
              setInventory(await store.listInventory())
              await store.addPurchase({
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                estimatedCostUsd: estimatePurchaseCost(item.name, item.quantity, item.unit),
                source: 'inventory',
                ingredientKey: ingredientKey(item.name),
              })
            }}
          />
        </>
      )}
    </div>
  )
}
