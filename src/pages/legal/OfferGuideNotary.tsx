import OfferPage from '../../components/OfferPage'
import type { PdfFile } from '../../components/PdfDocument'

// Оферта на Гайд «Карьера юриста в нотариате» (материал на маркетплейсе, 490 ₽).
// Чтобы заменить файл: положите новый в public/documents/ и поменяйте version.
const OFFER: PdfFile = {
  file: '/documents/oferta-gaid-kariera-yurista-v-notariate.pdf',
  version: '2026-10-18',
  pages: 5,
  sizeKb: 158,
  downloadName: 'oferta-gaid-kariera-yurista-v-notariate.pdf',
}

export default function OfferGuideNotary() {
  return (
    <OfferPage
      doc={OFFER}
      heading="Оферта на доступ к Гайду «Карьера юриста в нотариате»"
      title="Оферта на оказание информационных услуг по предоставлению доступа к Гайду «Карьера юриста в нотариате»"
      date="18.10.2026"
    />
  )
}
