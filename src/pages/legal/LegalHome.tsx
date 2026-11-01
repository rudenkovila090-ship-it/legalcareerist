import { Link } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { openCookieSettings } from '../../lib/metrika'
import { legalGroups } from '../../data/legalDocs'

// /legal — все юридические документы сайта одним списком. В подвалах сайта на эту страницу ведёт одна ссылка.
const cardClass = 'glass flex h-full min-w-0 flex-col gap-1.5 rounded-xl p-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'

export default function LegalHome() {
  useDocumentTitle('Юридические документы')
  return (
    <div>
      <PageHero eyebrow="Документы" title="Юридические документы" description="Политика, согласия и оферты. Каждый документ открывается целиком, без сокращений." />
      <div className="container-page space-y-10 py-12">
        {legalGroups.map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink/40">{group.title}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.docs.map((d) => (
                <Link key={d.to} to={d.to} className={cardClass}>
                  <span className="font-semibold leading-snug">{d.title}</span>
                  <span className="text-sm text-ink/60">{d.note}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <section aria-label="Cookie">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink/40">Cookie</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <button type="button" onClick={openCookieSettings} className={cardClass}>
              <span className="font-semibold leading-snug">Настройки cookie</span>
              <span className="text-sm text-ink/60">Согласие на cookie Яндекс Метрики можно изменить или отозвать в любой момент</span>
            </button>
          </div>
        </section>

        <p className="text-sm text-ink/60">
          Вопросы по документам, обработке данных и отзыв согласий:{' '}
          <a className="underline hover:text-ink" href="mailto:info@legalcareerist.ru">info@legalcareerist.ru</a>.
        </p>
      </div>
    </div>
  )
}
