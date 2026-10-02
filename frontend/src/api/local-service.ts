import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, appendExportRecord, listExportRecords, listRows, resetRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow, ExportResult, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
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
  if (meta.stepwise) {
    const currentIndex = meta.statuses.indexOf(current)
    const targetIndex = meta.statuses.indexOf(target)
    if (targetIndex !== currentIndex + 1) {
      return {
        ok: false,
        message: `${meta.entity}须按「${meta.statuses.join('→')}」逐段推进，不能从「${current}」跳到「${target}」，本次操作已拦下`,
      }
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

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

// 给导出内容算个指纹（djb2）：内容没变就视为同一份，重复导出只认先到的那一份。
function fingerprint(content: string): string {
  let hash = 5381
  for (let index = 0; index < content.length; index += 1) {
    hash = ((hash << 5) + hash + content.charCodeAt(index)) >>> 0
  }
  return hash.toString(16)
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function formatTimestamp(date: Date): string {
  return `${formatDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

// 导出完成后回写群测群防巡查：那边会多出一条「待巡查」待办，提醒拿清单去现场核对。
function writeBackPatrolTodo(source: ModuleMeta, filename: string): void {
  const patrolMeta = moduleMeta('patrol')
  const rows = listRows('patrol')
  const nextId = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const todo: EntryRow = {
    id: nextId,
    status: patrolMeta.statuses[0],
    pending: true,
    abnormal: false,
    巡查编号: `PATR-${String(nextId).padStart(4, '0')}`,
    所属隐患点: '待分派',
    巡查人: '系统回写',
    巡查日期: formatDate(new Date()),
    坡面情况: '待现场核对',
    排水情况: '待现场核对',
    巡查结论: `「${source.name}」已导出《${filename}》，待巡查核对`,
    巡查状态: '待处理',
  }
  saveRows('patrol', [...rows, todo])
}

export function exportEntries(key: string): ExportResult {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  const filename = `${meta.name}-清单.csv`
  const content = `﻿${lines.join('\n')}`
  const stamp = fingerprint(content)
  const existing = listExportRecords().find(
    (record) => record.module === key && record.fingerprint === stamp,
  )
  if (existing) {
    return {
      filename: existing.filename,
      content,
      duplicate: true,
      message: `重复导出已拦下：与 ${existing.exportedAt} 导出的《${existing.filename}》内容一致，以先到的那一份为准`,
    }
  }
  const exportedAt = formatTimestamp(new Date())
  appendExportRecord({ module: key, fingerprint: stamp, filename, exportedAt })
  writeBackPatrolTodo(meta, filename)
  return {
    filename,
    content,
    duplicate: false,
    message: `《${filename}》已导出，结果已回写群测群防巡查待办`,
  }
}

export function downloadEntries(key: string): ExportResult {
  const result = exportEntries(key)
  if (result.duplicate) {
    // 重复导出只认先到的那一份：不再生成新文件，也不再回写巡查待办。
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

// 结构长度：单位米，大于 0、最多两位小数（精确到厘米）；精度不对的直接退回，不让它落库。
const WALL_LENGTH_PATTERN = /^\d+(\.\d{1,2})?$/

export function registerWallEntry(input: Record<string, string>): ActionResult {
  const meta = moduleMeta('wall')
  const project = (input['所属工程'] ?? '').trim()
  if (!project) {
    return { ok: false, message: '所属工程不能为空，已退回' }
  }
  const lengthRaw = (input['结构长度'] ?? '').trim()
  if (!WALL_LENGTH_PATTERN.test(lengthRaw) || Number(lengthRaw) <= 0) {
    return {
      ok: false,
      message: `结构长度「${lengthRaw || '空'}」精度不对：须为大于 0 的数值、最多两位小数，已退回未落库`,
    }
  }
  const rows = listRows('wall')
  const allowedForms = meta.fieldOptions?.['结构形式'] ?? []
  // 同一工程已有支挡记录时，结构形式沿用既有记录里的值，不回炉重取。
  const siblings = rows.filter((row) => String(row['所属工程']) === project)
  let form: string
  let inherited = false
  if (siblings.length > 0) {
    form = String(siblings[siblings.length - 1]['结构形式'])
    inherited = true
  } else {
    form = (input['结构形式'] ?? '').trim()
    if (!allowedForms.includes(form)) {
      return {
        ok: false,
        message: `结构形式「${form || '空'}」不在登记范围（${allowedForms.join('、')}）内，已退回`,
      }
    }
  }
  const nextId = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const entry: EntryRow = {
    id: nextId,
    status: meta.statuses[0],
    pending: true,
    abnormal: false,
    结构编号: (input['结构编号'] ?? '').trim() || `WALL-${String(nextId).padStart(4, '0')}`,
    所属工程: project,
    结构形式: form,
    结构长度: lengthRaw,
    结构高度: (input['结构高度'] ?? '').trim(),
    基础埋深: (input['基础埋深'] ?? '').trim(),
    验收日期: '',
    结构状态: meta.statuses[0],
  }
  saveRows('wall', [...rows, entry])
  const inheritNote = inherited ? `，结构形式沿用既有记录「${form}」` : ''
  return { ok: true, message: `${meta.entity}已登记，当前状态「${meta.statuses[0]}」${inheritNote}` }
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
