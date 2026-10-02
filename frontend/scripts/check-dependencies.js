import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { builtinModules } from 'node:module'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagePath = join(root, 'package.json')
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))

const declaredPackages = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.devDependencies ?? {}),
])
const builtins = new Set(builtinModules)
const scannedExtensions = new Set(['.ts', '.tsx', '.vue', '.js', '.mjs', '.cjs'])
const ignoredDirectories = new Set(['node_modules', 'dist', '.git', '.vite', 'coverage'])
const importPattern = /(?:from\s+|import\s+|export\s+[\s\S]*?from\s+|require\s*\(\s*)['"]([^'"]+)['"]/g

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      return ignoredDirectories.has(name) ? [] : walk(path)
    }
    return scannedExtensions.has(name.slice(name.lastIndexOf('.'))) ? [path] : []
  })
}

function packageNameFromSpecifier(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('@/')) {
    return null
  }
  if (specifier.startsWith('node:')) {
    return null
  }
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null
  }
  return specifier.split('/')[0]
}

const filesToScan = [...walk(join(root, 'src'))]
const viteConfig = join(root, 'vite.config.ts')
if (existsSync(viteConfig)) filesToScan.push(viteConfig)

const importsByPackage = new Map()
for (const file of filesToScan) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(importPattern)) {
    const name = packageNameFromSpecifier(match[1])
    if (!name || builtins.has(name)) continue
    const files = importsByPackage.get(name) ?? new Set()
    files.add(file.replace(`${root}/`, ''))
    importsByPackage.set(name, files)
  }
}

const missingDeclarations = []
const missingInstalls = []
for (const [name, files] of [...importsByPackage.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const fileList = [...files].sort()
  if (!declaredPackages.has(name)) {
    missingDeclarations.push({ name, files: fileList })
  }
  const packageDirectory = name.startsWith('@')
    ? join(root, 'node_modules', name.split('/')[0], name.split('/')[1])
    : join(root, 'node_modules', name)
  if (!existsSync(packageDirectory)) {
    missingInstalls.push({ name, files: fileList })
  }
}

if (missingDeclarations.length === 0 && missingInstalls.length === 0) {
  console.log('依赖校验通过：源码使用的外部包均已声明并安装。')
  process.exit(0)
}

console.error('依赖校验失败，发版已拦截：')
if (missingDeclarations.length > 0) {
  console.error('\n缺失 package.json 声明：')
  for (const item of missingDeclarations) {
    console.error(`- ${item.name}`)
    item.files.forEach((file) => console.error(`  引用文件：${file}`))
  }
}
if (missingInstalls.length > 0) {
  console.error('\n缺失已安装依赖（先在 frontend 目录执行 npm install）：')
  for (const item of missingInstalls) {
    console.error(`- ${item.name}`)
    item.files.forEach((file) => console.error(`  引用文件：${file}`))
  }
}
process.exit(1)
