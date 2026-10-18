import OfferPage from '../../components/OfferPage'
import type { PdfFile } from '../../components/PdfDocument'

// Публичная оферта мероприятия «Джазовый вечер для юристов 2 / Legal Night Jazz 2» (билет 2 490 ₽).
// Ссылка на неё стоит под кнопкой покупки билета (EventItem.offerPath в src/data/events.ts), в боте («Правовая информация»)
// и должна быть указана на платёжной странице Prodamus мероприятий (настройки страницы → оферта).
// Чтобы заменить файл: положите новый в public/documents/ и поменяйте version.
const OFFER: PdfFile = {
  file: '/documents/oferta-legal-night-jazz-2.pdf',
  version: '2026-10-18',
  pages: 3,
  sizeKb: 100,
  downloadName: 'oferta-legal-night-jazz-2.pdf',
}

export default function OfferEventJazz2() {
  return (
    <OfferPage
      doc={OFFER}
      heading="Публичная оферта мероприятия «Джазовый вечер для юристов 2»"
      title="Публичная оферта мероприятия «Джазовый вечер для юристов 2 / Legal Night Jazz 2»"
      date="10.10.2026"
    />
  )
}
