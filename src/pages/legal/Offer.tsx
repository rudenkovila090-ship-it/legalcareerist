import OfferPage from '../../components/OfferPage'
import type { PdfFile } from '../../components/PdfDocument'

// Оферта на Лонглист «Студенческие юридические мероприятия» (материал на маркетплейсе, 490 ₽).
// Чтобы заменить файл: положите новый в public/documents/ и поменяйте version.
const OFFER: PdfFile = {
  file: '/documents/oferta-longlist-studencheskie-yuridicheskie-meropriyatiya.pdf',
  version: '2026-10-18',
  pages: 5,
  sizeKb: 157,
  downloadName: 'oferta-longlist-studencheskie-yuridicheskie-meropriyatiya.pdf',
}

export default function Offer() {
  return <OfferPage
      doc={OFFER}
      heading="Оферта на доступ к Лонглисту «Студенческие юридические мероприятия»"
      title="Оферта на оказание информационных услуг по предоставлению доступа к Лонглисту «Студенческие юридические мероприятия»"
      date="18.10.2026"
    />
}
