import type { ScanScene } from './vision'

export interface FridgeZone {
  id: string
  label: string
  scene: Extract<ScanScene, 'refrigerator' | 'freezer'>
  /** Position of the photo bubble on a 200×320 fridge diagram. */
  x: number
  y: number
}

export interface FridgeLayout {
  id: string
  label: string
  blurb: string
  zones: FridgeZone[]
}

export const FRIDGE_LAYOUTS: FridgeLayout[] = [
  {
    id: 'top-freezer',
    label: 'Top freezer',
    blurb: 'Freezer above the fridge.',
    zones: [
      { id: 'freezer', label: 'Freezer', scene: 'freezer', x: 100, y: 48 },
      { id: 'top-shelf', label: 'Top shelf', scene: 'refrigerator', x: 100, y: 130 },
      { id: 'middle-shelf', label: 'Middle shelf', scene: 'refrigerator', x: 100, y: 180 },
      { id: 'crisper', label: 'Crisper', scene: 'refrigerator', x: 100, y: 236 },
      { id: 'door', label: 'Door', scene: 'refrigerator', x: 168, y: 180 },
    ],
  },
  {
    id: 'bottom-freezer',
    label: 'Bottom freezer',
    blurb: 'Fridge on top, freezer drawer below.',
    zones: [
      { id: 'top-shelf', label: 'Top shelf', scene: 'refrigerator', x: 100, y: 58 },
      { id: 'middle-shelf', label: 'Middle shelf', scene: 'refrigerator', x: 100, y: 112 },
      { id: 'drawers', label: 'Drawers', scene: 'refrigerator', x: 100, y: 168 },
      { id: 'door', label: 'Door', scene: 'refrigerator', x: 168, y: 112 },
      { id: 'freezer', label: 'Freezer', scene: 'freezer', x: 100, y: 260 },
    ],
  },
  {
    id: 'french-door',
    label: 'French door',
    blurb: 'Two doors on top and a bottom freezer.',
    zones: [
      { id: 'left-door', label: 'Left door', scene: 'refrigerator', x: 58, y: 90 },
      { id: 'right-door', label: 'Right door', scene: 'refrigerator', x: 142, y: 90 },
      { id: 'upper-shelves', label: 'Upper shelves', scene: 'refrigerator', x: 100, y: 150 },
      { id: 'drawers', label: 'Drawers', scene: 'refrigerator', x: 100, y: 200 },
      { id: 'bottom-freezer', label: 'Bottom freezer', scene: 'freezer', x: 100, y: 268 },
    ],
  },
  {
    id: 'side-by-side',
    label: 'Side-by-side',
    blurb: 'Fridge and freezer next to each other.',
    zones: [
      { id: 'fridge-shelves', label: 'Fridge shelves', scene: 'refrigerator', x: 62, y: 120 },
      { id: 'fridge-door', label: 'Fridge door', scene: 'refrigerator', x: 62, y: 210 },
      { id: 'freezer-shelves', label: 'Freezer shelves', scene: 'freezer', x: 138, y: 120 },
      { id: 'freezer-door', label: 'Freezer door', scene: 'freezer', x: 138, y: 210 },
    ],
  },
]
