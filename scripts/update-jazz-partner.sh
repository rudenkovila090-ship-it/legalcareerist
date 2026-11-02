#!/usr/bin/env bash
# Only the partner card; keep the event URL, attribution code, API and bot unchanged.
set -euo pipefail
cd "${SITE_DIR:-/var/www/legalcareerist}"
backup_file=$(mktemp /tmp/legal-jazz-backup.XXXXXX.tar.gz)
backup_files=(src/data/eventStories.ts dist)
placeholder_existed=0
if [[ -e src/assets/noir/partner-placeholder.svg ]]; then
  backup_files+=(src/assets/noir/partner-placeholder.svg)
  placeholder_existed=1
fi
tar -czf "$backup_file" "${backup_files[@]}"
install_card() {
node --input-type=module <<'NODE'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
const file = 'src/data/eventStories.ts'
const name = 'Совет молодых адвокатов Санкт-Петербурга'
const link = 'https://t.me/sma_spb'
const image = 'src/assets/noir/partner-placeholder.svg'
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">\n  <circle cx="120" cy="120" r="120" fill="#9ca3af" />\n</svg>\n'
let source = readFileSync(file, 'utf8')
const importLine = "import partnerPlaceholder from '../assets/noir/partner-placeholder.svg'"
const member = `            {\n              name: '${name}',\n              logo: partnerPlaceholder,\n              link: { label: '@sma_spb', href: '${link}' },\n            },`
function insertAfter(anchor, addition) {
  if (source.split(anchor).length !== 2) throw Error('Не найден однозначный блок партнёров. Файл не заменён.')
  source = source.replace(anchor, anchor + '\n' + addition)
}
if (!source.includes(member)) {
  if (source.includes(name) || source.includes(link)) throw Error('Обнаружена другая запись этого партнёра; требуется проверка, чтобы не создать дубль.')
  const anchor = "            {\n              name: 'Юлия Гребенщикова',\n              logo: partnerYulia,\n              link: { label: '@yugrbbb', href: 'https://t.me/yugrbbb' },\n            },"
  insertAfter(anchor, member)
}
if (!source.includes(importLine)) {
  insertAfter("import partnerYulia from '../assets/noir/partner-yulia-grebenshchikova.webp'", importLine)
}
if (existsSync(image) && readFileSync(image, 'utf8').trim() !== svg.trim()) throw Error('Файл заполнителя уже содержит другие данные; замена остановлена.')
if (!existsSync(image)) writeFileSync(image, svg, { mode: 0o644 })
writeFileSync(file, source)
if (!readFileSync(file, 'utf8').includes(member)) throw Error('Не удалось сохранить партнёра.')
console.log('Проверено: карточка партнёра сохранена в исходнике.')
NODE
}
verify_publication() {
SITE_PUBLIC_URL="${SITE_PUBLIC_URL:-https://legalcareerist.ru/events/dzhazovyy-vecher-dlya-yuristov-2}" node --input-type=module <<'NODE'
import { readFileSync, readdirSync } from 'node:fs'
const partner = 'Совет молодых адвокатов Санкт-Петербурга'
const modules = readdirSync('dist/assets').filter(f => f.endsWith('.js') && (() => {
  const js = readFileSync('dist/assets/' + f, 'utf8')
  return js.includes(partner) && js.includes('https://t.me/sma_spb')
})())
if (!modules.length) throw Error('В сборке нет нового партнёра.')
const localHtml = readFileSync('dist/index.html', 'utf8')
const entry = localHtml.match(/<script[^>]*src=["']([^"']+)["']/)?.[1]
if (!entry?.startsWith('/assets/')) throw Error('Не найден входной файл сборки.')
// Use the existing page address exactly as provided; never add query parameters.
const page = new URL(process.env.SITE_PUBLIC_URL)
async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } })
  if (!r.ok) throw Error(`Публикация: HTTP ${r.status} для ${url.pathname}`)
  return Buffer.from(await r.arrayBuffer())
}
const html = (await get(page)).toString('utf8')
if (!html.includes(entry)) throw Error('Сайт отдаёт другую версию index.html; публикация не подтверждена.')
for (const asset of [entry, ...modules.map(f => '/assets/' + f)]) {
  if (!(await get(new URL(asset, page))).equals(readFileSync('dist' + asset))) throw Error('Публичный JS отличается от сборки: ' + asset)
}
console.log('Проверено: сайт отдаёт новую сборку с карточкой Совета молодых адвокатов.')
NODE
}
if install_card && npm run build && chmod -R a+rX dist && verify_publication; then
  printf 'Готово. Адрес мероприятия сохранён. Резервная копия: %s\n' "$backup_file"
else
  rm -rf dist
  tar -xzf "$backup_file"
  if (( ! placeholder_existed )); then rm -f src/assets/noir/partner-placeholder.svg; fi
  echo "Проверка не прошла; предыдущая версия восстановлена. Копия: $backup_file" >&2
  exit 1
fi
