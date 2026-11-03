export function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

export function todayISO(date = new Date()): string {
  return toISODate(date)
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

export function mondayOf(date: Date): string {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const weekday = copy.getDay()
  const diff = weekday === 0 ? -6 : 1 - weekday
  copy.setDate(copy.getDate() + diff)
  return toISODate(copy)
}

export function addWeeks(isoMonday: string, weeks: number): string {
  return addDays(isoMonday, weeks * 7)
}

export function formatLongDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function formatWeekRange(weekStart: string): string {
  const start = parseISODate(weekStart)
  const end = parseISODate(addDays(weekStart, 4))
  const sameMonth = start.getMonth() === end.getMonth()
  const sameYear = start.getFullYear() === end.getFullYear()
  const startText = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  }).format(start)
  const endText = new Intl.DateTimeFormat('en-US', {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(end)
  if (sameMonth) {
    const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(start)
    return `${month} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`
  }
  return `${startText} – ${endText}`
}

export function formatDayHeading(weekStart: string, index: number): { weekday: string; date: string } {
  const date = parseISODate(addDays(weekStart, index))
  return {
    weekday: new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date),
    date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date),
  }
}

export function expiryStatus(expiresOn: string | null, today: string): 'none' | 'fresh' | 'soon' | 'expired' {
  if (!expiresOn) return 'none'
  const days = Math.round((parseISODate(expiresOn).getTime() - parseISODate(today).getTime()) / 86_400_000)
  if (days < 0) return 'expired'
  if (days <= 3) return 'soon'
  return 'fresh'
}
