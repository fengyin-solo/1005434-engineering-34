import { SEED_ROWS } from './seed'
import type { EntryRow, ExportReceipt } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'geohazard-patrol:entries'
const EXPORT_LEDGER_KEY = 'geohazard-patrol:export-ledger'
const NEXT_ID_KEY = 'geohazard-patrol:next-id'

export type ExportLedger = Record<string, ExportReceipt>
export type NextIdMap = Record<string, number>
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    window.localStorage.setItem(key, JSON.stringify(fallback))
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    window.localStorage.setItem(key, JSON.stringify(fallback))
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(key, JSON.stringify(value))
  }
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    return { ...fallback, ...parsed }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}

export function readExportLedger(): ExportLedger {
  return readJson<ExportLedger>(EXPORT_LEDGER_KEY, {})
}

export function saveExportReceipt(receipt: ExportReceipt): void {
  const ledger = readExportLedger()
  ledger[`${receipt.moduleKey}:${receipt.contentHash}`] = receipt
  writeJson(EXPORT_LEDGER_KEY, ledger)
}

export function nextRowId(key: string): number {
  const seeds = SEED_ROWS[key] ?? []
  const current = Math.max(0, ...listRows(key).map((row) => Number(row.id) || 0), ...seeds.map((row) => Number(row.id) || 0))
  const idMap = readJson<NextIdMap>(NEXT_ID_KEY, {})
  const next = Math.max(current + 1, idMap[key] ?? 0)
  idMap[key] = next + 1
  writeJson(NEXT_ID_KEY, idMap)
  return next
}
