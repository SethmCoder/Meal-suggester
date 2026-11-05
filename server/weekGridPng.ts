import { deflateSync } from 'node:zlib'
import type { MealSlot, Weekday } from '../src/data/types'

const FONT: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '?': [14, 17, 1, 2, 4, 0, 4],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 14],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 6, 8, 16, 31],
  '3': [30, 1, 1, 14, 1, 1, 30],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  '-': [0, 0, 0, 31, 0, 0, 0],
  "'": [4, 4, 8, 0, 0, 0, 0],
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const SLOTS: { id: MealSlot; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
]
const WEEKDAY_INDEX: Record<Weekday, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
}

const WIDTH = 860
const HEIGHT = 280
const LABEL_W = 120
const CELL_W = Math.floor((WIDTH - LABEL_W) / 7)
const HEADER_H = 40
const CELL_H = Math.floor((HEIGHT - HEADER_H) / 3)

type RGB = [number, number, number]

function crc32(buf: Buffer): number {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const name = Buffer.from(type)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, crc])
}

function encodePng(width: number, height: number, rgb: Buffer): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const dest = y * (width * 3 + 1)
    raw[dest] = 0
    rgb.copy(raw, dest + 1, y * width * 3, (y + 1) * width * 3)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return png
}

function setPixel(rgb: Buffer, x: number, y: number, color: RGB) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return
  const index = (y * WIDTH + x) * 3
  rgb[index] = color[0]
  rgb[index + 1] = color[1]
  rgb[index + 2] = color[2]
}

function fillRect(rgb: Buffer, x: number, y: number, w: number, h: number, color: RGB) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) setPixel(rgb, xx, yy, color)
  }
}

function drawText(rgb: Buffer, x: number, y: number, text: string, color: RGB, scale = 2) {
  let cursor = x
  for (const char of text.toUpperCase()) {
    const glyph = FONT[char] ?? FONT['?']
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        if ((glyph[row] >> (4 - col)) & 1) {
          fillRect(rgb, cursor + col * scale, y + row * scale, scale, scale, color)
        }
      }
    }
    cursor += 6 * scale
  }
}

function fit(text: string, maxChars: number): string {
  const clean = text.replace(/[^a-z0-9 '-]/gi, '').trim()
  if (clean.length <= maxChars) return clean
  return `${clean.slice(0, Math.max(1, maxChars - 1))}'`
}

export function renderWeekGridPng(cells: { day: Weekday; slot: MealSlot; name: string }[]): Buffer {
  const rgb = Buffer.alloc(WIDTH * HEIGHT * 3, 255)
  const ink: RGB = [14, 21, 37]
  const muted: RGB = [92, 107, 128]
  const header: RGB = [11, 31, 77]
  const band: RGB = [3, 91, 255]
  const line: RGB = [225, 231, 240]
  const weekend: RGB = [244, 247, 251]

  fillRect(rgb, 0, 0, WIDTH, HEADER_H, header)
  drawText(rgb, 16, 12, 'Planora', [255, 255, 255], 2)
  DAYS.forEach((label, index) => {
    drawText(rgb, LABEL_W + index * CELL_W + 18, 12, label, [255, 255, 255], 2)
  })

  const names = new Map<string, string>()
  for (const cell of cells) names.set(`${cell.day}:${cell.slot}`, cell.name)

  SLOTS.forEach((slot, row) => {
    const top = HEADER_H + row * CELL_H
    fillRect(rgb, 0, top, LABEL_W, CELL_H, band)
    drawText(rgb, 10, top + 22, slot.label, [255, 255, 255], 2)
    DAYS.forEach((_, index) => {
      const left = LABEL_W + index * CELL_W
      if (index >= 5) fillRect(rgb, left, top, CELL_W, CELL_H, weekend)
      fillRect(rgb, left, top, CELL_W, 1, line)
      fillRect(rgb, left, top, 1, CELL_H, line)
      const day = (['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as Weekday[])[index]
      const name = day ? names.get(`${day}:${slot.id}`) : ''
      if (name) drawText(rgb, left + 8, top + 28, fit(name, 11), ink, 1)
      else drawText(rgb, left + 8, top + 28, index >= 5 ? '' : '-', muted, 2)
    })
  })

  return encodePng(WIDTH, HEIGHT, rgb)
}

export { WEEKDAY_INDEX }
