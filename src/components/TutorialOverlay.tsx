import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui'
import { useSession } from '../context/SessionContext'

const STEPS = [
  {
    title: 'Welcome to Planora',
    body: 'This quick tour covers the header, sidebar, inventory, weekly planner, assistant, preferences, and shopping list.',
    path: '/app',
    target: 'header',
  },
  {
    title: 'Right sidebar',
    body: 'Jump between Current Meals, Food Inventory, Shopping List, Food Preferences, Tutorial, Settings, and Log Out. Collapse the rail when you need more space.',
    path: '/app',
    target: 'sidebar',
  },
  {
    title: 'Food inventory',
    body: 'Add foods manually or photograph your fridge, freezer, cart, or receipt. Review detected items, then save them to inventory.',
    path: '/app/inventory',
    target: 'inventory',
  },
  {
    title: 'Weekly meal planner',
    body: 'Assign breakfast, lunch, and dinner for Monday–Friday. Move meals between cells and check inventory coverage.',
    path: '/app',
    target: 'planner',
  },
  {
    title: 'AI assistant',
    body: 'Open the floating assistant to generate personalized meals from retrieved recipes. Accept, modify, or reject each suggestion.',
    path: '/app',
    target: 'assistant',
  },
  {
    title: 'Food preferences',
    body: 'Save allergies, dietary rules, favorites, equipment, and AI instructions. Allergies are always treated as strict.',
    path: '/app/preferences',
    target: 'preferences',
  },
  {
    title: 'Shopping list',
    body: 'Missing ingredients from planned meals appear here. Optimize meals to reuse ingredients, then mark items purchased or add them to inventory.',
    path: '/app/shopping',
    target: 'shopping',
  },
] as const

export function TutorialOverlay({ onClose }: { onClose: () => void }) {
  const { store, setProfile } = useSession()
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = STEPS[index]

  useEffect(() => {
    navigate(step.path)
    const timer = window.setTimeout(() => {
      const el = document.querySelector(`[data-tutorial="${step.target}"]`)
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
        setRect(el.getBoundingClientRect())
      } else {
        setRect(null)
      }
    }, 180)
    return () => window.clearTimeout(timer)
  }, [index, navigate, step.path, step.target])

  async function finish() {
    if (store) {
      const profile = await store.updateProfile({ tutorialCompleted: true })
      setProfile(profile)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-ink/50" />
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-2xl ring-4 ring-primary shadow-[0_0_0_9999px_rgba(14,21,37,0.45)]"
          style={{
            top: Math.max(8, rect.top - 8),
            left: Math.max(8, rect.left - 8),
            width: rect.width + 16,
            height: rect.height + 16,
          }}
        />
      ) : null}
      <div className="absolute bottom-6 left-1/2 w-[min(440px,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-line bg-surface p-5 card-shadow">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Tutorial {index + 1} / {STEPS.length}
            </p>
            <h2 className="mt-1 text-lg font-bold text-ink">{step.title}</h2>
          </div>
          <Button type="button" variant="ghost" className="px-3 py-1.5" onClick={() => void finish()}>
            Skip Tutorial
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted">{step.body}</p>
        <div className="mt-4 flex justify-between gap-2">
          <Button type="button" variant="ghost" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}>
            Back
          </Button>
          {index < STEPS.length - 1 ? (
            <Button type="button" onClick={() => setIndex((value) => value + 1)}>
              Next
            </Button>
          ) : (
            <Button type="button" onClick={() => void finish()}>
              Finish
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
