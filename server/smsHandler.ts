import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mondayOf } from '../src/lib/dates'
import { normalizeWeek } from '../src/lib/meals'
import { SMS_HELP, parseSmsCommand, toE164 } from '../src/lib/smsCommands'
import { emptyPreferences, normalizePreferences, type Meal, type MealSlot, type Weekday } from '../src/data/types'
import { renderWeekGridPng } from './weekGridPng'

function env(name: string): string {
  return process.env[name]?.trim() ?? ''
}

function serviceClient(): SupabaseClient {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL')
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Texting needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function anonClient(token: string): SupabaseClient {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL')
  const key = env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY')
  if (!url || !key) throw new Error('Texting needs the Supabase URL and anon key on the server.')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function twiml(body: string, mediaUrl?: string): Response {
  const media = mediaUrl ? `<Media>${xmlEscape(mediaUrl)}</Media>` : ''
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>${xmlEscape(body)}</Body>${media}</Message></Response>`
  return new Response(xml, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
}

function sign(payload: string): string {
  return createHmac('sha256', env('TWILIO_AUTH_TOKEN') || 'planora').update(payload).digest('hex')
}

export function twilioSignatureValid(url: string, params: URLSearchParams, signature: string | null): boolean {
  const token = env('TWILIO_AUTH_TOKEN')
  if (!token || !signature) return false
  const keys = [...new Set([...params.keys()])].sort()
  let data = url
  for (const key of keys) {
    for (const value of params.getAll(key)) data += key + value
  }
  const digest = createHmac('sha1', token).update(data).digest('base64')
  const left = Buffer.from(digest)
  const right = Buffer.from(signature)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

async function sendSms(to: string, body: string) {
  const sid = env('TWILIO_ACCOUNT_SID')
  const token = env('TWILIO_AUTH_TOKEN')
  const from = env('TWILIO_PHONE_NUMBER')
  if (!sid || !token || !from) throw new Error('Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.')
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  })
  if (!response.ok) throw new Error('Twilio could not send the text.')
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

function publicUrl(request: Request): string {
  return env('TWILIO_WEBHOOK_URL') || request.url
}

function gridUrl(request: Request, userId: string, weekStart: string): string {
  const exp = Date.now() + 2 * 60 * 60 * 1000
  const sig = sign(`${userId}|${weekStart}|${exp}`)
  const origin = new URL(request.url).origin
  const url = new URL('/api/sms/grid', origin)
  url.searchParams.set('user', userId)
  url.searchParams.set('week', weekStart)
  url.searchParams.set('exp', String(exp))
  url.searchParams.set('sig', sig)
  return url.toString()
}

async function currentWeekStart(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin.from('profiles').select('last_week_start').eq('id', userId).maybeSingle()
  const saved = data?.last_week_start ? String(data.last_week_start) : ''
  return /^\d{4}-\d{2}-\d{2}$/.test(saved) ? saved : mondayOf(new Date())
}

async function loadWeekMeals(admin: SupabaseClient, userId: string, weekStart: string) {
  const { data, error } = await admin
    .from('meal_slots')
    .select('day, slot, meal, time_constraint, finished')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
  if (error) throw new Error(error.message)
  const cells = (data ?? []).map((row) => ({
    day: row.day as Weekday,
    slot: row.slot as MealSlot,
    meal: (row.meal as Meal | null) ?? null,
    constraint: row.time_constraint ?? null,
    finished: Boolean(row.finished),
  }))
  return normalizeWeek(weekStart, cells)
}

async function addManualItem(admin: SupabaseClient, userId: string, weekStart: string, item: { name: string; quantity: number; unit: string }) {
  const { error } = await admin.from('manual_shopping_items').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    week_start: weekStart,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    purchased: false,
  })
  if (error) throw new Error(error.message)
}

async function replaceMeal(admin: SupabaseClient, userId: string, weekStart: string, day: Weekday, slot: MealSlot) {
  const [week, inventoryResult, prefsResult] = await Promise.all([
    loadWeekMeals(admin, userId, weekStart),
    admin.from('inventory_items').select('*').eq('user_id', userId),
    admin.from('preferences').select('*').eq('user_id', userId).maybeSingle(),
  ])
  if (inventoryResult.error) throw new Error(inventoryResult.error.message)
  const inventory = (inventoryResult.data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    quantity: Number(row.quantity),
    unit: String(row.unit),
    expiresOn: row.expires_on ? String(row.expires_on) : null,
    category: row.category,
  }))
  const prefs = prefsResult.data
    ? normalizePreferences({
        allergies: prefsResult.data.allergies ?? [],
        dietary: prefsResult.data.dietary ?? [],
        favorites: prefsResult.data.favorites ?? [],
        disliked: prefsResult.data.disliked ?? [],
        cuisines: prefsResult.data.cuisines ?? [],
        skill: prefsResult.data.skill ?? 'beginner',
        equipment: prefsResult.data.equipment ?? [],
        recipeSites: prefsResult.data.recipe_sites ?? [],
        instructions: prefsResult.data.instructions ?? '',
      })
    : emptyPreferences()
  const { suggestMeals } = await import('../src/lib/suggest')
  const result = await suggestMeals({
    message: `Different ${slot} on ${day}`,
    inventory,
    preferences: prefs,
    week,
    feedback: [],
    options: { slots: [slot] },
  })
  const suggestion = result.suggestions.find((item) => item.day === day && item.slot === slot)
  if (!suggestion) return null
  const existing = week.cells.find((cell) => cell.day === day && cell.slot === slot)
  const row = {
    id: crypto.randomUUID(),
    user_id: userId,
    week_start: weekStart,
    day,
    slot,
    meal: suggestion.meal,
    time_constraint: existing?.constraint ?? null,
    finished: false,
  }
  const saved = await admin.from('meal_slots').upsert(row, { onConflict: 'user_id,week_start,day,slot' })
  if (saved.error && /finished/i.test(saved.error.message)) {
    const { finished: _finished, ...legacy } = row
    const retry = await admin.from('meal_slots').upsert(legacy, { onConflict: 'user_id,week_start,day,slot' })
    if (retry.error) throw new Error(retry.error.message)
  } else if (saved.error) {
    throw new Error(saved.error.message)
  }
  return suggestion.meal.name
}

export async function handleVerify(request: Request): Promise<Response> {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })
  const header = request.headers.get('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) return Response.json({ error: 'Sign in again to link a phone.' }, { status: 401 })
  let body: { action?: string; phone?: string; code?: string }
  try {
    body = (await request.json()) as { action?: string; phone?: string; code?: string }
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const userClient = anonClient(token)
  const { data, error } = await userClient.auth.getUser()
  if (error || !data.user) return Response.json({ error: 'Sign in again to link a phone.' }, { status: 401 })
  const admin = serviceClient()
  const userId = data.user.id

  if (body.action === 'send') {
    const phone = toE164(body.phone ?? '')
    if (!phone) return Response.json({ error: 'Enter a mobile number, like (415) 555-1212.' }, { status: 400 })
    const code = String(randomInt(100000, 1000000))
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const { error: updateError } = await admin
      .from('profiles')
      .update({
        pending_phone: phone,
        phone_code_hash: hashCode(code),
        phone_code_expires: expires,
      })
      .eq('id', userId)
    if (updateError) return Response.json({ error: updateError.message }, { status: 500 })
    await sendSms(phone, `Your Planora code is ${code}. It expires in 10 minutes.`)
    return Response.json({ ok: true, phone })
  }

  if (body.action === 'confirm') {
    const code = (body.code ?? '').replace(/\D/g, '')
    if (code.length !== 6) return Response.json({ error: 'Enter the 6-digit code from the text.' }, { status: 400 })
    const { data: profile, error: readError } = await admin
      .from('profiles')
      .select('pending_phone, phone_code_hash, phone_code_expires')
      .eq('id', userId)
      .maybeSingle()
    if (readError || !profile?.pending_phone || !profile.phone_code_hash) {
      return Response.json({ error: 'Request a new code first.' }, { status: 400 })
    }
    if (profile.phone_code_expires && new Date(String(profile.phone_code_expires)).getTime() < Date.now()) {
      return Response.json({ error: 'That code expired. Request a new one.' }, { status: 400 })
    }
    if (hashCode(code) !== profile.phone_code_hash) return Response.json({ error: 'That code does not match.' }, { status: 400 })
    const phone = String(profile.pending_phone)
    const { data: taken } = await admin
      .from('profiles')
      .select('id')
      .eq('phone', phone)
      .eq('phone_verified', true)
      .neq('id', userId)
      .maybeSingle()
    if (taken?.id) return Response.json({ error: 'That number is already linked to another account.' }, { status: 409 })
    const { error: saveError } = await admin
      .from('profiles')
      .update({
        phone,
        phone_verified: true,
        pending_phone: null,
        phone_code_hash: null,
        phone_code_expires: null,
      })
      .eq('id', userId)
    if (saveError) return Response.json({ error: saveError.message }, { status: 500 })
    return Response.json({ ok: true, phone })
  }

  return Response.json({ error: 'Unknown action.' }, { status: 400 })
}

export async function handleInbound(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const raw = await request.text()
  const params = new URLSearchParams(raw)
  const signature = request.headers.get('x-twilio-signature')
  if (!twilioSignatureValid(publicUrl(request), params, signature)) {
    return new Response('Invalid signature', { status: 403 })
  }
  const from = toE164(params.get('From') ?? '')
  if (!from) return twiml('Planora could not read that phone number.')
  const admin = serviceClient()
  const { data: profile } = await admin.from('profiles').select('id').eq('phone', from).eq('phone_verified', true).maybeSingle()
  if (!profile?.id) return twiml('Link this number in Planora Settings before texting the list.')
  const userId = String(profile.id)
  const command = parseSmsCommand(params.get('Body') ?? '')
  const weekStart = await currentWeekStart(admin, userId)

  if (command.type === 'help') return twiml(SMS_HELP)
  if (command.type === 'unknown') return twiml(`I didn't catch that. ${SMS_HELP}`)

  try {
    if (command.type === 'add') {
      await addManualItem(admin, userId, weekStart, command)
      const qty = `${command.quantity} ${command.unit}`
      return twiml(`Added ${qty} ${command.name} to this week's list.`)
    }
    const mealName = await replaceMeal(admin, userId, weekStart, command.day, command.slot)
    const label = `${command.day[0].toUpperCase()}${command.day.slice(1)} ${command.slot}`
    const body = mealName ? `${label} is now ${mealName}.` : `I couldn't find a different ${label}.`
    return twiml(body, gridUrl(request, userId, weekStart))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong.'
    return twiml(message)
  }
}

export async function handleGrid(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const userId = url.searchParams.get('user') ?? ''
  const weekStart = url.searchParams.get('week') ?? ''
  const exp = Number(url.searchParams.get('exp') ?? '0')
  const sig = url.searchParams.get('sig') ?? ''
  const expected = sign(`${userId}|${weekStart}|${exp}`)
  const left = Buffer.from(expected)
  const right = Buffer.from(sig)
  if (!userId || !weekStart || left.length !== right.length || !timingSafeEqual(left, right) || exp < Date.now()) {
    return new Response('Expired grid', { status: 403 })
  }
  const admin = serviceClient()
  const week = await loadWeekMeals(admin, userId, weekStart)
  const cells = week.cells
    .filter((cell) => cell.meal)
    .map((cell) => ({ day: cell.day, slot: cell.slot, name: cell.meal!.name }))
  const png = renderWeekGridPng(cells)
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=300' },
  })
}
