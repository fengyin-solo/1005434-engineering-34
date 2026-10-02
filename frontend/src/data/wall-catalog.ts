import { listRows } from './local-store'

// 支挡结构形式只保留这一份选项：登记、筛选和后续编辑都从这里取数。
export const WALL_STRUCTURE_TYPES = ['重力式挡土墙', '悬臂式挡土墙', '扶壁式挡土墙', '桩板式挡土墙', '锚杆挡土墙'] as const
export type WallStructureType = typeof WALL_STRUCTURE_TYPES[number]

export function wallStructureTypes(): string[] {
  const existing = listRows('wall')
    .map((row) => String(row['结构形式'] ?? '').trim())
    .filter(Boolean)
  return [...new Set([...WALL_STRUCTURE_TYPES, ...existing])]
}
