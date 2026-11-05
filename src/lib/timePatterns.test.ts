import { describe, expect, it } from 'vitest'
import { normalizeWeek } from './meals'
import { describeAppliedPattern, inferRecurringCaps, PATTERN_NOTE } from './timePatterns'

describe('inferRecurringCaps', () => {
  it('requires the same slot to be short in two saved weeks', () => {
    expect(
      inferRecurringCaps([{ weekStart: '2026-10-26', day: 'monday', slot: 'dinner', maxMinutes: 25 }]),
    ).toEqual([])

    expect(
      inferRecurringCaps([
        { weekStart: '2026-10-19', day: 'monday', slot: 'dinner', maxMinutes: 30 },
        { weekStart: '2026-10-26', day: 'monday', slot: 'dinner', maxMinutes: 20 },
      ]),
    ).toEqual([{ day: 'monday', slot: 'dinner', maxMinutes: 20, weeks: 2 }])
  })

  it('ignores limits above the short threshold', () => {
    expect(
      inferRecurringCaps([
        { weekStart: '2026-10-19', day: 'monday', slot: 'dinner', maxMinutes: 45 },
        { weekStart: '2026-10-26', day: 'monday', slot: 'dinner', maxMinutes: 20 },
      ]),
    ).toEqual([])
  })

  it('counts the week currently on screen', () => {
    const current = normalizeWeek('2026-11-02', [
      {
        day: 'wednesday',
        slot: 'dinner',
        meal: null,
        constraint: { maxMinutes: 25, note: '' },
        finished: false,
      },
    ])
    expect(
      inferRecurringCaps(
        [{ weekStart: '2026-10-26', day: 'wednesday', slot: 'dinner', maxMinutes: 30 }],
        current,
      ),
    ).toEqual([{ day: 'wednesday', slot: 'dinner', maxMinutes: 25, weeks: 2 }])
  })
})

describe('describeAppliedPattern', () => {
  it('names the weekdays that were kept short', () => {
    expect(
      describeAppliedPattern([
        { day: 'monday', slot: 'dinner', constraint: { maxMinutes: 30, note: PATTERN_NOTE } },
        { day: 'wednesday', slot: 'dinner', constraint: { maxMinutes: 30, note: PATTERN_NOTE } },
      ]),
    ).toBe('Monday and Wednesday dinners kept short from your usual pattern.')
  })
})
