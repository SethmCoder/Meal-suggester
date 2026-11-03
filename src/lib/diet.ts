import { ingredientKey } from './ingredients'

const ALLERGY_EXPANSIONS: Record<string, string[]> = {
  dairy: ['dairy', 'milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'whey', 'casein', 'ghee'],
  milk: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'whey', 'casein', 'ghee'],
  peanut: ['peanut', 'groundnut'],
  peanuts: ['peanut', 'groundnut'],
  'tree nut': ['almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'macadamia'],
  'tree nuts': ['almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'macadamia'],
  egg: ['egg', 'mayonnaise', 'mayo'],
  eggs: ['egg', 'mayonnaise', 'mayo'],
  soy: ['soy', 'soya', 'tofu', 'edamame', 'miso', 'tempeh'],
  shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'mussel', 'clam', 'oyster', 'scallop'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'anchovy', 'sardine', 'tilapia'],
  gluten: ['gluten', 'wheat', 'barley', 'rye', 'flour', 'pasta', 'bread', 'noodle'],
  wheat: ['wheat', 'flour', 'bread', 'pasta', 'noodle'],
  sesame: ['sesame', 'tahini'],
}

const MEAT = ['chicken', 'beef', 'pork', 'lamb', 'bacon', 'ham', 'turkey', 'sausage', 'steak', 'veal', 'duck', 'prosciutto', 'chorizo', 'pepperoni']
const FISH = ['fish', 'salmon', 'tuna', 'cod', 'anchovy', 'sardine', 'tilapia', 'trout', 'haddock']
const SHELLFISH = ['shrimp', 'prawn', 'crab', 'lobster', 'mussel', 'clam', 'oyster', 'scallop']
const DAIRY = ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'ghee', 'whey']
const EGG = ['egg', 'mayonnaise', 'mayo']
const GLUTEN = ['wheat', 'barley', 'rye', 'flour', 'pasta', 'bread', 'noodle', 'couscous', 'tortilla']
const PORK = ['pork', 'bacon', 'ham', 'prosciutto', 'lard']
const ALCOHOL = ['wine', 'beer', 'rum', 'vodka', 'whisky', 'whiskey', 'brandy', 'sake']

function wordsOf(value: string): string[] {
  return ingredientKey(value).split(' ').filter(Boolean)
}

export function containsTerm(value: string, term: string): boolean {
  const words = wordsOf(value)
  const termWords = term.toLowerCase().split(/\s+/).filter(Boolean)
  if (!termWords.length || !words.length) return false
  if (termWords.length === 1) return words.includes(termWords[0])
  return words.join(' ').includes(termWords.join(' '))
}

function tokensFor(raw: string): string[] {
  const key = ingredientKey(raw)
  if (!key) return []
  if (ALLERGY_EXPANSIONS[key]) return ALLERGY_EXPANSIONS[key]
  for (const [name, tokens] of Object.entries(ALLERGY_EXPANSIONS)) {
    if (key === name || key.includes(name)) return tokens
  }
  return [key]
}

function haystackHas(values: string[], term: string): boolean {
  return values.some((value) => containsTerm(value, term))
}

export function allergyConflict(ingredientNames: string[], mealName: string, allergies: string[]): string | null {
  const values = [mealName, ...ingredientNames]
  for (const allergy of allergies) {
    for (const token of tokensFor(allergy)) {
      if (token.length < 3) continue
      if (haystackHas(values, token)) return allergy
    }
  }
  return null
}

export function dietConflict(ingredientNames: string[], mealName: string, dietary: string[]): string | null {
  const values = [mealName, ...ingredientNames]
  const has = (words: string[]) => words.some((word) => haystackHas(values, word))
  for (const rule of dietary) {
    const name = rule.toLowerCase()
    if (name.includes('vegan')) {
      if (has([...MEAT, ...FISH, ...SHELLFISH, ...DAIRY, ...EGG, 'honey', 'gelatin'])) return rule
    } else if (name.includes('vegetarian')) {
      if (has([...MEAT, ...FISH, ...SHELLFISH])) return rule
    } else if (name.includes('pescatarian')) {
      if (has(MEAT)) return rule
    } else if (name.includes('gluten')) {
      if (has(GLUTEN)) return rule
    } else if (name.includes('dairy')) {
      if (has(DAIRY)) return rule
    } else if ((name.includes('halal') || name.includes('kosher')) && (has(PORK) || has(ALCOHOL))) {
      return rule
    }
  }
  return null
}

export function dislikedConflict(ingredientNames: string[], mealName: string, disliked: string[]): string | null {
  const values = [mealName, ...ingredientNames]
  for (const item of disliked) {
    const key = ingredientKey(item)
    if (!key || key.length < 3) continue
    if (haystackHas(values, key)) return item
  }
  return null
}
