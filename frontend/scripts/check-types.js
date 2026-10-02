import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vueTsc = join(root, 'node_modules', 'vue-tsc', 'bin', 'vue-tsc.js')

if (!existsSync(vueTsc)) {
  console.error('类型检查失败，发版已拦截：缺少依赖 vue-tsc。请先在 frontend 目录执行 npm install。')
  process.exit(1)
}

const result = spawnSync(process.execPath, [vueTsc, '--noEmit', '--pretty', 'false'], {
  cwd: root,
  encoding: 'utf8',
})
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()

if (result.status === 0) {
  console.log('类型检查通过。')
  process.exit(0)
}

const matches = output
  .split(/\r?\n/)
  .map((line) => line.match(/^([^\s()][^()]*?\.(?:vue|ts|tsx|js|mjs|cjs))(?:\((\d+),(\d+)\))?:/))
  .filter(Boolean)
const files = [...new Set(
  matches.map((match) => `${match[1]}${match[2] ? `:${match[2]}${match[3] ? `:${match[3]}` : ''}` : ''}`),
)].sort()

console.error('类型检查失败，发版已拦截：')
if (files.length > 0) {
  console.error('\n报错文件：')
  files.forEach((file) => console.error(`- ${file}`))
}
if (output) {
  console.error('\n原始类型错误：')
  console.error(output)
}
process.exit(result.status ?? 1)
