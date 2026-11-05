import { useRef, useState } from 'react'
import { Camera, ImagePlus, Trash2 } from 'lucide-react'
import type { FoodCategory, InventoryItem } from '../data/types'
import { CATEGORY_LABELS, FOOD_CATEGORIES, UNITS } from '../data/types'
import { createId } from '../lib/id'
import { FridgeScanGuide } from './FridgeScanGuide'
import { fileToDataUrl, scanFoodPhoto, visionConfigured, type ScanScene, type ScannedFoodDraft } from '../lib/vision'
import { Badge, Button, EmptyState, ErrorText, FieldLabel, TextInput, TextSelect } from './ui'

interface PhotoInventoryScanProps {
  onAddItems: (items: InventoryItem[]) => Promise<void>
  /** Empty inventory: walk through fridge photo targets before a single snapshot. */
  guided?: boolean
}

type DraftRow = ScannedFoodDraft & { id: string; selected: boolean }

const SCENES: { id: ScanScene; label: string; help: string }[] = [
  { id: 'refrigerator', label: 'Refrigerator', help: 'Shelves, drawers, leftovers' },
  { id: 'freezer', label: 'Freezer', help: 'Frozen packs and boxes' },
  { id: 'receipt', label: 'Receipt', help: 'Printed or digital grocery receipt' },
  { id: 'cart', label: 'Cart / bags', help: 'Checkout cart or grocery bags' },
  { id: 'pantry', label: 'Pantry', help: 'Cupboard or dry goods' },
  { id: 'other', label: 'Other photo', help: 'Any clear food photo' },
]

