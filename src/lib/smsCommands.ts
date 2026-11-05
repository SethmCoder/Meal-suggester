import type { MealSlot, Weekday } from '../data/types'

export type SmsCommand =
  | { type: 'add'; name: string; quantity: number; unit: string }
  | { type: 'change'; day: Weekday; slot: MealSlot }
  | { type: 'help' }
  | { type: 'unknown' }

const DAY_WORDS: Record<string, Weekday> = {
  monday: 'monday',
  mon: 'monday',
  tuesday: 'tuesday',
  tue: 'tuesday',
  tues: 'tuesday',
  wednesday: 'wednesday',
  wed: 'wednesday',
  thursday: 'thursday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  friday: 'friday',
  fri: 'friday',
}

const SLOT_WORDS: Record<string, MealSlot> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
}

const UNIT_ALIASES: Record<string, string> = {
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  oz: 'oz',
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  cup: 'cup',
  cups: 'cup',
  piece: 'piece',
  pieces: 'piece',
  tsp: 'tsp',
  tbsp: 'tbsp',
}

export const SMS_HELP =
  'Text "add milk" or "add 2 lb chicken" to put it on this week\'s list. Text "different dinner Tuesday" to swap that meal. I will text the week grid back.'

export function toE164(input: string): string | null {
  const trimmed = input.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (trimmed.startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`
  return null
}

function titleName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function parseAdd(body: string): SmsCommand {
  const qty = body.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(.+)$/)
  if (qty) {
    const unitWord = (qty[2] ?? '').toLowerCase()
    const unit = UNIT_ALIASES[unitWord]
    if (unit) {
      return { type: 'add', quantity: Number(qty[1]), unit, name: titleName(qty[3]) }
    }
    if (!qty[2]) {
      return { type: 'add', quantity: Number(qty[1]), unit: 'piece', name: titleName(qty[3]) }
    }
    return { type: 'add', quantity: 1, unit: 'piece', name: titleName(body) }
  }
  const name = titleName(body)
  if (!name) return { type: 'unknown' }
  return { type: 'add', quantity: 1, unit: 'piece', name }
}

function parseChange(body: string): SmsCommand | null {
  const words = body.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  let day: Weekday | null = null
  let slot: MealSlot | null = null
  for (const word of words) {
    if (!day && DAY_WORDS[word]) day = DAY_WORDS[word]
    if (!slot && SLOT_WORDS[word]) slot = SLOT_WORDS[word]
  }
  if (!day || !slot) return null
  return { type: 'change', day, slot }
}

export function parseSmsCommand(raw: string): SmsCommand {
  const text = raw.trim().replace(/\s+/g, ' ')
  if (!text || /^(help|commands|\?)$/i.test(text)) return { type: 'help' }
  const add = text.match(/^add\s+(.+)$/i)
  if (add) return parseAdd(add[1] ?? '')
  const change = text.match(/^(?:different|change|swap|replace|new)\s+(.+)$/i)
  if (change) return parseChange(change[1] ?? '') ?? { type: 'unknown' }
  return { type: 'unknown' }
}
