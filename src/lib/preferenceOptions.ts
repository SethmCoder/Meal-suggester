/** Common options for preference checkboxes. Stored values stay plain strings. */

export const COMMON_ALLERGIES = [
  'Peanuts',
  'Tree nuts',
  'Milk',
  'Eggs',
  'Fish',
  'Shellfish',
  'Soy',
  'Wheat',
  'Sesame',
  'Gluten',
] as const

export const COMMON_DIETARY = [
  'Vegetarian',
  'Vegan',
  'Pescatarian',
  'Gluten-free',
  'Dairy-free',
  'Halal',
  'Kosher',
  'Keto',
  'Low-carb',
  'Paleo',
] as const

export const COMMON_CUISINES = [
  'Italian',
  'Mexican',
  'Chinese',
  'Japanese',
  'Indian',
  'Thai',
  'American',
  'Mediterranean',
  'French',
  'Korean',
  'Middle Eastern',
  'Greek',
] as const

export function splitKnownAndOther(values: string[], options: readonly string[]) {
  const known: string[] = []
  const other: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    const match = options.find((option) => option.toLowerCase() === trimmed.toLowerCase())
    if (match) {
      if (!known.includes(match)) known.push(match)
    } else if (!other.includes(trimmed)) {
      other.push(trimmed)
    }
  }
  return { known, other }
}

export function mergeKnownAndOther(known: string[], otherText: string, options: readonly string[]) {
  const selected = options.filter((option) => known.includes(option))
  const extras = otherText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !options.some((option) => option.toLowerCase() === item.toLowerCase()))
  return [...selected, ...extras]
}
