import { Link } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import PdfDocument, { type PdfFile } from '../../components/PdfDocument'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

// Согласие на обработку персональных данных публикуется файлом PDF без изменений. Редакция текста — CONSENT_VERSION в
// src/lib/consent.ts (при замене файла меняйте обе константы). Согласие на рекламу — отдельный документ: /legal/marketing-consent.
const CONSENT: PdfFile = {
  file: '/documents/soglasie-na-obrabotku-personalnykh-dannykh.pdf',
  version: '2026-10-17',
  pages: 2,
  sizeKb: 75,
  downloadName: 'soglasie-na-obrabotku-personalnykh-dannykh.pdf',
}

export default function Consent() {
  useDocumentTitle('Согласие на обработку персональных данных')
  return (
    <div>
      <PageHero eyebrow="Документы" title="Согласие на обработку персональных данных" description="Редакция от 17.10.2026 г. Документ целиком, без сокращений." />
      <PdfDocument
        doc={CONSENT}
        title="Согласие на обработку персональных данных"
        note={
          <>
            Отозвать согласие можно письмом на <a className="underline hover:text-ink" href="mailto:info@legalcareerist.ru">info@legalcareerist.ru</a>. Согласие на рекламные и информационные сообщения — отдельный документ:{' '}
            <Link className="underline hover:text-ink" to="/legal/marketing-consent">читать</Link>.
          </>
        }
      />
    </div>
  )
}
