import type { MealCell, MealSlot, Weekday, WeekPlan } from '../data/types'
import { MEAL_SLOTS, SLOT_LABELS, WEEKDAY_LABELS, WEEKDAYS } from '../data/types'

/** Caps at or under this many minutes count as a short meal. */
export const SHORT_MEAL_MINUTES = 30

export const PATTERN_NOTE = 'Kept short from your usual pattern'

const KEY_PREFIX = 'planora.timePatterns.v1.'

export interface ConstraintObservation {
  weekStart: string
  day: Weekday
  slot: MealSlot
  maxMinutes: number
}

export interface RecurringCap {
  day: Weekday
  slot: MealSlot
  maxMinutes: number
  weeks: number
}

interface PatternBlob {
  observations: ConstraintObservation[]
}

function empty(): PatternBlob {
  return { observations: [] }
}

function read(userId: string): PatternBlob {
  if (typeof localStorage === 'undefined') return empty()
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userId)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Partial<PatternBlob>
    return {
      observations: Array.isArray(parsed.observations) ? parsed.observations : [],
    }
  } catch {
    return empty()
  }
}

function write(userId: string, blob: PatternBlob) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(blob))
}

export function listObservations(userId: string): ConstraintObservation[] {
  return read(userId).observations.filter(
    (row) =>
      WEEKDAYS.includes(row.day) &&
      MEAL_SLOTS.includes(row.slot) &&
      typeof row.weekStart === 'string' &&
      typeof row.maxMinutes === 'number',
  )
}

/** Remember short caps from a saved week so later weeks can repeat them. */
export function recordWeekConstraints(userId: string, plan: WeekPlan): void {
  const blob = read(userId)
  const rest = blob.observations.filter((row) => row.weekStart !== plan.weekStart)
  const added: ConstraintObservation[] = []
  for (const cell of plan.cells) {
    const maxMinutes = cell.constraint?.maxMinutes
    if (maxMinutes == null || maxMinutes > SHORT_MEAL_MINUTES) continue
    added.push({ weekStart: plan.weekStart, day: cell.day, slot: cell.slot, maxMinutes })
  }
  const merged = [...rest, ...added]
  const weekStarts = [...new Set(merged.map((row) => row.weekStart))].sort()
  const keep = new Set(weekStarts.slice(-12))
  write(userId, { observations: merged.filter((row) => keep.has(row.weekStart)) })
}

/**
 * A weekday+slot is recurring when a short cap appears in at least two saved weeks.
 * The applied cap is the most recent short limit.
 */
export function inferRecurringCaps(
  observations: ConstraintObservation[],
  currentWeek?: WeekPlan | null,
): RecurringCap[] {
  let rows = observations.filter((row) => row.maxMinutes <= SHORT_MEAL_MINUTES)
  if (currentWeek) {
    rows = rows.filter((row) => row.weekStart !== currentWeek.weekStart)
    for (const cell of currentWeek.cells) {
      const maxMinutes = cell.constraint?.maxMinutes
      if (maxMinutes == null || maxMinutes > SHORT_MEAL_MINUTES) continue
      rows.push({
        weekStart: currentWeek.weekStart,
        day: cell.day,
        slot: cell.slot,
        maxMinutes,
      })
    }
  }

  const grouped = new Map<string, ConstraintObservation[]>()
  for (const row of rows) {
    const key = `${row.day}:${row.slot}`
    const list = grouped.get(key) ?? []
    list.push(row)
    grouped.set(key, list)
  }

  const caps: RecurringCap[] = []
  for (const [key, list] of grouped) {
    const byWeek = new Map<string, ConstraintObservation>()
    for (const row of list) byWeek.set(row.weekStart, row)
    if (byWeek.size < 2) continue
    const latest = [...byWeek.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart)).at(-1)
    if (!latest) continue
    const [day, slot] = key.split(':') as [Weekday, MealSlot]
    caps.push({ day, slot, maxMinutes: latest.maxMinutes, weeks: byWeek.size })
  }
  return caps.sort(
    (a, b) => WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day) || MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot),
  )
}

function joinAnd(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function describeAppliedPattern(
  cells: Pick<MealCell, 'day' | 'slot' | 'constraint'>[],
): string | null {
  const hits = cells.filter((cell) => cell.constraint?.note === PATTERN_NOTE && cell.constraint.maxMinutes != null)
  if (!hits.length) return null
  const grouped = new Map<MealSlot, Weekday[]>()
  for (const hit of hits) {
    const days = grouped.get(hit.slot) ?? []
    if (!days.includes(hit.day)) days.push(hit.day)
    grouped.set(hit.slot, days)
  }
  const parts = MEAL_SLOTS.filter((slot) => grouped.has(slot)).map((slot) => {
    const days = (grouped.get(slot) ?? []).slice().sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b))
    const label = days.length > 1 ? `${SLOT_LABELS[slot].toLowerCase()}s` : SLOT_LABELS[slot].toLowerCase()
    return `${joinAnd(days.map((day) => WEEKDAY_LABELS[day]))} ${label}`
  })
  if (!parts.length) return null
  return `${joinAnd(parts)} kept short from your usual pattern.`
}
