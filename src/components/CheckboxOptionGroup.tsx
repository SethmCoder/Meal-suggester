import { useMemo, useState } from 'react'
import { FieldLabel, TextInput } from './ui'
import { mergeKnownAndOther, splitKnownAndOther } from '../lib/preferenceOptions'

interface CheckboxOptionGroupProps {
  label: string
  options: readonly string[]
  values: string[]
  onChange: (next: string[]) => void
  hint?: string
  otherPlaceholder?: string
}

export function CheckboxOptionGroup({
  label,
  options,
  values,
  onChange,
  hint,
  otherPlaceholder = 'Other (comma-separated)',
}: CheckboxOptionGroupProps) {
  const { known, other } = useMemo(() => splitKnownAndOther(values, options), [values, options])
  const [otherFocused, setOtherFocused] = useState(false)
  const [otherDraft, setOtherDraft] = useState('')
  const otherText = otherFocused ? otherDraft : other.join(', ')

  function setKnown(nextKnown: string[]) {
    onChange(mergeKnownAndOther(nextKnown, otherFocused ? otherDraft : other.join(', '), options))
  }

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {hint ? <p className="mb-2 text-xs text-muted">{hint}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const checked = known.includes(option)
          return (
            <label
              key={option}
              className="flex items-center gap-2 rounded-xl border border-line bg-canvas/40 px-3 py-2 text-sm text-ink"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) =>
                  setKnown(e.target.checked ? [...known, option] : known.filter((item) => item !== option))
                }
              />
              <span className="font-medium">{option}</span>
            </label>
          )
        })}
      </div>
      <div className="mt-2">
        <FieldLabel htmlFor={`${label}-other`}>Other</FieldLabel>
        <TextInput
          id={`${label}-other`}
          value={otherText}
          onFocus={() => {
            setOtherDraft(other.join(', '))
            setOtherFocused(true)
          }}
          onChange={(e) => {
            setOtherDraft(e.target.value)
            onChange(mergeKnownAndOther(known, e.target.value, options))
          }}
          onBlur={() => setOtherFocused(false)}
          placeholder={otherPlaceholder}
        />
      </div>
    </div>
  )
}
