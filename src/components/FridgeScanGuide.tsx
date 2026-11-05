import { useRef, useState } from 'react'
import type { FridgeLayout, FridgeZone } from '../lib/fridgeLayouts'
import { FRIDGE_LAYOUTS } from '../lib/fridgeLayouts'
import { fileToDataUrl, scanFoodPhoto, type ScannedFoodDraft } from '../lib/vision'
import { ingredientKey } from '../lib/ingredients'
import { Button } from './ui'

interface FridgeScanGuideProps {
  onDrafts: (items: ScannedFoodDraft[], summary: string) => void
  onSkip: () => void
}

export function FridgeScanGuide({ onDrafts, onSkip }: FridgeScanGuideProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const [layout, setLayout] = useState<FridgeLayout | null>(null)
  const [activeZone, setActiveZone] = useState<FridgeZone | null>(null)
  const [shots, setShots] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filled = layout ? layout.zones.filter((zone) => shots[zone.id]).length : 0

  async function onFile(file: File | null) {
    if (!file || !activeZone) return
    if (!file.type.startsWith('image/')) {
      setError('Choose a photo.')
      return
    }
    const dataUrl = await fileToDataUrl(file, { maxEdge: 900, quality: 0.6 })
    setShots((prev) => ({ ...prev, [activeZone.id]: dataUrl }))
    setActiveZone(null)
    setError(null)
  }

  async function readShots() {
    if (!layout) return
    setBusy(true)
    setError(null)
    try {
      const merged = new Map<string, ScannedFoodDraft>()
      const notes: string[] = []
      for (const zone of layout.zones) {
        const dataUrl = shots[zone.id]
        if (!dataUrl) continue
        const result = await scanFoodPhoto({ dataUrl, scene: zone.scene, zoneLabel: zone.label })
        if (result.summary) notes.push(`${zone.label}: ${result.summary}`)
        for (const item of result.items) {
          const key = ingredientKey(item.name)
          const existing = merged.get(key)
          if (!existing || item.confidence === 'high') merged.set(key, item)
        }
      }
      onDrafts([...merged.values()], notes.join(' ') || 'Read the fridge photos.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read those photos.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          void onFile(event.target.files?.[0] ?? null)
          event.target.value = ''
        }}
      />
      {!layout ? (
        <>
          <p className="text-sm text-muted">Choose the refrigerator you have. Each bubble is a photo the scan needs.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {FRIDGE_LAYOUTS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setLayout(option)}
                className="rounded-xl border border-line bg-canvas/40 px-3 py-3 text-left transition hover:border-primary"
              >
                <span className="block font-semibold text-ink">{option.label}</span>
                <span className="mt-1 block text-xs text-muted">{option.blurb}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink">
              {layout.label}: {filled} of {layout.zones.length} photos
            </p>
            <button type="button" className="text-sm font-semibold text-primary" onClick={() => setLayout(null)}>
              Different fridge
            </button>
          </div>
          <FridgeDiagram
            layout={layout}
            shots={shots}
            onPick={(zone) => {
              setActiveZone(zone)
              cameraRef.current?.click()
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy || filled === 0} onClick={() => void readShots()}>
              {busy ? 'Reading photos…' : 'Read these photos'}
            </Button>
            <Button type="button" variant="ghost" onClick={onSkip}>
              Take one photo instead
            </Button>
          </div>
        </>
      )}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  )
}

function FridgeDiagram({
  layout,
  shots,
  onPick,
}: {
  layout: FridgeLayout
  shots: Record<string, string>
  onPick: (zone: FridgeZone) => void
}) {
  const split = layout.id === 'side-by-side' || layout.id === 'french-door'
  return (
    <div className="mx-auto w-full max-w-xs">
      <svg viewBox="0 0 200 320" className="w-full" role="img" aria-label={`${layout.label} photo targets`}>
        <rect x="16" y="12" width="168" height="296" rx="12" fill="#f4f7fb" stroke="#0b1f4d" strokeWidth="3" />
        {split ? <line x1="100" y1="20" x2="100" y2="300" stroke="#0b1f4d" strokeWidth="2" /> : null}
        {layout.id === 'top-freezer' ? <line x1="24" y1="88" x2="176" y2="88" stroke="#0b1f4d" strokeWidth="2" /> : null}
        {layout.id === 'bottom-freezer' ? <line x1="24" y1="220" x2="176" y2="220" stroke="#0b1f4d" strokeWidth="2" /> : null}
        {layout.id === 'french-door' ? <line x1="24" y1="230" x2="176" y2="230" stroke="#0b1f4d" strokeWidth="2" /> : null}
        {layout.zones.map((zone) => {
          const done = Boolean(shots[zone.id])
          return (
            <g key={zone.id} onClick={() => onPick(zone)} className="cursor-pointer">
              <circle cx={zone.x} cy={zone.y} r="16" fill={done ? '#067647' : '#035bff'} />
              <text x={zone.x} y={zone.y + 4} textAnchor="middle" fontSize="10" fill="white" fontWeight="700">
                {done ? '✓' : layout.zones.indexOf(zone) + 1}
              </text>
              <text x={zone.x} y={zone.y + 28} textAnchor="middle" fontSize="8" fill="#0e1525">
                {zone.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
