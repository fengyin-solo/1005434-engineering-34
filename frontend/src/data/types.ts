/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type WallFormInput = {
  结构编号: string
  所属工程: string
  结构形式: string
  结构长度: number | string
  结构高度: number | string
  基础埋深: number | string
  验收日期: string
}

export type ExportReceipt = {
  moduleKey: string
  contentHash: string
  exportedAt: string
  filename: string
  patrolTodoId: number
  duplicate: boolean
}

export type ExportResult = {
  ok: boolean
  duplicate?: boolean
  receipt?: ExportReceipt
  filename: string
  content: string
  message: string
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
