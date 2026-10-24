// Новая личная ссылка на купленный материал (7 дней): когда покупатель не успел скачать, потерял письмо или файл загрузили позже.
// Запуск из папки server с настройками из .env (удобнее через scripts/material-link.sh):
//   node --env-file=.env scripts/materialLink.js <почта | телефон | начало токена покупки> [--send]
// Без --send ссылки только печатаются (их можно отправить вручную); с --send уходит такое же письмо, как после оплаты.
import { listPurchases } from '../lib/materialsStore.js'
import { MATERIALS } from '../lib/prodamus.js'
import { getMaterialPdf } from '../lib/materialPdfs.js'
import { issueMaterialLink } from '../lib/materialLinks.js'
import { composeMaterialMail, formatMoscowDateTime } from '../lib/materialMail.js'
import { sendMail, mailConfigured } from '../lib/mailer.js'
import { normalizePhone } from '../lib/jsonStore.js'

const args = process.argv.slice(2)
const send = args.includes('--send')
const query = args.find((a) => !a.startsWith('--'))
if (!query) {
  console.error('Пример: bash scripts/material-link.sh buyer@example.com [--send]   (почта, телефон или начало токена покупки)')
  process.exit(1)
}
const SITE_URL = (process.env.SITE_URL || 'https://legalcareerist.ru').replace(/\/$/, '')
const SUPPORT_HANDLE = process.env.SUPPORT_HANDLE || '@legalcareerist_support'

const q = query.trim().toLowerCase()
const phoneQuery = normalizePhone(query)
const found = listPurchases().filter(
  (p) => p.paid && (String(p.email ?? '').toLowerCase() === q || (phoneQuery.length >= 11 && normalizePhone(p.phone ?? '') === phoneQuery) || (q.length >= 6 && String(p.token).startsWith(q))),
)
if (!found.length) {
  console.error(`Оплаченных покупок материалов по «${query}» не найдено.`)
  process.exit(1)
}
if (send && !mailConfigured()) {
  console.error('Почта не настроена (SMTP в server/.env): письмо не отправить. Запустите без --send и перешлите ссылку вручную.')
  process.exit(1)
}

for (const p of found.sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0))) {
  const material = MATERIALS[p.materialSlug]
  const title = material?.title ?? p.materialSlug
  console.log(`\n«${title}» — ${p.name || 'без имени'}, ${p.email || 'почты нет'}, оплачено ${p.paidAt ? formatMoscowDateTime(p.paidAt) : 'дата не записана'}`)
  if (!getMaterialPdf(p.materialSlug)) {
    console.log(`  ⚠️ Файл материала не загружен на сайт: сначала bash scripts/upload-material.sh ${p.materialSlug} файл.pdf`)
    continue
  }
  const link = issueMaterialLink(p.token)
  const downloadUrl = `${SITE_URL}/materials/download?token=${link.token}`
  console.log(`  Ссылка (до ${formatMoscowDateTime(link.expiresAt)} мск): ${downloadUrl}`)
  if (!send) continue
  if (!p.email) {
    console.log('  ⚠️ У покупателя нет почты: письмо не отправлено, перешлите ссылку вручную.')
    continue
  }
  const { subject, text } = composeMaterialMail({
    name: p.name,
    title,
    downloadUrl,
    expiresAt: link.expiresAt,
    accessUrl: material?.accessUrl,
    reviewUrl: `${SITE_URL}/materials/${p.materialSlug}?review=${p.token}#reviews`,
    supportHandle: SUPPORT_HANDLE,
  })
  const r = await sendMail({ to: p.email, subject, text })
  console.log(r.ok ? `  ✉️ Письмо отправлено на ${p.email}` : `  ❌ Письмо не ушло: ${r.error}`)
}
