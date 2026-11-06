import { describe, expect, it } from 'vitest'
import { emptyPreferences } from '../data/types'
import { acceptMeal, applyDislikes, emptyTaste, interpretClarification, noteReject, readReply } from './taste'

describe('taste', () => {
  it('reads a short reason', () => {
    expect(readReply('no mushrooms').disliked).toEqual(['mushroom'])
    expect(readReply('no mushrooms').note).toContain('mushroom')
    expect(readReply('faster').maxMinutes).toBe(30)
    expect(readReply('more like the salmon').focus).toEqual(['salmon'])
    expect(readReply('under 20 minutes').disliked).toEqual([])
  })

  it('remembers a taste after the second accepted meal', () => {
    const meal = {
      name: 'Grilled Salmon',
      ingredients: [{ name: 'salmon' }, { name: 'salt' }],
      cuisineHint: 'Japanese',
    }
    const first = acceptMeal(emptyTaste(), meal, emptyPreferences())
    expect(first.changed).toBe(false)
    expect(first.note).toContain('salmon')
    const second = acceptMeal(first.memory, meal, first.preferences)
    expect(second.changed).toBe(true)
    expect(second.preferences.favorites.map((item) => item.toLowerCase())).toContain('salmon')
    expect(second.preferences.cuisines.map((item) => item.toLowerCase())).toContain('japanese')
  })

  it('asks once when two rejects share an ingredient', () => {
    const first = noteReject(emptyTaste(), 'mushroom')
    expect(first.question).toBeNull()
    const second = noteReject(first.memory, 'mushroom')
    expect(second.question).toContain('mushroom')
    expect(interpretClarification('leave the mushroom out', 'mushroom')).toBe('ingredient')
    expect(interpretClarification('just this dish', 'mushroom')).toBe('dish')
  })

  it('saves a disliked ingredient and drops it from favorites', () => {
    const prefs = { ...emptyPreferences(), favorites: ['Mushroom'] }
    const next = applyDislikes(prefs, ['mushroom'])
    expect(next.changed).toBe(true)
    expect(next.preferences.disliked).toEqual(['Mushroom'])
    expect(next.preferences.favorites).toEqual([])
  })
})
