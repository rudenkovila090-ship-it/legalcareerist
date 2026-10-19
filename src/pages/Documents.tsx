import { Link } from 'react-router-dom'
import PageHero from '../components/PageHero'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const legalDocs = [
  { to: '/legal/privacy', title: 'Политика обработки персональных данных' },
  { to: '/legal/consent', title: 'Согласие на обработку персональных данных' },
  { to: '/legal/consent-publication', title: 'Согласие на распространение персональных данных (публикация отзыва)' },
  { to: '/legal/marketing-consent', title: 'Согласие на получение рекламных и информационных материалов' },
  { to: '/legal/offer', title: 'Оферта на Лонглист «Студенческие юридические мероприятия»' },
  { to: '/legal/offer-longlist-yuridicheskie-meropriyatiya', title: 'Оферта на Лонглист «Юридические мероприятия»' },
  { to: '/legal/offer-gaid-kariera-yurista-v-notariate', title: 'Оферта на Гайд «Карьера юриста в нотариате»' },
  { to: '/legal/offer-gaid-stipendii-i-granty', title: 'Оферта на Гайд «Стипендии и гранты»' },
  { to: '/legal/offer-legal-night-jazz-2', title: 'Оферта мероприятия «Джазовый вечер для юристов 2»' },
]

export default function Documents({
  eyebrow = 'Мероприятия',
  description = 'Договоры, правила участия и другие документы мероприятий.',
  /** Вместо пустой заглушки — ячейки с юридическими документами (см. /community/documents). */
  legalLinks = false,
}: { eyebrow?: string; description?: string; legalLinks?: boolean } = {}) {
  useDocumentTitle('Документы')
  return (
    <div>
      <PageHero eyebrow={eyebrow} title="Документы" description={description} />
      <div className="container-page py-12">
        {legalLinks ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {legalDocs.map((d) => (
              <Link key={d.to} to={d.to} className="glass block rounded-xl p-5">
                <div className="font-semibold leading-snug">{d.title}</div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-ink/15 p-10 text-center text-sm text-ink/30">
            Временно недоступно. В разработке.
          </div>
        )}
      </div>
    </div>
  )
}
