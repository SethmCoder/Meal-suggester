export function validateEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.'
  return null
}

export function validateUsername(username: string): string | null {
  if (!/^[a-zA-Z0-9_]{2,24}$/.test(username.trim())) {
    return 'Use 2–24 letters, numbers, or underscores.'
  }
  return null
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.'
  if (password.length > 72) return 'Use 72 characters or fewer.'
  return null
}

export function validateInventoryDraft(input: {
  name: string
  quantity: string
  unit: string
  expiresOn: string
}): string | null {
  if (!input.name.trim()) return 'Enter a food name.'
  const quantity = Number(input.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) return 'Quantity must be greater than zero.'
  if (!input.unit) return 'Choose a unit.'
  if (input.expiresOn && Number.isNaN(Date.parse(input.expiresOn))) return 'Enter a real expiration date.'
  return null
}
