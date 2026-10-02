import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'geohazard-patrol:entries'
// 导出台账：每一次有效导出都记一笔，重复导出靠它认「先到的那一份」。
const EXPORT_LEDGER_KEY = 'geohazard-patrol:exports'

export type ExportRecord = {
  module: string
  fingerprint: string
  filename: string
  exportedAt: string
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
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

function readExportLedger(): ExportRecord[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return []
  }
  const raw = window.localStorage.getItem(EXPORT_LEDGER_KEY)
  if (!raw) {
    return []
  }
  try {
    return JSON.parse(raw) as ExportRecord[]
  } catch {
    return []
  }
}

let exportLedgerCache: ExportRecord[] | null = null

export function listExportRecords(): ExportRecord[] {
  if (exportLedgerCache === null) {
    exportLedgerCache = readExportLedger()
  }
  return exportLedgerCache
}

export function appendExportRecord(record: ExportRecord): void {
  const next = [...listExportRecords(), record]
  exportLedgerCache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(EXPORT_LEDGER_KEY, JSON.stringify(next))
  }
}
