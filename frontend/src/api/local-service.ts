import { MODULE_BY_KEY } from '@/data/modules'
import {
  allRows,
  nextRowId,
  listRows,
  readExportLedger,
  resetRows,
  saveExportReceipt,
  saveRows,
} from '@/data/local-store'
import { wallStructureTypes } from '@/data/wall-catalog'
import type {
  ActionResult,
  EntryRow,
  ExportResult,
  ModuleMeta,
  OverviewResult,
  PageResult,
  WallFormInput,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']
const STRICT_SEQUENTIAL_KEYS = new Set(['wall'])

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function availableActions(key: string, row: EntryRow): string[] {
  const meta = moduleMeta(key)
  const currentIndex = meta.statuses.indexOf(String(row.status))
  if (currentIndex < 0 || currentIndex >= meta.statuses.length - 1) {
    return []
  }
  const targetStatus = meta.statuses[currentIndex + 1]
  return Object.entries(meta.actionTargets)
    .filter(([, target]) => target === targetStatus)
    .map(([action]) => action)
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const currentIndex = meta.statuses.indexOf(current)
  const targetIndex = meta.statuses.indexOf(target)
  if (STRICT_SEQUENTIAL_KEYS.has(key)) {
    if (currentIndex < 0) {
      return { ok: false, message: `${meta.entity}当前状态「${current}」不在登记流程中，已拦下本次操作` }
    }
    if (targetIndex !== currentIndex + 1) {
      return { ok: false, message: `支挡结构只能按待浇筑 → 施工中 → 待验收 → 已验收逐段推进，不能跳级` }
    }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

function validatePositiveDecimal(value: WallFormInput['结构长度'], label: string): string {
  const text = String(value ?? '').trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(text) || Number(text) <= 0) {
    return `${label}必须是大于 0 的数字，且最多保留两位小数；本次录入已退回，不能落库`
  }
  return ''
}

const validateWallLength = (value: WallFormInput['结构长度']): string => validatePositiveDecimal(value, '结构长度')
const validateWallHeight = (value: WallFormInput['结构长度']): string => validatePositiveDecimal(value, '结构高度')
const validateFoundationDepth = (value: WallFormInput['结构长度']): string => validatePositiveDecimal(value, '基础埋深')

function requiredText(input: WallFormInput, field: keyof WallFormInput, label: string): string {
  return String(input[field] ?? '').trim() ? '' : `${label}不能为空`
}

export function createWallEntry(input: WallFormInput): ActionResult {
  const rows = listRows('wall')
  const errors = [
    requiredText(input, '结构编号', '结构编号'),
    requiredText(input, '所属工程', '所属工程'),
    requiredText(input, '结构形式', '结构形式'),
    validateWallLength(input.结构长度),
    validateWallHeight(input.结构高度),
    validateFoundationDepth(input.基础埋深),
  ].filter(Boolean)
  const code = String(input.结构编号 ?? '').trim()
  const type = String(input.结构形式 ?? '').trim()
  if (code && rows.some((row) => String(row['结构编号']) === code)) {
    errors.push('结构编号已存在，不能重复登记')
  }
  if (type && !wallStructureTypes().includes(type)) {
    errors.push('结构形式必须从统一结构形式选项中选择')
  }
  if (errors.length > 0) {
    return { ok: false, message: errors.join('；') }
  }

  const row: EntryRow = {
    id: nextRowId('wall'),
    status: '待浇筑',
    pending: true,
    abnormal: false,
    结构编号: code,
    所属工程: String(input.所属工程).trim(),
    结构形式: type,
    结构长度: Number(String(input.结构长度).trim()),
    结构高度: Number(String(input.结构高度).trim()),
    基础埋深: Number(String(input.基础埋深).trim()),
    验收日期: String(input.验收日期 ?? '').trim(),
    结构状态: '待浇筑',
  }
  saveRows('wall', [row, ...rows])
  return { ok: true, message: `支挡结构 ${code} 已登记，当前状态「待浇筑」` }
}

export function updateWallEntry(id: number, input: WallFormInput): ActionResult {
  const rows = listRows('wall')
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的支挡结构` }
  }
  const current = rows[index]
  const code = String(input.结构编号 ?? '').trim()
  const errors = [
    requiredText(input, '结构编号', '结构编号'),
    requiredText(input, '所属工程', '所属工程'),
    validateWallLength(input.结构长度),
    validateWallHeight(input.结构高度),
    validateFoundationDepth(input.基础埋深),
  ].filter(Boolean)
  if (code && rows.some((row) => Number(row.id) !== id && String(row['结构编号']) === code)) {
    errors.push('结构编号已存在，不能改成重复编号')
  }
  if (errors.length > 0) {
    return { ok: false, message: errors.join('；') }
  }

  rows[index] = {
    ...current,
    结构编号: code,
    所属工程: String(input.所属工程).trim(),
    // 既有结构的结构形式沿用原值，编辑入口不再重新取值、不回炉。
    结构形式: current['结构形式'],
    结构长度: Number(String(input.结构长度).trim()),
    结构高度: Number(String(input.结构高度).trim()),
    基础埋深: Number(String(input.基础埋深).trim()),
    验收日期: String(input.验收日期 ?? '').trim(),
  }
  saveRows('wall', rows)
  return { ok: true, message: `支挡结构 ${code} 已保存，结构形式沿用既有记录` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function buildExportContent(meta: ModuleMeta): string {
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.map(csvCell).join(',')]
  for (const row of listRows(meta.key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].map(csvCell).join(','))
  }
  return `﻿${lines.join('\n')}`
}

function hashContent(content: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function todayText(): string {
  return new Date().toISOString().slice(0, 10)
}

export function exportEntries(key: string): ExportResult {
  const meta = moduleMeta(key)
  const filename = `${meta.name}-清单.csv`
  const content = buildExportContent(meta)
  const contentHash = hashContent(content)
  const ledgerKey = `${key}:${contentHash}`
  const existing = readExportLedger()[ledgerKey]
  if (existing) {
    return {
      ok: true,
      duplicate: true,
      receipt: existing,
      filename: existing.filename,
      content,
      message: `这是重复导出，只认 ${existing.exportedAt} 的第一份导出，不再新增巡查待办`,
    }
  }

  let patrolTodoId = 0
  const exportedAt = todayText()
  if (key === 'wall') {
    const patrolRows = listRows('patrol')
    patrolTodoId = nextRowId('patrol')
    const todo: EntryRow = {
      id: patrolTodoId,
      status: '待巡查',
      pending: true,
      abnormal: false,
      巡查编号: `PATR-EXPORT-${String(patrolTodoId).padStart(4, '0')}`,
      所属隐患点: '支挡结构清单导出',
      巡查人: '系统待办',
      巡查日期: exportedAt,
      坡面情况: '待核对导出清单',
      排水情况: '待核对',
      巡查结论: '支挡结构清单导出后的待处理事项',
      巡查状态: '待巡查',
    }
    saveRows('patrol', [todo, ...patrolRows])
  }

  const receipt = { moduleKey: key, contentHash, exportedAt, filename, patrolTodoId, duplicate: false }
  saveExportReceipt(receipt)
  return {
    ok: true,
    duplicate: false,
    receipt,
    filename,
    content,
    message: key === 'wall'
      ? `导出已办理，已回写到群测群防巡查待办（编号：PATR-EXPORT-${String(patrolTodoId).padStart(4, '0')}）`
      : '导出已办理',
  }
}

export function downloadEntries(key: string): ExportResult {
  const result = exportEntries(key)
  if (result.duplicate) {
    return result
  }
  const blob = new Blob([result.content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = result.filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
  return result
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
