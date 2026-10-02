#!/usr/bin/env node
/**
 * 发版自检闸口：类型检查 → 依赖校验 → 工作区检查 → 干净目录克隆安装构建，全部通过才归档发版。
 * 任一环节不过就卡住本次发版，报错文件与缺失依赖逐条列出。
 * 所有路径都由脚本自身位置推导，不写死；克隆目标是系统临时目录。
 */
import { execFileSync, spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FRONTEND = path.join(ROOT, 'frontend')
const RELEASES = path.join(ROOT, 'releases')
const MANIFEST = path.join(RELEASES, 'manifest.json')
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function tail(text, lines = 15) {
  const all = text.trim().split('\n')
  return all.slice(Math.max(0, all.length - lines)).join('\n')
}

/* ---------- 闸口一：类型检查 ---------- */
function checkTypes() {
  const result = run(NPM, ['run', 'typecheck'], FRONTEND)
  const output = `${result.stdout}\n${result.stderr}`
  const files = [
    ...new Set(
      output
        .split('\n')
        .filter((line) => /error TS\d+/.test(line))
        .map((line) => line.split(/[(:]/)[0].trim())
        .filter(Boolean),
    ),
  ]
  return { ok: result.ok, files, output }
}

/* ---------- 闸口二：依赖校验 ---------- */
function checkDependencies() {
  const pkg = JSON.parse(readFileSync(path.join(FRONTEND, 'package.json'), 'utf8'))
  const declared = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]
  if (!existsSync(path.join(FRONTEND, 'node_modules'))) {
    return {
      ok: false,
      missing: declared,
      others: ['frontend/node_modules 不存在，请先在 frontend 下执行 npm install'],
    }
  }
  const result = run(NPM, ['ls', '--all', '--json'], FRONTEND)
  let report = null
  try {
    report = JSON.parse(result.stdout)
  } catch {
    report = null
  }
  const problems = report?.problems ?? []
  const missing = problems
    .filter((item) => item.startsWith('missing:'))
    .map((item) => item.replace(/^missing:\s*/, '').split(',')[0])
  const others = problems.filter((item) => !item.startsWith('missing:'))
  return { ok: result.ok && missing.length === 0 && others.length === 0, missing, others }
}

/* ---------- 闸口三：工作区必须是已提交状态 ---------- */
function checkWorktree() {
  const result = run('git', ['status', '--porcelain'], ROOT)
  const changes = result.stdout.split('\n').filter((line) => line.trim() !== '')
  return { ok: result.ok && changes.length === 0, changes }
}

/* ---------- 闸口四：克隆到干净目录，装依赖、打包一次通过 ---------- */
function verifyCleanBuild() {
  const work = mkdtempSync(path.join(tmpdir(), 'geohazard-release-'))
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  const steps = [
    ['克隆仓库到干净目录', () => run('git', ['clone', '--quiet', ROOT, work], ROOT)],
    ['检出当前提交', () => run('git', ['checkout', '--quiet', sha], work)],
    [
      '干净目录安装依赖',
      () => {
        const cloneFrontend = path.join(work, 'frontend')
        const hasLock = existsSync(path.join(cloneFrontend, 'package-lock.json'))
        return run(
          NPM,
          hasLock ? ['ci', '--no-audit', '--no-fund'] : ['install', '--no-audit', '--no-fund'],
          cloneFrontend,
        )
      },
    ],
    ['干净目录打包', () => run(NPM, ['run', 'build'], path.join(work, 'frontend'))],
  ]
  for (const [label, step] of steps) {
    const result = step()
    if (!result.ok) {
      return { ok: false, work, sha, failedStep: label, output: `${result.stdout}\n${result.stderr}` }
    }
  }
  return { ok: true, work, sha, distDir: path.join(work, 'frontend', 'dist') }
}

/* ---------- 归档与清单 ---------- */
function readManifest() {
  if (!existsSync(MANIFEST)) {
    return { current: null, releases: [] }
  }
  return JSON.parse(readFileSync(MANIFEST, 'utf8'))
}

function timestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

function main() {
  console.log('发版自检闸口启动，先过检查再谈发版。\n')

  let blocked = false

  const types = checkTypes()
  if (types.ok) {
    console.log('✓ 类型检查通过')
  } else {
    blocked = true
    console.error('✗ 类型检查未通过，报错文件：')
    for (const file of types.files) {
      console.error(`  - ${file}`)
    }
    console.error(`  详情（末尾几行）：\n${tail(types.output, 8)}`)
  }

  const deps = checkDependencies()
  if (deps.ok) {
    console.log('✓ 依赖校验通过')
  } else {
    blocked = true
    console.error('✗ 依赖校验未通过，缺失依赖：')
    for (const name of deps.missing) {
      console.error(`  - ${name}`)
    }
    if (deps.others.length > 0) {
      console.error('  其他依赖问题：')
      for (const item of deps.others) {
        console.error(`  - ${item}`)
      }
    }
  }

  const worktree = checkWorktree()
  if (worktree.ok) {
    console.log('✓ 工作区干净，改动均已提交')
  } else {
    blocked = true
    console.error('✗ 工作区还有未提交改动，干净目录验证不到这些内容，请先提交：')
    for (const line of worktree.changes.slice(0, 10)) {
      console.error(`  - ${line}`)
    }
  }

  if (blocked) {
    console.error('\n本次发版已卡住：先解决以上问题，再重新执行 make release。')
    process.exit(1)
  }

  console.log('\n开始把仓库克隆到干净目录，装依赖再打包验证…')
  const clean = verifyCleanBuild()
  if (!clean.ok) {
    console.error(`✗ 干净目录「${clean.failedStep}」失败，本地环境与打包产物对不上，发版已卡住。`)
    console.error(`  现场保留在 ${clean.work} ，可进去排查。`)
    console.error(`  输出（末尾几行）：\n${tail(clean.output, 10)}`)
    process.exit(1)
  }
  console.log('✓ 干净目录克隆、安装、打包一次通过')

  const pkg = JSON.parse(readFileSync(path.join(FRONTEND, 'package.json'), 'utf8'))
  const id = `v${pkg.version}-${timestamp()}`
  mkdirSync(RELEASES, { recursive: true })
  // 归档用干净目录里打出来的产物，保证发出去的和从零构建的一致。
  cpSync(clean.distDir, path.join(RELEASES, id), { recursive: true })
  rmSync(path.join(FRONTEND, 'dist'), { recursive: true, force: true })
  cpSync(clean.distDir, path.join(FRONTEND, 'dist'), { recursive: true })

  const manifest = readManifest()
  manifest.releases.push({
    id,
    version: pkg.version,
    commit: clean.sha,
    builtAt: new Date().toISOString(),
  })
  manifest.current = id
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
  rmSync(clean.work, { recursive: true, force: true })

  console.log(`\n✓ 发版完成：${id}（提交 ${clean.sha.slice(0, 7)}）`)
  console.log('  产物已归档到 releases/，frontend/dist 已同步。')
  console.log('  如需退回上一版：make rollback')
}

main()
