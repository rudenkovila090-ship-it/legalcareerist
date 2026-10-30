// Материалы маркетплейса, которые можно получить на сайте: платные (MATERIALS в prodamus.js — там цену задаёт сервер, а не страница)
// и бесплатные. Бесплатные берутся из каталога сайта (src/data/materials.ts → server/data/material-catalog.json, строится при `npm run build`):
// цена 0 и признак realPurchase. Денег они не касаются, поэтому подделывать в запросе нечего: название и признак «бесплатно» всё равно решает сервер.
import fs from 'node:fs'
import path from 'node:path'
import { MATERIALS } from './prodamus.js'

const CATALOG_FILE = path.join(import.meta.dirname, '..', 'data', 'material-catalog.json')

let cache = { mtime: 0, free: {} }

/** Бесплатные материалы: { адрес: { title, price: 0, free: true } }. Перечитывается, когда файл каталога обновился (после сборки). */
function freeCatalog() {
  try {
    const mtime = fs.statSync(CATALOG_FILE).mtimeMs
    if (mtime !== cache.mtime) {
      const list = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'))
      const free = {}
      for (const m of Array.isArray(list) ? list : []) {
        if (m?.slug && m.price === 0 && m.realPurchase === true && !m.inDevelopment && !MATERIALS[m.slug]) free[m.slug] = { title: String(m.title ?? m.slug), price: 0, free: true, accessUrl: '' }
      }
      cache = { mtime, free }
    }
  } catch {
    cache = { mtime: 0, free: {} }
  }
  return cache.free
}

/** Материал по адресу: { title, price, free, accessUrl } или null, если такого нет. */
export function materialInfo(slug) {
  const key = String(slug ?? '')
  if (Object.hasOwn(MATERIALS, key)) return { ...MATERIALS[key], free: false }
  const free = freeCatalog()
  return Object.hasOwn(free, key) ? free[key] : null
}

/** Все материалы с выдачей на сайте: [адрес, описание]. */
export function allMaterials() {
  return [...Object.entries(MATERIALS).map(([slug, m]) => [slug, { ...m, free: false }]), ...Object.entries(freeCatalog())]
}
