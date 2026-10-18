import OfferPage from '../../components/OfferPage'
import type { PdfFile } from '../../components/PdfDocument'

// Оферта на Лонглист «Юридические мероприятия» (материал на маркетплейсе, 990 ₽, пока в разработке).
// Чтобы заменить файл: положите новый в public/documents/ и поменяйте version.
const OFFER: PdfFile = {
  file: '/documents/oferta-longlist-yuridicheskie-meropriyatiya.pdf',
  version: '2026-10-18',
  pages: 5,
  sizeKb: 158,
  downloadName: 'oferta-longlist-yuridicheskie-meropriyatiya.pdf',
}

export default function OfferLawyers() {
  return <OfferPage doc={OFFER} heading="Оферта на доступ к Лонглисту «Юридические мероприятия»" date="18.10.2026" />
}
