import fs from 'node:fs'
import path from 'node:path'

// Only a compiled public website may be made readable. Never walk an app/data tree.
export function staticAccessPlan(directory) {
  const root = fs.realpathSync(directory)
  for (const name of ['.git', '.env', 'server', 'node_modules', 'package.json', 'pending-joins.json', 'bot-users.json']) {
    if (fs.existsSync(path.join(root, name))) throw Error('Корень содержит закрытые файлы приложения: ' + name)
  }
  const index = path.join(root, 'index.html')
  const html = fs.readFileSync(index, 'utf8')
  const entry = html.match(/<script\b[^>]*\bsrc=["'](\/assets\/[^"']+\.js)["']/)?.[1]
  if (!entry || !html.includes('id="root"') && !html.includes("id='root'")) throw Error('Не подтверждена сборка сайта с /assets/ и #root')
  const files = [], directories = [], changes = []
  const walk = file => {
    const stat = fs.lstatSync(file), mode = stat.mode & 0o777
    if (stat.isSymbolicLink() || !stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1)) throw Error('Небезопасный тип файла в публичной сборке: ' + path.relative(root, file))
    if (/(^|\/)\.(?:env(?:\..*)?|git)$/.test(path.relative(root, file))) throw Error('Закрытый файл в публичной сборке')
    const desired = mode | (stat.isDirectory() ? 0o555 : 0o444)
    if (desired !== mode) changes.push({path:file, before:mode, after:desired, directory:stat.isDirectory()})
    if (stat.isDirectory()) {
      directories.push(file)
      for (const name of fs.readdirSync(file)) walk(path.join(file, name))
    } else files.push(file)
  }
  walk(root)
  if (!files.includes(path.join(root, entry))) throw Error('Отсутствует входной JS сборки')
  return {root, html, entry, files, directories, changes}
}

export function applyStaticAccess(plan, record) {
  // Finish all safety checks before the first permission change.
  const current = staticAccessPlan(plan.root)
  if (current.html !== plan.html || JSON.stringify(current.changes) !== JSON.stringify(plan.changes)) throw Error('Сборка изменилась во время проверки')
  for (const change of current.changes) {
    record(change)
    fs.chmodSync(change.path, change.after)
  }
  return current.changes.length
}

export function ancestorDirectories(directory) {
  const result = []
  for (let p = path.dirname(fs.realpathSync(directory)); p !== path.dirname(p); p = path.dirname(p)) result.unshift(p)
  return result
}

export function nginxWorkerUser(config) {
  // nginx -T emits the top-level user directive; do not print the configuration.
  return config.replace(/#[^\n]*/g, '').match(/(?:^|[;{}\n])\s*user\s+([a-z_][a-z0-9_-]*)\b[^;]*;/i)?.[1] || null
}

export function traversalAcl(acl, worker) {
  const addExecute = permissions => (permissions || '---').slice(0,2) + 'x'
  const existing = acl.split('\n').find(line=>line.startsWith('user:'+worker+':'))?.split(':')[2]?.slice(0,3)
  const mask = acl.match(/^mask::([rwx-]{3})/m)?.[1] || acl.match(/^group::([rwx-]{3})/m)?.[1]
  if(!mask)throw Error('Не определена маска ACL')
  // Do not let setfacl recalculate the mask and enable previously masked r/w.
  return ['--no-mask','-m', 'u:'+worker+':'+addExecute(existing)+',m::'+addExecute(mask)]
}
