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
  /** 为 true 时状态只能按 statuses 顺序逐段推进，跳级一律拦下。 */
  stepwise?: boolean
  /** 字段候选值：登记、筛选等入口统一从这里取数。 */
  fieldOptions?: Record<string, string[]>
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type ExportResult = {
  filename: string
  content: string
  /** 为 true 表示这次导出与先到的那一份内容一致，已被拦下、不再重复记账。 */
  duplicate: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
