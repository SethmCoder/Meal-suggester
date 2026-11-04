import { describe, expect, it } from 'vitest'
import { extractCandidateLinks, parseRecipeHtml } from './recipeScrape'

describe('parseRecipeHtml', () => {
  it('reads schema.org Recipe JSON-LD', () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Recipe",
        "name": "Test Pasta",
        "image": "https://example.com/pasta.jpg",
        "prepTime": "PT10M",
        "cookTime": "PT20M",
        "recipeIngredient": ["200 g pasta", "1 tbsp olive oil"],
        "recipeInstructions": [
          { "@type": "HowToStep", "text": "Boil water." },
          { "@type": "HowToStep", "text": "Cook pasta." }
        ],
        "recipeCuisine": "Italian"
      }
      </script>
    </head><body></body></html>`

    const recipe = parseRecipeHtml(html, 'https://www.recipetineats.com/test-pasta', 'RecipeTin Eats')
    expect(recipe?.name).toBe('Test Pasta')
    expect(recipe?.ingredients).toHaveLength(2)
    expect(recipe?.instructions).toEqual(['Boil water.', 'Cook pasta.'])
    expect(recipe?.prepMinutes).toBe(10)
    expect(recipe?.cookMinutes).toBe(20)
    expect(recipe?.cuisineHint).toBe('Italian')
    expect(recipe?.categoryHint).toBeNull()
    expect(recipe?.sourcePageFetched).toBe(true)
  })
})

describe('extractCandidateLinks', () => {
  it('keeps publisher recipe links and drops assets/search/tag URLs', () => {
    const html = `
      <a href="/garlic-chicken-dinner/">Garlic Chicken</a>
      <a href="/tag/chicken/">Tag</a>
      <a href="https://other.com/recipe">Other</a>
      <a href="/?s=chicken">Search</a>
      <a href="/content/themes/x/logo.svg">Logo</a>
      <a href="/feed">Feed</a>
    `
    const links = extractCandidateLinks(html, 'https://www.recipetineats.com/?s=chicken', [
      'recipetineats.com',
    ])
    expect(links).toEqual(['https://www.recipetineats.com/garlic-chicken-dinner'])
  })
})
