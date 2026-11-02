// Read-only publication check. Never reads server/.env or customer data.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const digest = data => createHash('sha256').update(data).digest('hex').slice(0, 16)
const partner = 'Совет молодых адвокатов Санкт-Петербурга'
const source = readFileSync('src/data/eventStories.ts', 'utf8')
console.log('SOURCE_PARTNER:', source.includes(partner) && source.includes('https://t.me/sma_spb'))
const localHtml = readFileSync('dist/index.html', 'utf8')
const entryOf = html => html.match(/<script[^>]*src=["']([^"']+)["']/)?.[1]
const localEntry = entryOf(localHtml)
const partnerModules = readdirSync('dist/assets').filter(f => f.endsWith('.js') && readFileSync('dist/assets/' + f, 'utf8').includes('https://t.me/sma_spb'))
console.log('LOCAL_ENTRY:', localEntry)
console.log('LOCAL_PARTNER_MODULES:', partnerModules.join(', ') || 'NONE')
for (const file of ['.', 'dist', 'dist/index.html']) {
  console.log('MODE:', file, (statSync(file).mode & 0o777).toString(8))
}
let matched = false
try {
  const base = new URL(process.env.SITE_PUBLIC_URL || 'https://legalcareerist.ru/events/dzhazovyy-vecher-dlya-yuristov-2')
  const page = base
  const get = async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } })
    if (!response.ok) throw Error(`HTTP ${response.status}: ${url.pathname}`)
    return Buffer.from(await response.arrayBuffer())
  }
  const publicHtml = (await get(page)).toString('utf8')
  const publicEntry = entryOf(publicHtml)
  console.log('PUBLIC_ENTRY:', publicEntry || 'NONE')
  matched = Boolean(localEntry && localEntry.startsWith('/assets/') && localEntry === publicEntry && partnerModules.length)
  if (localEntry && localEntry.startsWith('/assets/')) {
    for (const asset of [localEntry, ...partnerModules.map(f => '/assets/' + f)]) {
      try {
        const remote = await get(new URL(asset, base))
        const local = readFileSync('dist' + asset)
        const same = remote.equals(local)
        console.log('ASSET:', asset, 'MATCH:', same, 'LOCAL_SHA:', digest(local), 'PUBLIC_SHA:', digest(remote))
        matched = matched && same
      } catch (error) {
        matched = false
        console.log('ASSET_ERROR:', asset, error.message)
      }
    }
  }
  console.log('PUBLICATION_MATCH:', matched)
} catch (error) {
  console.log('PUBLIC_CHECK_ERROR:', error.message)
}

// Only print public host names and root/alias paths from the matching vhosts.
const nginx = spawnSync('nginx', ['-T'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
if (nginx.status === 0) {
  const config = nginx.stdout.replace(/#[^\n]*/g, '')
  const starts = [...config.matchAll(/\bserver\s*\{/g)]
  for (const start of starts) {
    let depth = 1, end = start.index + start[0].length
    for (; end < config.length && depth; end++) {
      if (config[end] === '{') depth++
      if (config[end] === '}') depth--
    }
    const block = config.slice(start.index, end)
    if (!/\bserver_name\s+[^;]*\blegalcareerist\.ru\b/.test(block)) continue
    for (const directive of block.matchAll(/\b(server_name|root|alias|open_file_cache|gzip_static|brotli_static)\s+([^;]+);/g)) {
      console.log('NGINX:', directive[1], directive[2].trim())
    }
  }
} else console.log('NGINX_CONFIG:', 'unavailable')
console.log('READ_ONLY: no site files or settings changed')
process.exitCode = matched ? 0 : 1
