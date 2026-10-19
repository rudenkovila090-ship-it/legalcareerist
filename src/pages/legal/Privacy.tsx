import PageHero from '../../components/PageHero'
import PdfDocument, { type PdfFile } from '../../components/PdfDocument'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

// Политика обработки персональных данных публикуется файлом PDF без изменений: полный текст документа, как он утверждён.
const POLICY: PdfFile = {
  file: '/documents/politika-obrabotki-personalnykh-dannykh.pdf',
  version: '2026-10-17-2',
  pages: 21,
  sizeKb: 461,
  downloadName: 'politika-obrabotki-personalnykh-dannykh.pdf',
}

export default function Privacy() {
  useDocumentTitle('Политика обработки персональных данных')
  return (
    <div>
      <PageHero eyebrow="Документы" title="Политика в области обработки персональных данных" description="Редакция от 17.10.2026 г. Документ целиком, без сокращений." />
      <PdfDocument
        doc={POLICY}
        title="Политика в области обработки персональных данных"
        note={
          <>
            Вопросы по обработке персональных данных, отзыв согласия и запросы на удаление данных: <a className="underline hover:text-ink" href="mailto:info@legalcareerist.ru">info@legalcareerist.ru</a>.
          </>
        }
      />
    </div>
  )
}
