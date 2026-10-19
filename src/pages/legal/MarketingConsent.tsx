import { Link } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import PdfDocument, { type PdfFile } from '../../components/PdfDocument'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

// Согласие на рекламные и информационные сообщения (ст. 18 38-ФЗ «О рекламе»): необязательная третья галочка под формами
// (см. ConsentCheck). Публикуется файлом PDF без изменений; не объединяется с согласием на обработку (/legal/consent) и не
// является условием покупки или услуги. Редакция для журнала согласий — MARKETING_CONSENT_VERSION в src/lib/consent.ts
// (при замене файла меняйте её вместе с version ниже).
const MARKETING: PdfFile = {
  file: '/documents/soglasie-na-reklamno-informatsionnye-soobshcheniya.pdf',
  version: '2026-10-17',
  pages: 2,
  sizeKb: 87,
  downloadName: 'soglasie-na-reklamno-informatsionnye-soobshcheniya.pdf',
}

export default function MarketingConsent() {
  useDocumentTitle('Согласие на получение рекламных и информационных сообщений')
  return (
    <div>
      <PageHero eyebrow="Документы" title="Согласие на рекламно-информационные сообщения" description="Редакция от 01.09.2025 г. Документ целиком, без сокращений." />
      <PdfDocument
        doc={MARKETING}
        title="Согласие на рекламно-информационные сообщения"
        note={
          <>
            Отказаться от рассылки можно в любой момент: командой /stop_newsletter в боте или письмом на <a className="underline hover:text-ink" href="mailto:info@legalcareerist.ru">info@legalcareerist.ru</a>. Согласие на обработку персональных данных — отдельный документ:{' '}
            <Link className="underline hover:text-ink" to="/legal/consent">читать</Link>.
          </>
        }
      />
    </div>
  )
}
