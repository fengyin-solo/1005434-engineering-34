#!/usr/bin/env node
/**
 * 退回上一版：按 releases/manifest.json 把当前版的前一版恢复到 frontend/dist。
 * 路径由脚本自身位置推导，不写死。
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FRONTEND_DIST = path.join(ROOT, 'frontend', 'dist')
const RELEASES = path.join(ROOT, 'releases')
const MANIFEST = path.join(RELEASES, 'manifest.json')

if (!existsSync(MANIFEST)) {
  console.error('还没有任何发版记录，无可退回。')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const index = manifest.releases.findIndex((item) => item.id === manifest.current)

if (index < 0) {
  console.error(`当前版本 ${manifest.current} 不在发版记录里，无法退回。`)
  process.exit(1)
}
if (index === 0) {
  console.error(`${manifest.current} 已是最早的一版，没有可退回的上一版。`)
  process.exit(1)
}

const previous = manifest.releases[index - 1]
const source = path.join(RELEASES, previous.id)
if (!existsSync(source)) {
  console.error(`上一版 ${previous.id} 的归档已不在 releases/ 下，无法退回。`)
  process.exit(1)
}

rmSync(FRONTEND_DIST, { recursive: true, force: true })
cpSync(source, FRONTEND_DIST, { recursive: true })
manifest.current = previous.id
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`已退回上一版 ${previous.id}（构建于 ${previous.builtAt}），frontend/dist 已替换。`)
console.log('发版记录仍保留，重新执行 make release 会基于当前代码再发一版。')
