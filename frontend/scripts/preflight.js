import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function run(name, script) {
  console.log(`\n▶ 执行 ${name}`)
  const result = spawnSync(process.execPath, [join(root, 'scripts', script)], {
    cwd: root,
    stdio: 'inherit',
  })
  return result.status ?? 1
}

const dependencyStatus = run('依赖校验', 'check-dependencies.js')
const typeStatus = run('类型检查', 'check-types.js')

if (dependencyStatus !== 0 || typeStatus !== 0) {
  console.error('\n发版自检闸口未通过，已阻止本次发版。')
  console.error('请按上面的“缺失依赖”或“报错文件”修复后重新执行 npm run preflight。')
  console.error('若问题版本已经发出，可重新部署上一个 release 镜像/静态产物；Swarm 服务也可执行：docker service update --rollback frontend。')
  process.exit(1)
}

console.log('\n发版自检通过：依赖校验与类型检查均已通过，可以打包。')
