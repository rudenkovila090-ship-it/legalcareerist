import OfferPage from '../../components/OfferPage'
import type { PdfFile } from '../../components/PdfDocument'

// Оферта на Гайд «Стипендии и гранты» (материал на маркетплейсе, 490 ₽).
// Чтобы заменить файл: положите новый в public/documents/ и поменяйте version.
const OFFER: PdfFile = {
  file: '/documents/oferta-gaid-stipendii-i-granty.pdf',
  version: '2026-10-18',
  pages: 5,
  sizeKb: 158,
  downloadName: 'oferta-gaid-stipendii-i-granty.pdf',
}

export default function OfferGuideScholarships() {
  return (
    <OfferPage
      doc={OFFER}
      heading="Оферта на доступ к Гайду «Стипендии и гранты»"
      title="Оферта на оказание информационных услуг по предоставлению доступа к Гайду «Стипендия и гранты»"
      date="18.10.2026"
    />
  )
}
