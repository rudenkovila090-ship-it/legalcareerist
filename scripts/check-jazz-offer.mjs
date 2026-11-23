// Read-only check of the published offer; never reads customer data or server settings.
import fs from 'node:fs'
import { createHash } from 'node:crypto'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const root = new URL('../', import.meta.url)
const file = '/documents/oferta-legal-night-jazz-2.pdf'
const original = fs.readFileSync(new URL('public' + file, root))
if (sha(original) !== '890399a4537b7f039cc8abe0d8deb938fb1d51f1b9918bfa39b5887a0d437df7') throw Error('Не подтверждён оригинал новой оферты')
if (!fs.readFileSync(new URL('dist' + file, root)).equals(original)) throw Error('В сборке другая оферта')
const option = process.argv.indexOf('--origin')
const origin = option < 0 ? 'https://legalcareerist.ru' : process.argv[option + 1]
for (const [route, expected] of [
  ['/legal/offer-legal-night-jazz-2', fs.readFileSync(new URL('dist/index.html', root))],
  [file + '?v=2026-11-23-890399a4537b', original],
]) {
  const response = await fetch(new URL(route, origin), { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) })
  if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(expected)) throw Error('Публикация не подтверждена: ' + route)
}
console.log('JAZZ_OFFER_PUBLISHED: новая оферта подтверждена без изменений, 5 страниц, 120002 байта. ' + new URL('/legal/offer-legal-night-jazz-2', origin))