export function PhotoInventoryScan({ onAddItems, guided = false }: PhotoInventoryScanProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const [scene, setScene] = useState<ScanScene>('refrigerator')
  const [preview, setPreview] = useState<string | null>(null)
  const [rows, setRows] = useState<DraftRow[]>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [skipGuide, setSkipGuide] = useState(false)

  async function processFile(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Choose a photo (JPG, PNG, HEIC converted by your browser, or WebP).')
      return
    }
    setBusy(true)
    setError(null)
    setSummary(null)
    setRows([])
    try {
      const dataUrl = await fileToDataUrl(file)
      setPreview(dataUrl)
      const result = await scanFoodPhoto({ dataUrl, scene })
      setSummary(result.summary)
      setRows(
        result.items.map((item) => ({
          ...item,
          id: createId(),
          selected: true,
        })),
      )
      if (!result.items.length) {
        setError('No food items were confidently identified. Try a clearer photo or a different angle.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo scan failed.')
    } finally {
      setBusy(false)
    }
  }

  async function addSelected() {
    const selected = rows.filter((row) => row.selected && row.name.trim())
    if (!selected.length) {
      setError('Select at least one item to add.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onAddItems(
        selected.map((row) => ({
          id: createId(),
          name: row.name.trim(),
          quantity: row.quantity > 0 ? row.quantity : 1,
          unit: row.unit || 'piece',
          expiresOn: row.expiresOn,
          category: row.category,
        })),
      )
      setRows([])
      setSummary(`Added ${selected.length} item${selected.length === 1 ? '' : 's'} to inventory.`)
      setPreview(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add scanned items.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="soft-shadow rounded-2xl border border-line bg-surface p-4 md:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Scan with a photo</h2>
          <p className="mt-1 text-sm text-muted">
            Photograph your fridge, freezer, cart, or receipt. Planora identifies foods and lets you confirm before
            adding them.
          </p>
        </div>
        {!visionConfigured() ? (
          <Badge tone="warning">AI keys required</Badge>
        ) : (
          <Badge tone="primary">Vision ready</Badge>
        )}
      </div>

      {guided && !skipGuide && !rows.length ? (
        <FridgeScanGuide
          onSkip={() => setSkipGuide(true)}
          onDrafts={(items, note) => {
            setSummary(note)
            setRows(items.map((item) => ({ ...item, id: createId(), selected: true })))
            setSkipGuide(true)
            if (!items.length) setError('No food items were confidently identified. Retake a bubble or use one photo.')
          }}
        />
      ) : null}

      {guided && !skipGuide && !rows.length ? null : (
      <>
      <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {SCENES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setScene(option.id)}
            className={
              scene === option.id
                ? 'rounded-xl border border-primary bg-primary/10 px-3 py-2 text-left'
                : 'rounded-xl border border-line bg-canvas/50 px-3 py-2 text-left hover:border-primary/40'
            }
          >
            <p className="text-sm font-semibold text-ink">{option.label}</p>
            <p className="mt-0.5 text-xs text-muted">{option.help}</p>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={() => cameraRef.current?.click()} disabled={busy || !visionConfigured()}>
          <Camera className="h-4 w-4" />
          Take photo
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => uploadRef.current?.click()}
          disabled={busy || !visionConfigured()}
        >
          <ImagePlus className="h-4 w-4" />
          Upload photo
        </Button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void processFile(e.target.files?.[0] ?? null)}
        />
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void processFile(e.target.files?.[0] ?? null)}
        />
      </div>
      </>
      )}

      {!visionConfigured() ? (
        <p className="mt-3 text-sm text-warning">
          For Groq, set <code className="rounded bg-canvas px-1">VITE_AI_BASE_URL=https://api.groq.com/openai/v1</code>,
          your Groq key, <code className="rounded bg-canvas px-1">VITE_AI_MODEL=openai/gpt-oss-20b</code>, and{' '}
          <code className="rounded bg-canvas px-1">VITE_AI_VISION_MODEL=qwen/qwen3.8-27b</code>, then restart the app.
        </p>
      ) : null}

      {busy ? <p className="mt-4 text-sm font-medium text-primary">Scanning photo…</p> : null}
      <ErrorText>{error}</ErrorText>
      {summary ? <p className="mt-3 text-sm text-muted">{summary}</p> : null}

      {preview ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          <img src={preview} alt="Scan preview" className="max-h-64 w-full object-contain bg-canvas" />
        </div>
      ) : null}

      {rows.length ? (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Review detected items</h3>
            <Button type="button" onClick={() => void addSelected()} disabled={saving}>
              {saving ? 'Adding…' : `Add selected (${rows.filter((row) => row.selected).length})`}
            </Button>
          </div>
          {rows.map((row) => (
            <div key={row.id} className="grid gap-2 rounded-xl border border-line bg-canvas/40 p-3 md:grid-cols-[auto_1.4fr_0.7fr_0.7fr_1fr_auto] md:items-end">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={row.selected}
                  onChange={(e) =>
                    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, selected: e.target.checked } : item)))
                  }
                />
                <Badge tone={row.confidence === 'high' ? 'success' : row.confidence === 'low' ? 'warning' : 'neutral'}>
                  {row.confidence}
                </Badge>
              </label>
              <div>
                <FieldLabel>Food</FieldLabel>
                <TextInput
                  value={row.name}
                  onChange={(e) =>
                    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, name: e.target.value } : item)))
                  }
                />
              </div>
              <div>
                <FieldLabel>Qty</FieldLabel>
                <TextInput
                  value={String(row.quantity)}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((item) =>
                        item.id === row.id ? { ...item, quantity: Number(e.target.value) || 0 } : item,
                      ),
                    )
                  }
                />
              </div>
              <div>
                <FieldLabel>Unit</FieldLabel>
                <TextSelect
                  value={row.unit}
                  onChange={(e) =>
                    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, unit: e.target.value } : item)))
                  }
                >
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </TextSelect>
              </div>
              <div>
                <FieldLabel>Category</FieldLabel>
                <TextSelect
                  value={row.category}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((item) =>
                        item.id === row.id ? { ...item, category: e.target.value as FoodCategory } : item,
                      ),
                    )
                  }
                >
                  {FOOD_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </TextSelect>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="px-3 py-2 text-danger"
                onClick={() => setRows((prev) => prev.filter((item) => item.id !== row.id))}
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : !busy && !preview ? (
        <div className="mt-4">
          <EmptyState
            title="No scan yet"
            body="Start with fridge and freezer photos so Planora knows what you already have."
          />
        </div>
      ) : null}
    </div>
  )
}
