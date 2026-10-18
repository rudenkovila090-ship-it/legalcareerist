import PageHero from './PageHero'
import PdfDocument, { type PdfFile } from './PdfDocument'
import { useDocumentTitle } from '../lib/useDocumentTitle'

// Страница оферты на лонглист: PDF без изменений. У каждого лонглиста своя оферта и свой адрес (см. src/pages/legal/Offer*.tsx).
// Ссылка на оферту стоит в карточке материала на сайте и в боте — поле offerPath у материала в src/data/materials.ts.
export default function OfferPage({ doc, heading, title, date }: { doc: PdfFile; heading: string; title: string; date: string }) {
  useDocumentTitle(heading)
  return (
    <div>
      <PageHero eyebrow="Документы" title={heading} description={`Редакция от ${date} г. Документ целиком, без сокращений.`} />
      <PdfDocument
        doc={doc}
        title={title}
        note={
          <>
            Вопросы по оплате и возврату: <a className="underline hover:text-ink" href="mailto:info@legalcareerist.ru">info@legalcareerist.ru</a> или Telegram <a className="underline hover:text-ink" href="https://t.me/rudenkovrd" target="_blank" rel="noopener">@rudenkovrd</a>.
          </>
        }
      />
    </div>
  )
}
