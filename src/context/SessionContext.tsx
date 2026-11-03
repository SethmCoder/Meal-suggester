import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { authenticateLocal, loadLocalSession, registerLocal } from '../data/localStore'
import { createDemoSession } from '../data/memoryStore'
import type { DataStore } from '../data/store'
import { loadSupabaseProfile } from '../data/supabaseStore'
import type { Profile, StoreMode } from '../data/types'
import { DEMO_PASSWORD } from '../data/types'
import { isOfflineError, isSupabaseConfigured, pingSupabase, supabase } from '../lib/supabaseClient'
import { validateEmail, validatePassword, validateUsername } from '../lib/validation'

const LOCAL_SESSION_KEY = 'planora.session.localUserId'

interface SessionValue {
  ready: boolean
  profile: Profile | null
  store: DataStore | null
  mode: StoreMode | null
  persistenceNote: string | null
  login: (identifier: string, password: string) => Promise<void>
  signup: (input: { email: string; username: string; password: string }) => Promise<void>
  demoLogin: (password: string) => Promise<void>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
  setProfile: (profile: Profile) => void
}

const SessionContext = createContext<SessionValue | null>(null)

async function supabaseAvailable(): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false
  return pingSupabase()
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [store, setStore] = useState<DataStore | null>(null)
  const [mode, setMode] = useState<StoreMode | null>(null)
  const [persistenceNote, setPersistenceNote] = useState<string | null>(null)

  const applySession = useCallback((next: { profile: Profile; store: DataStore }, note: string | null) => {
    setProfile(next.profile)
    setStore(next.store)
    setMode(next.store.mode)
    setPersistenceNote(note)
  }, [])

  const clearSession = useCallback(() => {
    setProfile(null)
    setStore(null)
    setMode(null)
    setPersistenceNote(null)
    localStorage.removeItem(LOCAL_SESSION_KEY)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (await supabaseAvailable()) {
          const { data } = await supabase!.auth.getSession()
          if (data.session?.user) {
            const loaded = await loadSupabaseProfile(data.session.user)
            if (!cancelled) {
              applySession(loaded, 'Synced with Supabase.')
              setReady(true)
              return
            }
          }
        }
        const localId = localStorage.getItem(LOCAL_SESSION_KEY)
        if (localId) {
          const local = loadLocalSession(localId)
          if (local && !cancelled) {
            applySession(local, 'Saved on this device.')
            setReady(true)
            return
          }
          localStorage.removeItem(LOCAL_SESSION_KEY)
        }
      } catch {
        // Fall through to unauthenticated.
      }
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [applySession])

  const login = useCallback(
    async (identifier: string, password: string) => {
      if (!identifier.trim() || !password) throw new Error('Enter your email or username and password.')
      if (await supabaseAvailable()) {
        try {
          const client = supabase!
          const { data: resolved, error: resolveError } = await client.rpc('resolve_login_email', {
            identifier: identifier.trim(),
          })
          if (resolveError) throw new Error(resolveError.message)
          const email = typeof resolved === 'string' && resolved ? resolved : identifier.trim()
          const { data, error } = await client.auth.signInWithPassword({ email, password })
          if (error) throw new Error(error.message)
          if (!data.user) throw new Error('Sign-in failed.')
          const loaded = await loadSupabaseProfile(data.user)
          applySession(loaded, 'Synced with Supabase.')
          localStorage.removeItem(LOCAL_SESSION_KEY)
          return
        } catch (error) {
          if (!isOfflineError(error)) throw error
        }
      }
      const local = await authenticateLocal(identifier, password)
      localStorage.setItem(LOCAL_SESSION_KEY, local.profile.id)
      applySession(local, 'Saved on this device. Configure Supabase to sync across devices.')
    },
    [applySession],
  )

  const signup = useCallback(
    async (input: { email: string; username: string; password: string }) => {
      const emailError = validateEmail(input.email)
      if (emailError) throw new Error(emailError)
      const usernameError = validateUsername(input.username)
      if (usernameError) throw new Error(usernameError)
      const passwordError = validatePassword(input.password)
      if (passwordError) throw new Error(passwordError)

      if (await supabaseAvailable()) {
        try {
          const client = supabase!
          const { data, error } = await client.auth.signUp({
            email: input.email.trim().toLowerCase(),
            password: input.password,
            options: { data: { username: input.username.trim() } },
          })
          if (error) throw new Error(error.message)
          if (!data.user) throw new Error('Account created, but no session was returned. Confirm your email, then sign in.')
          const loaded = await loadSupabaseProfile(data.user)
          applySession(loaded, 'Synced with Supabase.')
          localStorage.removeItem(LOCAL_SESSION_KEY)
          return
        } catch (error) {
          if (!isOfflineError(error)) throw error
        }
      }
      const local = await registerLocal(input)
      localStorage.setItem(LOCAL_SESSION_KEY, local.profile.id)
      applySession(local, 'Saved on this device. Configure Supabase to sync across devices.')
    },
    [applySession],
  )

  const demoLogin = useCallback(
    async (password: string) => {
      if (password !== DEMO_PASSWORD) throw new Error(`Use the demo password: ${DEMO_PASSWORD}`)
      const demo = createDemoSession()
      localStorage.removeItem(LOCAL_SESSION_KEY)
      if (supabase) {
        try {
          await supabase.auth.signOut()
        } catch {
          // Demo must stay isolated even if sign-out fails.
        }
      }
      applySession(demo, null)
    },
    [applySession],
  )

  const logout = useCallback(async () => {
    if (mode === 'supabase' && supabase) {
      try {
        await supabase.auth.signOut()
      } catch {
        // Still clear local UI session.
      }
    }
    clearSession()
  }, [clearSession, mode])

  const refreshProfile = useCallback(async () => {
    if (!store) return
    setProfile(await store.getProfile())
  }, [store])

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      profile,
      store,
      mode,
      persistenceNote,
      login,
      signup,
      demoLogin,
      logout,
      refreshProfile,
      setProfile,
    }),
    [ready, profile, store, mode, persistenceNote, login, signup, demoLogin, logout, refreshProfile],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
